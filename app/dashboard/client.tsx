"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/browser";
import { MiniWaveform } from "@/components/MiniWaveform";
import { ReportSkeleton } from "@/components/skeletons/ReportSkeleton";
import { formatContextualTime } from "@/lib/format/time";
import { QuickActionsMenu, StatusDot, ReviewStatus } from "@/components/QuickActionsMenu";
import { NotePanel } from "@/components/NotePanel";
import { ReviewPromptModal } from "@/components/ReviewPromptModal";
import { ReadingLevelSelector, PassageCountSelector, PassageSelector } from "@/components/assessment";
import {
  ReadingLevel,
  Passage as LibraryPassage,
  getPassageById,
  detectAssessmentPeriod,
  getAssessmentPeriodLabel,
} from "@/lib/passages/library";

// Dynamic import for SessionReport with skeleton loading
const SessionReport = dynamic(() => import("@/components/SessionReport").then(m => ({ default: m.SessionReport })), {
  loading: () => <ReportSkeleton />,
});

// Dynamic import for CommandPalette (teacher-only)
const CommandPalette = dynamic(() => import("@/components/CommandPalette").then(m => ({ default: m.CommandPalette })), {
  ssr: false,
});

// Types
interface Passage {
  id: string;
  title: string;
  text: string;
  grade_band: string;
  word_count: number;
  source_attribution?: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

interface AssessmentPassage {
  id: string;
  title: string;
  grade_band: string;
}

interface SessionAssessment {
  id: string;
  class_label: string;
  school_id: string;
  passages: AssessmentPassage;
}

interface SessionScoresJson {
  waveform_peaks?: number[];
  metrics?: {
    wcpm: number;
    accuracy_percent: number;
  };
  [key: string]: unknown;
}

interface Session {
  id: string;
  status: string;
  scored_at: string | null;
  created_at: string;
  duration_seconds: number;
  scores_json: SessionScoresJson | null;
  teacher_review_status: ReviewStatus;
  has_note: boolean;
  students: Student;
  assessments: SessionAssessment;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  school_id: string;
  role?: string;
}

interface School {
  id: string;
  name: string;
}

interface Question {
  id?: string;
  question: string;
  question_type: "literal" | "inferential";
}

interface Template {
  id: string;
  name: string;
  passage_id: string;
  questions: Question[];
  created_at: string;
  passages: {
    id: string;
    title: string;
    grade_band: string;
    word_count: number;
  };
}

interface ActiveAssessment {
  id: string;
  share_token: string;
  class_label: string;
  created_at: string;
  expires_at: string | null;
  use_numbered_students: boolean;
  expected_student_count: number | null;
  passages: {
    id: string;
    title: string;
    grade_band: string;
  };
}

interface DashboardClientProps {
  teacher: Teacher;
  school: School;
  sessions: Session[];
  classLabels: string[];
  passages: Passage[];
  templates: Template[];
  activeAssessments: ActiveAssessment[];
}

// "passage" and "questions" are for legacy template flow; "level", "count", "passages" are for new library flow
type CreateStep = "closed" | "choose" | "level" | "count" | "passages" | "passage" | "questions" | "label" | "done";
type PassageCount = 1 | 3;
type ExpirationDuration = "none" | "1h" | "1d" | "1w" | "1m";

export function DashboardClient({
  teacher,
  school,
  sessions: initialSessions,
  classLabels: initialClassLabels,
  passages,
  templates: initialTemplates,
  activeAssessments: initialActiveAssessments,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local state for filters — initialized from URL for refresh support, but updated
  // instantly without router.push() to avoid full server re-renders.
  const [activeFilter, setActiveFilter] = useState(searchParams.get("class") || "all");
  const [activeDateFilter, setActiveDateFilter] = useState(searchParams.get("date") || "week");

  const [sessions, setSessions] = useState(initialSessions);
  const [classLabels, setClassLabels] = useState(initialClassLabels);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

  // Assessment creation state
  const [createStep, setCreateStep] = useState<CreateStep>("closed");
  const [selectedPassage, setSelectedPassage] = useState<Passage | null>(null);
  const [classLabel, setClassLabel] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // New passage library state
  const [selectedReadingLevel, setSelectedReadingLevel] = useState<ReadingLevel | null>(null);
  const [passageCount, setPassageCount] = useState<PassageCount>(3);
  const [selectedPassageIds, setSelectedPassageIds] = useState<string[]>([]);
  const assessmentPeriod = detectAssessmentPeriod();

  // Question management state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isSavingQuestions, setIsSavingQuestions] = useState(false);
  const [questionsModified, setQuestionsModified] = useState(false);

  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(teacher.full_name || "");
  const [isSavingName, setIsSavingName] = useState(false);

  // Delete confirmation state
  const [deleteSession, setDeleteSession] = useState<Session | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Templates state
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [showTemplatesPanel, setShowTemplatesPanel] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editTemplateName, setEditTemplateName] = useState("");
  const [isUpdatingTemplate, setIsUpdatingTemplate] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);

  // Link expiration state
  const [expirationDuration, setExpirationDuration] = useState<ExpirationDuration>("none");

  // Active assessments panel state
  const [activeAssessments, setActiveAssessments] = useState(initialActiveAssessments);
  const [showActiveAssessmentsPanel, setShowActiveAssessmentsPanel] = useState(false);
  const [copiedAssessmentId, setCopiedAssessmentId] = useState<string | null>(null);

  // Class filter dropdown state
  const [showClassDropdown, setShowClassDropdown] = useState(false);

  // Quick-tips popover (replaces the always-on sidebar)
  const [showTips, setShowTips] = useState(false);

  // "New assessment" — templates collapsed below the leveled library by default
  const [showChooseTemplates, setShowChooseTemplates] = useState(false);

  // Numbered students state
  const [useNumberedStudents, setUseNumberedStudents] = useState(false);
  const [expectedStudentCount, setExpectedStudentCount] = useState(20);

  // Review status workflow state
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");
  const [hasNotesFilter, setHasNotesFilter] = useState(false);
  const [viewedSessionIds] = useState<Set<string>>(() => new Set());
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const [reviewPromptSession, setReviewPromptSession] = useState<Session | null>(null);

  // Note panel state
  const [noteSession, setNoteSession] = useState<Session | null>(null);
  const [noteText, setNoteText] = useState("");

  const supabase = createClient();

  // Filter sessions by class label and date
  const filterSessionsByDate = (sessions: Session[]) => {
    if (activeDateFilter === "all") return sessions;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday

    return sessions.filter((s) => {
      const sessionDate = new Date(s.scored_at || s.created_at);
      if (activeDateFilter === "today") {
        return sessionDate >= startOfToday;
      } else if (activeDateFilter === "week") {
        return sessionDate >= startOfWeek;
      }
      return true;
    });
  };

  // Apply class + status + notes filters first — everything *except* the date window.
  const scopedSessions = (
    activeFilter === "all"
      ? sessions
      : sessions.filter(
          (s) =>
            s.assessments.class_label?.toLowerCase().replace(/\s+/g, "-") ===
            activeFilter
        )
  ).filter((s) => {
    // Apply status filter
    if (statusFilter !== "all" && s.teacher_review_status !== statusFilter) {
      return false;
    }
    // Apply has notes filter
    if (hasNotesFilter && !s.has_note) {
      return false;
    }
    return true;
  });

  // Then apply the date window — this is what the "view all" link reveals.
  const filteredSessions = filterSessionsByDate(scopedSessions);
  const hiddenByDate = scopedSessions.length - filteredSessions.length;
  const newCount = filteredSessions.filter(
    (s) => s.teacher_review_status === "new"
  ).length;
  const scopeLabel =
    activeDateFilter === "today"
      ? "today"
      : activeDateFilter === "week"
      ? "this week"
      : "in total";

