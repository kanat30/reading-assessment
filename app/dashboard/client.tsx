"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { nanoid } from "nanoid";
import { createClient } from "@/lib/supabase/browser";
import { MiniWaveform } from "@/components/MiniWaveform";
import { SessionReport } from "@/components/SessionReport";
import { formatContextualTime } from "@/lib/format/time";

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
  students: Student;
  assessments: SessionAssessment;
}

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  school_id: string;
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

interface DashboardClientProps {
  teacher: Teacher;
  school: School;
  sessions: Session[];
  classLabels: string[];
  passages: Passage[];
}

type CreateStep = "closed" | "passage" | "questions" | "label" | "done";

export function DashboardClient({
  teacher,
  school,
  sessions: initialSessions,
  classLabels: initialClassLabels,
  passages,
}: DashboardClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeFilter = searchParams.get("class") || "all";

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

  // Question management state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isSavingQuestions, setIsSavingQuestions] = useState(false);
  const [questionsModified, setQuestionsModified] = useState(false);

  const supabase = createClient();

  // Filter sessions by class label
  const filteredSessions =
    activeFilter === "all"
      ? sessions
      : sessions.filter(
          (s) =>
            s.assessments.class_label?.toLowerCase().replace(/\s+/g, "-") ===
            activeFilter
        );

  // Handle class filter change
  const handleFilterChange = (label: string) => {
    const slug = label === "all" ? "all" : label.toLowerCase().replace(/\s+/g, "-");
    if (slug === "all") {
      router.push("/dashboard", { scroll: false });
    } else {
      router.push(`/dashboard?class=${slug}`, { scroll: false });
    }
  };

  // Handle row click (expand/collapse)
  const handleRowClick = (sessionId: string) => {
    setExpandedSessionId((prev) => (prev === sessionId ? null : sessionId));
  };

  // Handle escape key to collapse expanded row
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expandedSessionId) {
        setExpandedSessionId(null);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [expandedSessionId]);

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

  const handleCreateAssessment = async () => {
    if (!selectedPassage || !classLabel.trim()) return;

    setIsCreating(true);
    const shareToken = nanoid(16);

    const { data, error } = await supabase
      .from("assessments")
      .insert({
        school_id: school.id,
        teacher_id: teacher.id,
        passage_id: selectedPassage.id,
        class_label: classLabel.trim(),
        share_token: shareToken,
        mode: "screening", // Default value - mode selection removed from UI
      })
      .select()
      .single();

    setIsCreating(false);

    if (error) {
      console.error("Error creating assessment:", error);
      return;
    }

    setGeneratedToken(shareToken);
    // Add new class label if it doesn't exist
    if (!classLabels.includes(classLabel.trim())) {
      setClassLabels((prev) => [...prev, classLabel.trim()]);
    }
    setCreateStep("done");
  };

  const handleCopyLink = async () => {
    if (!generatedToken) return;
    const url = `${window.location.origin}/read/${generatedToken}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const closePanel = () => {
    setCreateStep("closed");
    setSelectedPassage(null);
    setClassLabel("");
    setGeneratedToken(null);
    setQuestions([]);
    setQuestionsModified(false);
    setCopied(false);
  };

  const shareUrl = generatedToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/read/${generatedToken}`
    : "";

  return (
    <div className="min-h-screen bg-paper">
      {/* Main content */}
      <div className="max-w-[1100px] mx-auto px-12 py-16 max-lg:px-6">
        {/* School name - minimal chrome */}
        <p className="text-sm text-stone tracking-wide lowercase mb-8">
          {school.name}
        </p>

        {/* Empty state */}
        {sessions.length === 0 ? (
          <div className="py-12">
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
                  onClick={() => setCreateStep("passage")}
                  className="bg-accent-blue text-paper px-6 py-3 rounded-lg text-base font-medium hover:bg-accent-blue/90 transition-colors"
                >
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
            {/* Headline */}
            <h1 className="font-serif text-[32px] font-semibold text-ink mb-4">
              Readings
            </h1>

            {/* Class label filter */}
            <div className="flex items-center gap-1 text-sm mb-8 flex-wrap">
              <button
                onClick={() => handleFilterChange("all")}
                className={`transition-colors duration-120 ${
                  activeFilter === "all"
                    ? "text-ink font-medium"
                    : "text-stone hover:text-ink"
                }`}
              >
                all
              </button>
              {classLabels.map((label, idx) => (
                <span key={label} className="flex items-center">
                  <span className="text-mist mx-2">·</span>
                  <button
                    onClick={() => handleFilterChange(label)}
                    className={`transition-colors duration-120 ${
                      activeFilter === label.toLowerCase().replace(/\s+/g, "-")
                        ? "text-ink font-medium"
                        : "text-stone hover:text-ink"
                    }`}
                  >
                    {label}
                  </button>
                </span>
              ))}
              {/* Create new button - inline with filters */}
              <span className="text-mist mx-2">·</span>
              <button
                onClick={() => setCreateStep("passage")}
                className="text-accent-blue hover:text-accent-blue/80 transition-colors duration-120"
              >
                + new
              </button>
            </div>

            {/* Two-column: readings list + quick tips (hide sidebar when expanded) */}
            <div className={`grid gap-8 items-start ${
              expandedSessionId
                ? "grid-cols-1"
                : "grid-cols-1 lg:grid-cols-[1fr_200px]"
            }`}>
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
                        className={`px-4 py-5 rounded-lg transition-all duration-150 ${
                          isExpanded
                            ? "bg-mist/70 ring-1 ring-mist"
                            : hoveredRowId === session.id
                            ? "bg-mist/40 cursor-pointer"
                            : "hover:bg-mist/20 cursor-pointer"
                        } ${isProcessing ? "cursor-default opacity-70" : ""}`}
                      >
                        <div className="grid grid-cols-[1fr_80px_auto] gap-4 items-center">
                          {/* Left: name + meta */}
                          <div className="min-w-0">
                            <p className="text-lg font-medium text-ink truncate">
                              {student.first_name} {student.last_name}
                            </p>
                            <p className="text-sm text-stone truncate">
                              {assessment.class_label} · {passage.title}
                            </p>
                          </div>

                          {/* Middle: waveform */}
                          <div className="flex justify-center">
                            {isProcessing ? (
                              <div className="w-20 h-6 flex items-center justify-center">
                                <div className="w-4 h-4 border-2 border-mist border-t-stone rounded-full animate-spin" />
                              </div>
                            ) : (
                              <MiniWaveform
                                peaks={peaks}
                                isHovered={hoveredRowId === session.id}
                              />
                            )}
                          </div>

                          {/* Right: time */}
                          <div className="text-sm text-stone text-right whitespace-nowrap">
                            {isProcessing ? (
                              <span className="text-xs">Scoring...</span>
                            ) : (
                              formatContextualTime(session.scored_at || session.created_at)
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

            {/* Quick tips sidebar - hidden when report is expanded */}
            {!expandedSessionId && (
              <div className="hidden lg:block">
                <div className="sticky top-8 text-sm text-stone space-y-3">
                  <p className="font-medium text-ink text-xs uppercase tracking-wide mb-2">Quick tips</p>
                  <p>Click a row to see the full report</p>
                  <p>Filter by class using the tabs above</p>
                  <p>New readings appear automatically</p>
                </div>
              </div>
            )}
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
                {/* Step 1: Pick passage */}
                {createStep === "passage" && (
                  <div>
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
                      <div className="flex items-center justify-center py-16">
                        <div className="w-6 h-6 border-2 border-mist border-t-accent-blue rounded-full animate-spin" />
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
                              <span className="w-4 h-4 border-2 border-mist border-t-accent-blue rounded-full animate-spin" />
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
                            <span className="w-3 h-3 border-2 border-mist border-t-accent-blue rounded-full animate-spin" />
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

                {/* Step 3: Class label */}
                {createStep === "label" && (
                  <div>
                    <button
                      onClick={() => setCreateStep("questions")}
                      className="text-sm text-stone hover:text-ink mb-6"
                    >
                      ← Back
                    </button>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-8">
                      Class label
                    </h2>
                    <input
                      value={classLabel}
                      onChange={(e) => setClassLabel(e.target.value)}
                      placeholder="e.g., Period 3 ELA"
                      className="w-full p-4 rounded-lg border border-mist bg-paper text-ink text-sm placeholder:text-stone focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                      autoFocus
                    />
                    {/* Existing class labels as chips */}
                    {classLabels.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-4">
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
                    <button
                      onClick={handleCreateAssessment}
                      disabled={!classLabel.trim() || isCreating}
                      className="w-full bg-accent-blue text-paper py-4 rounded-lg font-medium hover:bg-accent-blue/90 disabled:opacity-50 transition-colors mt-8"
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
                      Send this to your students. They don&apos;t need to log in — they&apos;ll just type their name.
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
    </div>
  );
}