  // Handle class filter change (preserves date filter)
  // Uses local state + history.replaceState() for instant updates without server round-trip.
  const handleFilterChange = (label: string) => {
    const slug = label === "all" ? "all" : label.toLowerCase().replace(/\s+/g, "-");
    setActiveFilter(slug);

    // Sync URL for bookmarks/refresh, but don't trigger navigation
    const params = new URLSearchParams();
    if (slug !== "all") params.set("class", slug);
    if (activeDateFilter !== "all") params.set("date", activeDateFilter);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/dashboard?${query}` : "/dashboard");
    setShowClassDropdown(false);
  };

  // Get selected class label for display
  const getSelectedClassLabel = () => {
    if (activeFilter === "all") return "All classes";
    const found = classLabels.find(
      (label) => label.toLowerCase().replace(/\s+/g, "-") === activeFilter
    );
    return found || "All classes";
  };

  // Handle date filter change (preserves class filter)
  // Uses local state + history.replaceState() for instant updates without server round-trip.
  const handleDateFilterChange = (dateFilter: string) => {
    setActiveDateFilter(dateFilter);

    // Sync URL for bookmarks/refresh, but don't trigger navigation
    const params = new URLSearchParams();
    if (activeFilter !== "all") params.set("class", activeFilter);
    if (dateFilter !== "all") params.set("date", dateFilter);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/dashboard?${query}` : "/dashboard");
  };

  // Handle row click (expand/collapse)
  const handleRowClick = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);

    // If we're collapsing an expanded session
    if (expandedSessionId === sessionId) {
      // Check if this was a 'new' session that we viewed for the first time
      if (session && session.teacher_review_status === "new" && viewedSessionIds.has(sessionId)) {
        // Show the review prompt
        setReviewPromptSession(session);
        setShowReviewPrompt(true);
      }
      setExpandedSessionId(null);
    } else {
      // Expanding a new session - track that we've viewed it
      if (session && session.teacher_review_status === "new") {
        viewedSessionIds.add(sessionId);
      }
      setExpandedSessionId(sessionId);
    }
  };

  // Update session status
  const updateSessionStatus = async (sessionId: string, status: ReviewStatus) => {
    try {
      const response = await fetch("/api/session-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, status }),
      });

      if (response.ok) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, teacher_review_status: status } : s
          )
        );
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  // Handle review prompt actions
  const handleMarkReviewed = async () => {
    if (reviewPromptSession) {
      await updateSessionStatus(reviewPromptSession.id, "reviewed");
    }
    setShowReviewPrompt(false);
    setReviewPromptSession(null);
  };

  const handleSkipReview = () => {
    setShowReviewPrompt(false);
    setReviewPromptSession(null);
  };

  // Note handlers
  const handleOpenNote = async (session: Session) => {
    setNoteSession(session);
    // Fetch the current note
    try {
      const response = await fetch(`/api/session-notes?session_id=${session.id}`);
      if (response.ok) {
        const data = await response.json();
        setNoteText(data.note?.note_text || "");
      }
    } catch (error) {
      console.error("Error fetching note:", error);
      setNoteText("");
    }
  };

  const handleSaveNote = async (text: string) => {
    if (!noteSession) return;

    await fetch("/api/session-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: noteSession.id,
        note_text: text,
      }),
    });

    // Update local state to show note icon
    setSessions((prev) =>
      prev.map((s) =>
        s.id === noteSession.id ? { ...s, has_note: true } : s
      )
    );
  };

  const handleDeleteNote = async () => {
    if (!noteSession) return;

    await fetch(`/api/session-notes?session_id=${noteSession.id}`, {
      method: "DELETE",
    });

    // Update local state to remove note icon
    setSessions((prev) =>
      prev.map((s) =>
        s.id === noteSession.id ? { ...s, has_note: false } : s
      )
    );
  };

  // Handle escape key to collapse expanded row and close dropdowns
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTips) setShowTips(false);
        else if (showClassDropdown) setShowClassDropdown(false);
        else if (expandedSessionId) setExpandedSessionId(null);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (showClassDropdown && !target.closest("[data-class-dropdown]")) {
        setShowClassDropdown(false);
      }
      if (showTips && !target.closest("[data-tips]")) {
        setShowTips(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [expandedSessionId, showClassDropdown, showTips]);

  // Realtime subscription for new sessions
  // Falls back to polling if Realtime is unreliable in Vercel serverless
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null;
    let realtimeWorking = false;

    const channel = supabase
      .channel("dashboard-sessions")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sessions",
          filter: "status=eq.complete",
        },
        async (payload) => {
          realtimeWorking = true;
          const sessionId = payload.new.id as string;

          // Fetch full session data with joins
          const { data: newSession } = await supabase
            .from("sessions")
            .select(`
              id,
              status,
              scored_at,
              created_at,
              duration_seconds,
              scores_json,
              students(id, first_name, last_name),
              assessments!inner(
                id,
                class_label,
                school_id,
                passages(id, title, grade_band)
              )
            `)
            .eq("id", sessionId)
            .eq("assessments.school_id", school.id)
            .single();

          if (newSession) {
            setSessions((prev) => {
              // Check if session already exists (update) or is new (prepend)
              const exists = prev.some((s) => s.id === newSession.id);
              if (exists) {
                return prev.map((s) =>
                  s.id === newSession.id ? (newSession as unknown as Session) : s
                );
              }
              return [newSession as unknown as Session, ...prev];
            });
          }
        }
      )
      .subscribe();

    // Fallback: Poll every 15 seconds if Realtime isn't working after 5 seconds
    // This handles Vercel serverless environments where Realtime can be flaky
    setTimeout(() => {
      if (!realtimeWorking) {
        console.log("Realtime not detected, falling back to 15s polling");
        pollInterval = setInterval(async () => {
          const { data: freshSessions } = await supabase
            .from("sessions")
            .select(`
              id,
              status,
              scored_at,
              created_at,
              duration_seconds,
              scores_json,
              students(id, first_name, last_name),
              assessments!inner(
                id,
                class_label,
                school_id,
                passages(id, title, grade_band)
              )
            `)
            .eq("assessments.school_id", school.id)
            .in("status", ["complete", "processing"])
            .order("scored_at", { ascending: false, nullsFirst: false });

          if (freshSessions) {
            setSessions(freshSessions as unknown as Session[]);
          }
        }, 15000);
      }
    }, 5000);

    return () => {
      channel.unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [supabase, school.id]);

  // Question management
  const loadExistingQuestions = useCallback(async (passageId: string) => {
    setIsLoadingQuestions(true);
    try {
      const response = await fetch(`/api/passage-questions?passage_id=${passageId}`);
      const data = await response.json();
      if (data.questions && data.questions.length > 0) {
        setQuestions(data.questions);
      } else {
        setQuestions([]);
      }
    } catch (error) {
      console.error("Error loading questions:", error);
      setQuestions([]);
    }
    setIsLoadingQuestions(false);
  }, []);

  useEffect(() => {
    if (selectedPassage && createStep === "questions") {
      loadExistingQuestions(selectedPassage.id);
    }
  }, [selectedPassage, createStep, loadExistingQuestions]);

  const handleGenerateQuestions = async () => {
    if (!selectedPassage) return;
    setIsGeneratingQuestions(true);
    try {
      const response = await fetch("/api/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passage_id: selectedPassage.id }),
      });
      const data = await response.json();
      if (data.questions) {
        setQuestions(data.questions);
        setQuestionsModified(true);
      }
    } catch (error) {
      console.error("Error generating questions:", error);
    }
    setIsGeneratingQuestions(false);
  };

  const handleCreateEmptyQuestions = () => {
    setQuestions([
      { question: "", question_type: "literal" },
      { question: "", question_type: "literal" },
      { question: "", question_type: "inferential" },
    ]);
    setQuestionsModified(true);
  };

  const handleQuestionChange = (index: number, field: keyof Question, value: string) => {
    setQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, [field]: value } : q))
    );
    setQuestionsModified(true);
  };

  const handleSaveQuestions = async () => {
    if (!selectedPassage || questions.length === 0) return;

    if (questions.some((q) => !q.question.trim())) {
      return;
    }

    setIsSavingQuestions(true);
    try {
      const response = await fetch("/api/passage-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passage_id: selectedPassage.id,
          questions: questions.map((q) => ({
            question: q.question,
            question_type: q.question_type,
          })),
        }),
      });

      if (response.ok) {
        setQuestionsModified(false);
        setCreateStep("label");
      }
    } catch (error) {
      console.error("Error saving questions:", error);
    }
    setIsSavingQuestions(false);
  };

  const canProceedFromQuestions =
    questions.length === 3 && questions.every((q) => q.question.trim());

  // Calculate expires_at based on selected duration
  const calculateExpiresAt = (duration: ExpirationDuration): string | null => {
    if (duration === "none") return null;
    const now = new Date();
    switch (duration) {
      case "1h":
        return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
      case "1d":
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      case "1w":
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      case "1m":
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return null;
    }
  };

  const handleCreateAssessment = async () => {
    // Support both new flow (passage library) and legacy flow (database passages)
    const usingLibrary = selectedPassageIds.length > 0 && selectedReadingLevel !== null;
    const usingLegacy = selectedPassage !== null;

    if ((!usingLibrary && !usingLegacy) || !classLabel.trim()) return;

    setIsCreating(true);
    const shareToken = nanoid(16);

    // Build insert object - only include optional fields if they have values
    const expiresAt = calculateExpiresAt(expirationDuration);

    // Get first passage info for display (legacy compatibility)
    const firstPassageId = usingLibrary ? selectedPassageIds[0] : selectedPassage?.id;
    const firstPassage = usingLibrary ? getPassageById(selectedPassageIds[0]) : null;

    const { error } = await supabase
      .from("assessments")
      .insert({
        school_id: school.id,
        teacher_id: teacher.id,
        // For legacy compatibility, use first passage as passage_id
        // New system will use passage_ids array
        passage_id: usingLegacy ? selectedPassage!.id : null,
        class_label: classLabel.trim(),
        share_token: shareToken,
        mode: "screening",
        ...(expiresAt && { expires_at: expiresAt }),
        use_numbered_students: useNumberedStudents,
        ...(useNumberedStudents && { expected_student_count: expectedStudentCount }),
        // New passage library fields
        ...(usingLibrary && {
          reading_level: selectedReadingLevel,
          passage_ids: selectedPassageIds,
          assessment_period: assessmentPeriod,
        }),
      })
      .select()
      .single();

    setIsCreating(false);

    if (error) {
      console.error("Error creating assessment:", error.message, error.details, error.hint);
      return;
    }

    setGeneratedToken(shareToken);
    // Add new class label if it doesn't exist
    if (!classLabels.includes(classLabel.trim())) {
      setClassLabels((prev) => [...prev, classLabel.trim()]);
    }

    // Add new assessment to active assessments list
    const displayTitle = usingLibrary
      ? `${firstPassage?.title || "Passage"} ${selectedPassageIds.length > 1 ? `+${selectedPassageIds.length - 1}` : ""}`
      : selectedPassage!.title;
    const displayGradeBand = usingLibrary
      ? `Level ${selectedReadingLevel}`
      : selectedPassage!.grade_band;

    const newAssessment: ActiveAssessment = {
      id: crypto.randomUUID(), // Temporary ID, will be refreshed on next page load
      share_token: shareToken,
      class_label: classLabel.trim(),
      created_at: new Date().toISOString(),
      expires_at: calculateExpiresAt(expirationDuration),
      use_numbered_students: useNumberedStudents,
      expected_student_count: useNumberedStudents ? expectedStudentCount : null,
      passages: {
        id: firstPassageId || "",
        title: displayTitle,
        grade_band: displayGradeBand,
      },
    };
    setActiveAssessments((prev) => [newAssessment, ...prev]);

    setCreateStep("done");
  };

  const handleCopyLink = async () => {
    if (!generatedToken) return;
    const url = `${window.location.origin}/read/${generatedToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Copy assessment link from active assessments panel
  const handleCopyAssessmentLink = async (assessment: ActiveAssessment) => {
    const url = `${window.location.origin}/read/${assessment.share_token}`;
    await navigator.clipboard.writeText(url);
    setCopiedAssessmentId(assessment.id);
    setTimeout(() => setCopiedAssessmentId(null), 1500);
  };

  // Check if assessment link is expired
  const isAssessmentExpired = (assessment: ActiveAssessment) => {
    if (!assessment.expires_at) return false;
    return new Date(assessment.expires_at) < new Date();
  };

  // Format expiration time
  const formatExpiration = (assessment: ActiveAssessment) => {
    if (!assessment.expires_at) return "Never expires";
    const expiresAt = new Date(assessment.expires_at);
    const now = new Date();
    if (expiresAt < now) return "Expired";

    const diff = expiresAt.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `Expires in ${days}d`;
    if (hours > 0) return `Expires in ${hours}h`;
    return "Expires soon";
  };

  const closePanel = () => {
    setCreateStep("closed");
    setSelectedPassage(null);
    setClassLabel("");
    setGeneratedToken(null);
    setQuestions([]);
    setQuestionsModified(false);
    setCopied(false);
    setSelectedTemplate(null);
    setTemplateName("");
    setExpirationDuration("none");
    setUseNumberedStudents(false);
    setExpectedStudentCount(20);
    // Reset new passage library state
    setSelectedReadingLevel(null);
    setPassageCount(3);
    setSelectedPassageIds([]);
  };

  // Handle template selection - pre-fills passage and questions
  const handleSelectTemplate = (template: Template) => {
    setSelectedTemplate(template);
    // Find the full passage object from passages array
    const passage = passages.find((p) => p.id === template.passage_id);
    if (passage) {
      setSelectedPassage(passage);
      setQuestions(template.questions);
      // Skip to label step since passage and questions are pre-filled
      setCreateStep("label");
    }
  };

  // Save current assessment as a template
  const handleSaveAsTemplate = async () => {
    if (!selectedPassage || !templateName.trim() || questions.length === 0) return;

    setIsSavingTemplate(true);
    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          passage_id: selectedPassage.id,
          questions: questions.map((q) => ({
            question: q.question,
            question_type: q.question_type,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates((prev) => [data.template, ...prev]);
        setTemplateName("");
      }
    } catch (error) {
      console.error("Error saving template:", error);
    }
    setIsSavingTemplate(false);
  };

  // Update template name
  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !editTemplateName.trim()) return;

    setIsUpdatingTemplate(true);
    try {
      const response = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTemplate.id,
          name: editTemplateName.trim(),
        }),
      });

      if (response.ok) {
        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingTemplate.id ? { ...t, name: editTemplateName.trim() } : t
          )
        );
        setEditingTemplate(null);
        setEditTemplateName("");
      }
    } catch (error) {
      console.error("Error updating template:", error);
    }
    setIsUpdatingTemplate(false);
  };

  // Delete template
  const handleDeleteTemplate = async (templateId: string) => {
    setDeletingTemplateId(templateId);
    try {
      const response = await fetch(`/api/templates?id=${templateId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
      }
    } catch (error) {
      console.error("Error deleting template:", error);
    }
    setDeletingTemplateId(null);
  };

  const shareUrl = generatedToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/read/${generatedToken}`
    : "";

  // Save name handler
  const handleSaveName = async () => {
    if (!tempName.trim() || tempName.trim() === teacher.full_name) {
      setEditingName(false);
      return;
    }

    setIsSavingName(true);
    const { error } = await supabase
      .from("teachers")
      .update({ full_name: tempName.trim() })
      .eq("id", teacher.id);

    // Note: After saving, the page will need a refresh to show the updated name
    // since teacher is a prop. The database update is persisted.
    setIsSavingName(false);
    setEditingName(false);
  };

  // Sign out handler
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  // Delete session handler
  const handleDeleteSession = async () => {
    if (!deleteSession || deleteConfirmText.toLowerCase() !== "delete") return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/sessions/${deleteSession.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== deleteSession.id));
        setDeleteSession(null);
        setDeleteConfirmText("");
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("Delete failed:", response.status, errorData);
        alert(`Failed to delete: ${errorData.error || response.statusText}`);
      }
    } catch (error) {
      console.error("Error deleting session:", error);
      alert("Failed to delete session. Please try again.");
    }
    setIsDeleting(false);
  };

  const openDeleteConfirm = (session: Session, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteSession(session);
    setDeleteConfirmText("");
  };

  const closeDeleteConfirm = () => {
    setDeleteSession(null);
    setDeleteConfirmText("");
  };

  return (
    <div className="min-h-screen bg-paper">
      {/* Main content */}
      <div className="max-w-[1100px] mx-auto px-12 py-16 max-lg:px-6">
        {/* Header bar */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <p className="text-sm text-stone tracking-wide lowercase">
              {school.name}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {teacher.role === "admin" && (
              <a
                href="/admin"
                className="text-xs font-medium bg-accent-blue/10 text-accent-blue px-2 py-1 rounded hover:bg-accent-blue/20 transition-colors"
              >
                Admin
              </a>
            )}
            <p className="text-sm text-ink">
              {teacher.full_name}
            </p>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-stone hover:text-ink hover:bg-mist/50 transition-colors"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Empty state */}
        {sessions.length === 0 ? (
          <div className="py-8">
            {/* Welcome header */}
            <div className="mb-12">
              <h1 className="font-serif text-[32px] font-semibold text-ink mb-2">
                Welcome, {teacher.full_name?.split(" ")[0] || "Teacher"}
              </h1>
              <p className="text-stone">
                Your student readings will appear here as they complete assessments.
              </p>
            </div>

            {/* Two-column layout: empty state + getting started */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
              {/* Left: Empty state */}
              <div className="border border-mist rounded-xl p-10 text-center">
                <p className="font-serif text-2xl text-stone italic mb-3">
                  No readings yet
                </p>
                <p className="text-sm text-stone mb-6">
                  Once students complete their readings, they&apos;ll appear here for review.
                </p>
                <button
                  onClick={() => setCreateStep("choose")}
                  className="inline-flex items-center gap-2 bg-accent-blue text-paper px-6 py-3 rounded-lg text-base font-medium hover:bg-accent-blue/90 transition-colors shadow-sm"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Create your first assessment
                </button>
              </div>

              {/* Right: Getting started steps */}
              <div className="bg-mist/40 rounded-xl p-6">
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wide mb-5">
                  Getting Started
                </h2>
                <ol className="space-y-4">
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent-blue text-paper text-sm font-medium flex items-center justify-center">
                      1
                    </span>
                    <div>
                      <p className="font-medium text-ink">Create an assessment</p>
                      <p className="text-sm text-stone">Pick a passage and set comprehension questions</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone/20 text-stone text-sm font-medium flex items-center justify-center">
                      2
                    </span>
                    <div>
                      <p className="font-medium text-ink">Share the link</p>
                      <p className="text-sm text-stone">Send it to students — no login required</p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-stone/20 text-stone text-sm font-medium flex items-center justify-center">
                      3
                    </span>
                    <div>
                      <p className="font-medium text-ink">Review readings</p>
                      <p className="text-sm text-stone">See fluency scores, hear recordings, track progress</p>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Welcome + Headline */}
            <div className="mb-6">
              <p className="text-stone mb-1">
                Welcome back, {teacher.full_name?.split(" ")[0] || "Teacher"}
              </p>
              <div className="flex items-baseline gap-3">
                <h1 className="font-serif text-[32px] font-semibold text-ink">
                  Readings
                </h1>
                {filteredSessions.length > 0 && (
                  <span className="text-sm text-stone">
                    {filteredSessions.length} {scopeLabel}
                    {newCount > 0 && (
                      <>
                        {" · "}
                        <span className="text-accent-blue font-medium">
                          {newCount} new
                        </span>
                      </>
                    )}
                  </span>
                )}

                {/* Quick-tips info popover (replaces the always-on sidebar) */}
                <div className="relative ml-auto self-center" data-tips>
                  <button
                    onClick={() => setShowTips((v) => !v)}
                    className="p-1.5 rounded-lg text-stone hover:text-ink hover:bg-mist/50 transition-colors"
                    title="Tips"
                    aria-label="Tips"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                  </button>
                  <AnimatePresence>
                    {showTips && (
                      <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 mt-2 w-64 bg-paper border border-mist rounded-xl shadow-lg z-30 p-4"
                      >
                        <p className="font-medium text-ink text-xs uppercase tracking-wide mb-3">
                          Quick tips
                        </p>
                        <ul className="text-sm text-stone space-y-2">
                          <li>Click a row to see the full report</li>
                          <li>Filter by class, date, or status above</li>
                          <li>New readings appear automatically</li>
                        </ul>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Single-column readings list (full width — tips moved to header popover) */}
            <div className="grid grid-cols-1">
              {/* Left column: Filters + Sessions */}
              <div>
                {/* Filters row */}
                <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
                  {/* Left side: Class dropdown + Date filters */}
                  <div className="flex items-center gap-4">
                    {/* Class dropdown */}
                    {classLabels.length > 0 && (
                      <div className="relative" data-class-dropdown>
                        <button
                          onClick={() => setShowClassDropdown(!showClassDropdown)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-mist hover:border-stone/40 bg-paper text-sm transition-colors"
                        >
                          <span className={activeFilter === "all" ? "text-stone" : "text-ink font-medium"}>
                            {getSelectedClassLabel()}
                          </span>
                          <svg
                            className={`w-4 h-4 text-stone transition-transform ${showClassDropdown ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Dropdown menu */}
                        <AnimatePresence>
                          {showClassDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -8 }}
                              transition={{ duration: 0.15 }}
                              className="absolute top-full left-0 mt-1 min-w-[160px] bg-paper border border-mist rounded-lg shadow-lg z-20 py-1"
                            >
                              <button
                                onClick={() => handleFilterChange("all")}
                                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                  activeFilter === "all"
                                    ? "bg-mist/50 text-ink font-medium"
                                    : "text-stone hover:bg-mist/30 hover:text-ink"
                                }`}
                              >
                                All classes
                              </button>
                              {classLabels.map((label) => (
                                <button
                                  key={label}
                                  onClick={() => handleFilterChange(label)}
                                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                                    activeFilter === label.toLowerCase().replace(/\s+/g, "-")
                                      ? "bg-mist/50 text-ink font-medium"
                                      : "text-stone hover:bg-mist/30 hover:text-ink"
                                  }`}
                                >
                                  {label}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Date filter pills */}
                    <div className="flex items-center gap-1 text-sm">
                      <button
                        onClick={() => handleDateFilterChange("today")}
                        className={`px-2.5 py-1 rounded transition-colors duration-120 ${
                          activeDateFilter === "today"
                            ? "bg-mist text-ink font-medium"
                            : "text-stone hover:text-ink"
                        }`}
                      >
                        today
                      </button>
                      <button
                        onClick={() => handleDateFilterChange("week")}
                        className={`px-2.5 py-1 rounded transition-colors duration-120 ${
                          activeDateFilter === "week"
                            ? "bg-mist text-ink font-medium"
                            : "text-stone hover:text-ink"
                        }`}
                      >
                        this week
                      </button>
                      <button
                        onClick={() => handleDateFilterChange("all")}
                        className={`px-2.5 py-1 rounded transition-colors duration-120 ${
                          activeDateFilter === "all"
                            ? "bg-mist text-ink font-medium"
                            : "text-stone hover:text-ink"
                        }`}
                      >
                        all time
                      </button>
                    </div>

                    {/* Status filter pills */}
                    <div className="flex items-center gap-1 text-sm border-l border-mist pl-4 ml-2">
                      <button
                        onClick={() => setStatusFilter("all")}
                        className={`px-2.5 py-1 rounded transition-colors duration-120 ${
                          statusFilter === "all"
                            ? "bg-mist text-ink font-medium"
                            : "text-stone hover:text-ink"
                        }`}
                      >
                        all
                      </button>
                      <button
                        onClick={() => setStatusFilter("new")}
                        className={`px-2.5 py-1 rounded transition-colors duration-120 flex items-center gap-1.5 ${
                          statusFilter === "new"
                            ? "bg-mist text-ink font-medium"
                            : "text-stone hover:text-ink"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-accent-blue" />
                        new
                      </button>
                      <button
                        onClick={() => setStatusFilter("flagged")}
                        className={`px-2.5 py-1 rounded transition-colors duration-120 flex items-center gap-1.5 ${
                          statusFilter === "flagged"
                            ? "bg-mist text-ink font-medium"
                            : "text-stone hover:text-ink"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-alert" />
                        flagged
                      </button>
                    </div>

                    {/* Has notes checkbox */}
                    <label className="flex items-center gap-2 text-sm text-stone cursor-pointer hover:text-ink transition-colors ml-2">
                      <input
                        type="checkbox"
                        checked={hasNotesFilter}
                        onChange={(e) => setHasNotesFilter(e.target.checked)}
                        className="w-3.5 h-3.5 rounded border-mist text-accent-blue focus:ring-accent-blue/30"
                      />
                      has notes
                    </label>
                  </div>

                  {/* Right side: Links, Templates, New Assessment */}
                  <div className="flex items-center gap-3">
                    {/* Links button */}
                    {activeAssessments.length > 0 && (
                      <button
                        onClick={() => setShowActiveAssessmentsPanel(true)}
                        className="text-sm text-stone hover:text-ink transition-colors"
                      >
                        Links
                      </button>
                    )}
                    {/* Templates button */}
                    {templates.length > 0 && (
                      <button
                        onClick={() => setShowTemplatesPanel(true)}
                        className="text-sm text-stone hover:text-ink transition-colors"
                      >
                        Templates
                      </button>
                    )}
                    {/* New button - prominent */}
                    <button
                      onClick={() => setCreateStep("choose")}
                      className="flex items-center gap-2 bg-accent-blue text-paper px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent-blue/90 transition-colors shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      New
                    </button>
                  </div>
                </div>

                {/* Sessions list */}
                <div className="space-y-0">
              <AnimatePresence initial={false}>
                {filteredSessions.map((session) => {
                  const student = session.students;
                  const assessment = session.assessments;
                  const passage = assessment.passages;
                  const peaks = session.scores_json?.waveform_peaks;
                  const isExpanded = expandedSessionId === session.id;
                  const isOtherExpanded = expandedSessionId && !isExpanded;
                  const isProcessing = session.status === "processing";

                  return (
                    <motion.div
                      key={session.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{
                        opacity: isOtherExpanded ? 0.4 : 1,
                        height: "auto",
                      }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                      {/* Row */}
                      <div
                        onClick={() => !isProcessing && handleRowClick(session.id)}
                        onMouseEnter={() => setHoveredRowId(session.id)}
                        onMouseLeave={() => setHoveredRowId(null)}
                        className={`px-4 py-2.5 rounded-lg transition-all duration-150 ${
                          isExpanded
                            ? "bg-mist/70 ring-1 ring-mist"
                            : hoveredRowId === session.id
                            ? "bg-mist/40 cursor-pointer"
                            : "hover:bg-mist/20 cursor-pointer"
                        } ${isProcessing ? "cursor-default opacity-70" : ""}`}
                      >
                        <div className="grid grid-cols-[auto_1fr_80px_auto] gap-4 items-center">
                          {/* Status dot */}
                          <div className="flex items-center justify-center w-4">
                            <StatusDot status={session.teacher_review_status} />
                          </div>

                          {/* Left: name + meta + note icon */}
                          <div className="min-w-0 flex items-center gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-medium text-ink truncate">
                                {student.first_name} {student.last_name}
                              </p>
                              <p className="text-xs text-stone truncate">
                                {assessment.class_label} · {passage.title}
                              </p>
                            </div>
                            {/* Note icon */}
                            {session.has_note && (
                              <span
                                className="text-stone/60 flex-shrink-0"
                                title="Has notes"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </span>
                            )}
                          </div>

                          {/* Middle: waveform */}
                          <div className="flex justify-center">
                            {isProcessing ? (
                              <div className="w-20 h-6 flex items-center justify-center">
                                <div className="skeleton-shimmer w-16 h-5 rounded-sm" />
                              </div>
                            ) : (
                              <MiniWaveform
                                peaks={peaks}
                                isHovered={hoveredRowId === session.id}
                              />
                            )}
                          </div>

                          {/* Right: time + quick actions */}
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-stone whitespace-nowrap">
                              {isProcessing ? (
                                <span className="text-xs">Scoring...</span>
                              ) : (
                                formatContextualTime(session.scored_at || session.created_at)
                              )}
                            </span>
                            {/* Quick actions menu - visible on hover */}
                            {hoveredRowId === session.id && !isProcessing && (
                              <QuickActionsMenu
                                sessionId={session.id}
                                currentStatus={session.teacher_review_status}
                                hasNote={session.has_note}
                                onStatusChange={(status) => updateSessionStatus(session.id, status)}
                                onAddNote={() => handleOpenNote(session)}
                                onDelete={() => openDeleteConfirm(session, { stopPropagation: () => {} } as React.MouseEvent)}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded panel */}
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3, ease: "easeOut" }}
                            className="overflow-hidden"
                          >
                            {/* Sheet container - elevated card */}
                            <div className="mt-2 mb-6 bg-[#FDFCFA] border border-mist/60 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.06)] overflow-hidden">
                              {/* Close button row */}
                              <div className="flex justify-end px-6 pt-4 pb-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedSessionId(null);
                                  }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-stone hover:text-ink hover:bg-mist/60 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                  Close
                                </button>
                              </div>

                              {/* Report content */}
                              <div className="px-8 pb-8">
                                <SessionReport sessionId={session.id} />
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
                </div>

                {/* View-all footer when the date window is hiding older readings */}
                {filteredSessions.length > 0 &&
                  hiddenByDate > 0 &&
                  activeDateFilter !== "all" && (
                    <div className="pt-6 text-center">
                      <button
                        onClick={() => handleDateFilterChange("all")}
                        className="text-sm text-stone hover:text-ink transition-colors"
                      >
                        View all {scopedSessions.length} readings →
                      </button>
                    </div>
                  )}

                {/* Empty date-window state — there are readings, just none in this window */}
                {filteredSessions.length === 0 && (
                  <div className="py-16 text-center">
                    <p className="font-serif text-xl text-stone italic mb-2">
                      No readings {scopeLabel === "in total" ? "yet" : scopeLabel}
                    </p>
                    {hiddenByDate > 0 && activeDateFilter !== "all" && (
                      <button
                        onClick={() => handleDateFilterChange("all")}
                        className="text-sm text-accent-blue hover:underline"
                      >
                        View all {scopedSessions.length} readings →
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Assessment creation slide-in panel */}
      <AnimatePresence>
        {createStep !== "closed" && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="fixed inset-0 bg-ink z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed right-0 top-0 bottom-0 w-[480px] max-w-full bg-paper border-l border-mist z-50 overflow-y-auto"
            >
              <div className="px-16 py-12 max-sm:px-6">
                {/* Step 0: Choose template or start fresh */}
                {createStep === "choose" && (
                  <div>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      New assessment
                    </h2>
                    <p className="text-sm text-stone mb-8">
                      Select a reading level, or reuse a saved template.
                    </p>

                    {/* Primary: leveled passage library */}
                    <button
                      onClick={() => setCreateStep("level")}
                      className="w-full text-left p-6 rounded-lg bg-accent-blue/5 hover:bg-accent-blue/10 border border-accent-blue/20 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-lg font-medium text-ink">Leveled passage library</p>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          New
                        </span>
                      </div>
                      <p className="text-sm text-stone">
                        Select reading level and passages for benchmark assessment with built-in comprehension questions
                      </p>
                    </button>

                    {/* Collapsible templates below the primary option */}
                    {templates.length > 0 && (
                      <div className="mt-6 pt-6 border-t border-mist">
                        <button
                          onClick={() => setShowChooseTemplates((v) => !v)}
                          className="flex items-center justify-between w-full text-xs font-medium text-stone uppercase tracking-wide hover:text-ink transition-colors"
                        >
                          <span>Templates ({templates.length})</span>
                          <svg
                            className={`w-4 h-4 transition-transform ${showChooseTemplates ? "rotate-180" : ""}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        <AnimatePresence initial={false}>
                          {showChooseTemplates && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2, ease: "easeOut" }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-3 pt-4">
                                {templates.map((template) => (
                                  <button
                                    key={template.id}
                                    onClick={() => handleSelectTemplate(template)}
                                    className="w-full text-left p-4 rounded-lg border border-mist hover:border-accent-blue hover:bg-mist/30 transition-colors group"
                                  >
                                    <p className="font-medium text-ink group-hover:text-accent-blue">
                                      {template.name}
                                    </p>
                                    <p className="text-sm text-stone mt-1">
                                      {template.passages.title} · {template.passages.word_count} words
                                    </p>
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}

                {/* Step: Select reading level */}
                {createStep === "level" && (
                  <div>
                    <button
                      onClick={() => setCreateStep("choose")}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      Select reading level
                    </h2>
                    <p className="text-sm text-stone mb-6">
                      Choose the reading level for this assessment. Level 4 is typical for struggling middle school readers.
                    </p>

                    <ReadingLevelSelector
                      value={selectedReadingLevel}
                      onChange={(level) => {
                        setSelectedReadingLevel(level);
                        setSelectedPassageIds([]); // Reset passage selection when level changes
                      }}
                    />

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={() => setCreateStep("count")}
                        disabled={selectedReadingLevel === null}
                        className="px-6 py-3 bg-accent-blue text-paper rounded-lg font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Step: Select passage count */}
                {createStep === "count" && (
                  <div>
                    <button
                      onClick={() => setCreateStep("level")}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      How many passages?
                    </h2>
                    <p className="text-sm text-stone mb-2">
                      Assessment period: <span className="font-medium text-ink">{getAssessmentPeriodLabel(assessmentPeriod)}</span>
                    </p>

                    <div className="mt-6">
                      <PassageCountSelector
                        value={passageCount}
                        onChange={(count) => {
                          setPassageCount(count);
                          // Trim selection if needed
                          if (selectedPassageIds.length > count) {
                            setSelectedPassageIds(selectedPassageIds.slice(0, count));
                          }
                        }}
                      />
                    </div>

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={() => setCreateStep("passages")}
                        className="px-6 py-3 bg-accent-blue text-paper rounded-lg font-medium hover:bg-accent-blue/90 transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Step: Select passages from library */}
                {createStep === "passages" && selectedReadingLevel !== null && (
                  <div>
                    <button
                      onClick={() => setCreateStep("count")}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      Select passages
                    </h2>
                    <p className="text-sm text-stone mb-6">
                      Level {selectedReadingLevel} · {passageCount} passage{passageCount > 1 ? "s" : ""} · Each passage includes comprehension questions
                    </p>

                    <PassageSelector
                      level={selectedReadingLevel}
                      maxSelections={passageCount}
                      selected={selectedPassageIds}
                      onChange={setSelectedPassageIds}
                    />

                    <div className="mt-8 flex justify-end">
                      <button
                        onClick={() => setCreateStep("label")}
                        disabled={selectedPassageIds.length !== passageCount}
                        className="px-6 py-3 bg-accent-blue text-paper rounded-lg font-medium hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 1: Pick passage */}
                {createStep === "passage" && (
                  <div>
                    <button
                      onClick={() => setCreateStep("choose")}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-8">
                      Select a passage
                    </h2>
                    <div className="space-y-4">
                      {passages.map((passage) => (
                        <button
                          key={passage.id}
                          onClick={() => {
                            setSelectedPassage(passage);
                            setCreateStep("questions");
                          }}
                          className={`w-full text-left p-6 rounded-lg hover:bg-mist transition-colors group`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <p className="text-lg font-medium text-ink group-hover:text-ink">
                              {passage.title}
                            </p>
                            <span className="text-sm text-stone whitespace-nowrap">
                              {passage.word_count} words
                            </span>
                          </div>
                          <p className="text-sm text-stone mt-1">
                            {passage.source_attribution ? `${passage.source_attribution} · ` : ""}{passage.grade_band}
                          </p>
                          <p className="text-sm text-stone font-serif mt-3 line-clamp-2">
                            {passage.text.slice(0, 120)}...
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2: Comprehension Questions */}
                {createStep === "questions" && (
                  <div>
                    <button
                      onClick={() => setCreateStep("passage")}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      Comprehension questions
                    </h2>
                    <p className="text-sm text-stone mb-8">{selectedPassage?.title}</p>

                    {isLoadingQuestions ? (
                      <div className="flex flex-col items-center justify-center py-16 space-y-4">
                        <div className="skeleton-shimmer h-6 w-48 rounded" />
                        <div className="skeleton-shimmer h-4 w-64 rounded" />
                      </div>
                    ) : questions.length === 0 ? (
                      <div className="space-y-4">
                        <button
                          onClick={handleGenerateQuestions}
                          disabled={isGeneratingQuestions}
                          className="w-full text-left p-6 rounded-lg hover:bg-mist transition-colors disabled:opacity-50"
                        >
                          <p className="text-lg font-medium text-ink flex items-center gap-2">
                            {isGeneratingQuestions && (
                              <span className="skeleton-shimmer w-4 h-4 rounded-full" />
                            )}
                            Generate with AI
                          </p>
                          <p className="text-sm text-stone mt-1">
                            Create 3 age-appropriate questions automatically
                          </p>
                        </button>
                        <button
                          onClick={handleCreateEmptyQuestions}
                          className="w-full text-left p-6 rounded-lg hover:bg-mist transition-colors"
                        >
                          <p className="text-lg font-medium text-ink">Write my own</p>
                          <p className="text-sm text-stone mt-1">
                            Create custom questions manually
                          </p>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {questions.map((q, index) => (
                          <div key={index}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-medium text-stone">
                                Q{index + 1}
                              </span>
                              <select
                                value={q.question_type}
                                onChange={(e) =>
                                  handleQuestionChange(index, "question_type", e.target.value)
                                }
                                className="text-xs px-2 py-1 rounded border border-mist bg-paper text-ink"
                              >
                                <option value="literal">Literal</option>
                                <option value="inferential">Inferential</option>
                              </select>
                            </div>
                            <textarea
                              value={q.question}
                              onChange={(e) =>
                                handleQuestionChange(index, "question", e.target.value)
                              }
                              placeholder="Enter question..."
                              className="w-full p-4 rounded-lg border border-mist bg-paper text-ink text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                              rows={2}
                            />
                          </div>
                        ))}

                        <button
                          onClick={handleGenerateQuestions}
                          disabled={isGeneratingQuestions}
                          className="text-sm text-accent-blue hover:underline disabled:opacity-50 flex items-center gap-1"
                        >
                          {isGeneratingQuestions && (
                            <span className="skeleton-shimmer w-3 h-3 rounded-full" />
                          )}
                          Regenerate with AI
                        </button>

                        <button
                          onClick={
                            questionsModified ? handleSaveQuestions : () => setCreateStep("label")
                          }
                          disabled={!canProceedFromQuestions || isSavingQuestions}
                          className="w-full bg-accent-blue text-paper py-4 rounded-lg font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition-colors mt-8"
                        >
                          {isSavingQuestions
                            ? "Saving..."
                            : questionsModified
                            ? "Save & continue"
                            : "Continue"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Class label + options */}
                {createStep === "label" && (
                  <div>
                    <button
                      onClick={() => {
                        if (selectedTemplate) {
                          // If using template, go back to choose
                          setSelectedTemplate(null);
                          setCreateStep("choose");
                        } else if (selectedPassageIds.length > 0) {
                          // Using new passage library flow
                          setCreateStep("passages");
                        } else {
                          // Legacy flow with database passages
                          setCreateStep("questions");
                        }
                      }}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      Assessment details
                    </h2>
                    {selectedTemplate && (
                      <p className="text-sm text-accent-blue mb-6">
                        Using template: {selectedTemplate.name}
                      </p>
                    )}
                    {selectedPassageIds.length > 0 && selectedReadingLevel !== null && (
                      <p className="text-sm text-accent-blue mb-6">
                        Level {selectedReadingLevel} · {selectedPassageIds.length} passage{selectedPassageIds.length > 1 ? "s" : ""} · {assessmentPeriod}
                      </p>
                    )}

                    {/* Class label */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-ink mb-2">
                        Class label
                      </label>
                      <input
                        value={classLabel}
                        onChange={(e) => setClassLabel(e.target.value)}
                        placeholder="e.g., Period 3 ELA"
                        className="w-full p-4 rounded-lg border border-mist bg-paper text-ink text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                        autoFocus
                      />
                      {/* Existing class labels as chips */}
                      {classLabels.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {classLabels.map((label) => (
                            <button
                              key={label}
                              onClick={() => setClassLabel(label)}
                              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                                classLabel === label
                                  ? "bg-accent-blue/10 text-accent-blue border border-accent-blue"
                                  : "bg-mist text-stone hover:border-accent-blue border border-transparent"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Link expiration */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-ink mb-2">
                        Link expires
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { value: "none", label: "Never" },
                          { value: "1h", label: "1 hour" },
                          { value: "1d", label: "1 day" },
                          { value: "1w", label: "1 week" },
                          { value: "1m", label: "1 month" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setExpirationDuration(option.value as ExpirationDuration)}
                            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                              expirationDuration === option.value
                                ? "bg-accent-blue/10 text-accent-blue border border-accent-blue"
                                : "bg-mist text-stone hover:border-accent-blue border border-transparent"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Numbered students toggle */}
                    <div className="mb-6 p-4 rounded-lg bg-mist/40">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useNumberedStudents}
                          onChange={(e) => setUseNumberedStudents(e.target.checked)}
                          className="mt-1 w-4 h-4 rounded border-mist text-accent-blue focus:ring-accent-blue/30"
                        />
                        <div>
                          <p className="text-sm font-medium text-ink">Use numbered students</p>
                          <p className="text-xs text-stone mt-1">
                            Students select from a dropdown (Student 1, Student 2, etc.) instead of entering their name. Useful for privacy during pilot testing.
                          </p>
                        </div>
                      </label>

                      {/* Student count selector */}
                      {useNumberedStudents && (
                        <div className="mt-4 ml-7">
                          <label className="block text-xs text-stone mb-2">
                            Expected number of students
                          </label>
                          <select
                            value={expectedStudentCount}
                            onChange={(e) => setExpectedStudentCount(parseInt(e.target.value))}
                            className="text-sm px-3 py-2 rounded-lg border border-mist bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                          >
                            {[10, 15, 20, 25, 30, 35, 40].map((count) => (
                              <option key={count} value={count}>
                                {count} students
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleCreateAssessment}
                      disabled={!classLabel.trim() || isCreating}
                      className="w-full bg-accent-blue text-paper py-4 rounded-lg font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
                    >
                      {isCreating ? "Creating..." : "Generate link"}
                    </button>
                  </div>
                )}

                {/* Step 5: Done - show link */}
                {createStep === "done" && (
                  <div>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      Assessment created
                    </h2>
                    <p className="text-sm text-stone mb-8">
                      {useNumberedStudents
                        ? `Send this to your students. They'll select their number (Student 1-${expectedStudentCount}) from a dropdown.`
                        : "Send this to your students. They don't need to log in — they'll just type their name."}
                    </p>
                    <div className="bg-mist rounded-lg p-4 mb-6">
                      <p className="font-mono text-base text-ink break-all">
                        {shareUrl}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className={`w-full py-4 rounded-lg font-medium transition-all duration-150 ${
                        copied
                          ? "bg-success text-paper"
                          : "bg-accent-blue text-paper hover:bg-accent-blue/90"
                      }`}
                    >
                      {copied ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </span>
                      ) : (
                        "Copy link"
                      )}
                    </button>

                    {/* Save as template option - only show if not already using a template */}
                    {!selectedTemplate && (
                      <div className="mt-8 pt-6 border-t border-mist">
                        <p className="text-sm font-medium text-ink mb-3">
                          Save as template for later
                        </p>
                        <div className="flex gap-2">
                          <input
                            value={templateName}
                            onChange={(e) => setTemplateName(e.target.value)}
                            placeholder="Template name..."
                            className="flex-1 px-3 py-2 rounded-lg border border-mist bg-paper text-ink text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                          />
                          <button
                            onClick={handleSaveAsTemplate}
                            disabled={!templateName.trim() || isSavingTemplate}
                            className="px-4 py-2 rounded-lg bg-mist text-ink text-sm font-medium hover:bg-stone/20 disabled:opacity-50 transition-colors"
                          >
                            {isSavingTemplate ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={closePanel}
                      className="w-full text-center text-sm text-stone hover:text-ink mt-6 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Settings slide-in panel */}
      <AnimatePresence>
        {showSettings && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="fixed inset-0 bg-ink z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-paper border-l border-mist z-50 overflow-y-auto"
            >
              <div className="px-8 py-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-serif text-xl font-semibold text-ink">
                    Settings
                  </h2>
                  <button
                    onClick={() => setShowSettings(false)}
                    className="p-2 rounded-lg text-stone hover:text-ink hover:bg-mist/50 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Account section */}
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-medium text-stone uppercase tracking-wide mb-4">
                      Account
                    </p>
                    <div className="space-y-4">
                      {/* Name - editable */}
                      <div>
                        <label className="block text-sm text-stone mb-1">Name</label>
                        {editingName ? (
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={tempName}
                              onChange={(e) => setTempName(e.target.value)}
                              className="flex-1 px-3 py-2 border border-mist rounded-lg text-ink focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                              autoFocus
                            />
                            <button
                              onClick={handleSaveName}
                              disabled={isSavingName}
                              className="px-4 py-2 bg-accent-blue text-paper rounded-lg text-sm hover:bg-accent-blue/90 disabled:opacity-50"
                            >
                              {isSavingName ? "..." : "Save"}
                            </button>
                            <button
                              onClick={() => {
                                setEditingName(false);
                                setTempName(teacher.full_name || "");
                              }}
                              className="px-3 py-2 text-stone hover:text-ink"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <p className="text-ink">{teacher.full_name}</p>
                            <button
                              onClick={() => setEditingName(true)}
                              className="text-sm text-accent-blue hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Email - read only */}
                      <div>
                        <label className="block text-sm text-stone mb-1">Email</label>
                        <p className="text-ink">{teacher.email}</p>
                      </div>

                      {/* Role - read only */}
                      <div>
                        <label className="block text-sm text-stone mb-1">Role</label>
                        <p className="text-ink">Teacher</p>
                      </div>
                    </div>
                  </div>

                  {/* School section */}
                  <div className="pt-4 border-t border-mist">
                    <p className="text-xs font-medium text-stone uppercase tracking-wide mb-4">
                      School
                    </p>
                    <p className="text-ink">{school.name}</p>
                  </div>

                  {/* Sign out */}
                  <div className="pt-6 border-t border-mist">
                    <button
                      onClick={handleSignOut}
                      className="text-sm text-alert hover:underline"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Command Palette (Cmd+K) */}
      <CommandPalette
        onCreateAssessment={() => setCreateStep("choose")}
        sessions={sessions.map(s => ({
          id: s.id,
          students: s.students,
          assessments: { class_label: s.assessments.class_label }
        }))}
      />

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteSession && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={closeDeleteConfirm}
              className="fixed inset-0 bg-ink z-50"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div
                className="bg-paper rounded-xl shadow-xl max-w-md w-full p-6"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="font-serif text-xl font-semibold text-ink mb-2">
                  Delete this reading?
                </h3>
                <p className="text-sm text-stone mb-1">
                  <span className="font-medium text-ink">
                    {deleteSession.students.first_name} {deleteSession.students.last_name}
                  </span>
                  {" · "}
                  {deleteSession.assessments.passages.title}
                </p>
                <p className="text-sm text-stone mb-6">
                  This action cannot be undone. The recording and all data will be permanently removed.
                </p>

                <div className="mb-6">
                  <label className="block text-sm text-stone mb-2">
                    Type <span className="font-mono font-medium text-ink">delete</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    placeholder="delete"
                    className="w-full px-4 py-3 border border-mist rounded-lg text-ink placeholder:text-stone/50 focus:outline-none focus:ring-2 focus:ring-alert/30 focus:border-alert"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && deleteConfirmText.toLowerCase() === "delete") {
                        handleDeleteSession();
                      }
                    }}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={closeDeleteConfirm}
                    className="flex-1 px-4 py-3 rounded-lg text-stone hover:bg-mist transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteSession}
                    disabled={deleteConfirmText.toLowerCase() !== "delete" || isDeleting}
                    className="flex-1 px-4 py-3 rounded-lg bg-alert text-paper font-medium hover:bg-alert/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isDeleting ? "Deleting..." : "Delete permanently"}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Templates management panel */}
      <AnimatePresence>
        {showTemplatesPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowTemplatesPanel(false);
                setEditingTemplate(null);
                setEditTemplateName("");
              }}
              className="fixed inset-0 bg-ink z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed right-0 top-0 bottom-0 w-[480px] max-w-full bg-paper border-l border-mist z-50 overflow-y-auto"
            >
              <div className="px-16 py-12 max-sm:px-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-serif text-xl font-semibold text-ink">
                    Templates
                  </h2>
                  <button
                    onClick={() => {
                      setShowTemplatesPanel(false);
                      setEditingTemplate(null);
                      setEditTemplateName("");
                    }}
                    className="p-2 rounded-lg text-stone hover:text-ink hover:bg-mist/50 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {templates.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-stone">No templates yet.</p>
                    <p className="text-sm text-stone mt-2">
                      Create an assessment and save it as a template.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className="p-4 rounded-lg border border-mist hover:border-stone/30 transition-colors"
                      >
                        {editingTemplate?.id === template.id ? (
                          // Edit mode
                          <div className="space-y-3">
                            <input
                              type="text"
                              value={editTemplateName}
                              onChange={(e) => setEditTemplateName(e.target.value)}
                              className="w-full px-3 py-2 rounded-lg border border-mist bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent-blue/30"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={handleUpdateTemplate}
                                disabled={!editTemplateName.trim() || isUpdatingTemplate}
                                className="px-3 py-1.5 rounded-lg bg-accent-blue text-paper text-sm font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition-colors"
                              >
                                {isUpdatingTemplate ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => {
                                  setEditingTemplate(null);
                                  setEditTemplateName("");
                                }}
                                className="px-3 py-1.5 rounded-lg text-stone hover:text-ink text-sm transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          // View mode
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium text-ink truncate">
                                  {template.name}
                                </p>
                                <p className="text-sm text-stone mt-1">
                                  {template.passages.title} · {template.passages.word_count} words
                                </p>
                                <p className="text-xs text-stone mt-1">
                                  {template.questions.length} questions
                                </p>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    setEditingTemplate(template);
                                    setEditTemplateName(template.name);
                                  }}
                                  className="p-2 rounded-lg text-stone hover:text-ink hover:bg-mist/50 transition-colors"
                                  title="Edit template name"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleDeleteTemplate(template.id)}
                                  disabled={deletingTemplateId === template.id}
                                  className="p-2 rounded-lg text-stone hover:text-alert hover:bg-alert/10 transition-colors disabled:opacity-50"
                                  title="Delete template"
                                >
                                  {deletingTemplateId === template.id ? (
                                    <div className="w-4 h-4 border-2 border-stone/30 border-t-stone rounded-full animate-spin" />
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Active Assessments panel */}
      <AnimatePresence>
        {showActiveAssessmentsPanel && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowActiveAssessmentsPanel(false)}
              className="fixed inset-0 bg-ink z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed right-0 top-0 bottom-0 w-[480px] max-w-full bg-paper border-l border-mist z-50 overflow-y-auto"
            >
              <div className="px-16 py-12 max-sm:px-6">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="font-serif text-xl font-semibold text-ink">
                    Assessment Links
                  </h2>
                  <button
                    onClick={() => setShowActiveAssessmentsPanel(false)}
                    className="p-2 rounded-lg text-stone hover:text-ink hover:bg-mist/50 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <p className="text-sm text-stone mb-6">
                  Copy links to share with students. Expired links are no longer active.
                </p>

                {activeAssessments.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-stone">No assessments yet.</p>
                    <p className="text-sm text-stone mt-2">
                      Create an assessment to get a shareable link.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {activeAssessments.map((assessment) => {
                      const expired = isAssessmentExpired(assessment);
                      const isCopied = copiedAssessmentId === assessment.id;

                      return (
                        <div
                          key={assessment.id}
                          className={`p-4 rounded-lg border transition-colors ${
                            expired
                              ? "border-mist/50 bg-mist/20 opacity-60"
                              : "border-mist hover:border-stone/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-ink truncate">
                                {assessment.class_label}
                              </p>
                              <p className="text-sm text-stone mt-1">
                                {assessment.passages.title}
                              </p>
                              <p className={`text-xs mt-2 ${expired ? "text-alert" : "text-stone"}`}>
                                {formatExpiration(assessment)}
                                {assessment.use_numbered_students && (
                                  <span className="ml-2">· Numbered students</span>
                                )}
                              </p>
                            </div>
                            <button
                              onClick={() => handleCopyAssessmentLink(assessment)}
                              disabled={expired}
                              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                                expired
                                  ? "bg-mist text-stone/50 cursor-not-allowed"
                                  : isCopied
                                  ? "bg-success text-paper"
                                  : "bg-accent-blue text-paper hover:bg-accent-blue/90"
                              }`}
                            >
                              {isCopied ? (
                                <span className="flex items-center gap-1">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Copied
                                </span>
                              ) : (
                                "Copy link"
                              )}
                            </button>
                          </div>

                          {/* Show the actual URL */}
                          {!expired && (
                            <div className="mt-3 p-2 bg-mist/50 rounded text-xs font-mono text-stone break-all">
                              {typeof window !== "undefined" ? window.location.origin : ""}/read/{assessment.share_token}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Note panel */}
      <NotePanel
        sessionId={noteSession?.id || ""}
        studentName={noteSession ? `${noteSession.students.first_name} ${noteSession.students.last_name}` : ""}
        isOpen={noteSession !== null}
        onClose={() => setNoteSession(null)}
        onSave={handleSaveNote}
        onDelete={handleDeleteNote}
        initialNote={noteText}
      />

      {/* Review prompt modal */}
      <ReviewPromptModal
        isOpen={showReviewPrompt}
        studentName={reviewPromptSession ? `${reviewPromptSession.students.first_name} ${reviewPromptSession.students.last_name}` : ""}
        onMarkReviewed={handleMarkReviewed}
        onSkip={handleSkipReview}
      />
    </div>
  );
}
