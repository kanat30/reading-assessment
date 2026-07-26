"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ReportClient } from "./ReportClient";
import { OverridePanel } from "./OverridePanel";
import { AIBadge } from "./AIBadge";
import { DetailedDataPanel } from "./DetailedDataPanel";
import { ReportSkeleton } from "./skeletons/ReportSkeleton";
import { AudioQualityIndicator } from "./AudioQualityIndicator";
import { TeacherNotesSection } from "./TeacherNotesSection";
import { BenchmarkBand } from "./report";
import { useCountUp } from "@/hooks/useCountUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { SessionEvent, SessionEventOverride, EnhancedErrorPattern, EventType, EventOverrideAction, ProsodyDimensions } from "@/lib/scoring/types";
import { getLastReachedIndex } from "@/lib/scoring/metrics";
import { SCORE_REVEAL } from "@/lib/animation/constants";
import { ReadingLevel, AssessmentPeriod, getPassageById } from "@/lib/passages/library";
import { calculateBenchmark, BenchmarkResult } from "@/lib/scoring/benchmark";
import { parseStoredNorms, resolveNorms, describePassageVsGrade } from "@/lib/scoring/norms";
import { deriveProsodyHeadline } from "@/lib/scoring/prosody";

interface SessionReportProps {
  sessionId: string;
}

interface PassageData {
  id: string;
  title: string;
  text: string;
  grade_band: string;
}

interface StudentData {
  first_name: string;
  last_name: string;
}

type ComprehensionStatus = "correct" | "partial" | "incorrect" | "ungraded";

interface ComprehensionAnswer {
  id: string;
  question_id: string;
  student_answer: string;
  is_correct: boolean | null;
  status: ComprehensionStatus | null;
  feedback: string | null;
  expected_answer: string | null;
  passage_questions: {
    id: string;
    question: string;
    question_type: string;
    display_order: number;
  };
}

interface ScoresJson {
  metrics: {
    wcpm: number;
    accuracy_percent: number;
    correct_words: number;
    total_words_attempted: number;
  };
  // The session's resolved norm set (grade/period/cuts/basis), stored once at
  // score time. Absent on sessions scored before 2026-07-26 (backfillable).
  norms?: unknown;
  prosody?: {
    level: number;
    expression: string;
    phrasing: string;
    pace: string;
    explanation?: string;
  };
  prosody_dimensions?: Partial<ProsodyDimensions>;
  comprehension?: {
    score: number | null;
    total: number;
    // Present and "grading" only in the brief window after a student submits,
    // while the teacher-only AI grade runs in the background (see the
    // comprehension route). Reports viewed later never see this.
    status?: string;
    // "ungraded" = AI grading failed; answers preserved, nothing scored.
    grading_status?: string;
  };
  summary: string;
  error_patterns?: EnhancedErrorPattern[];
  avg_confidence: number;
  scoring_duration_seconds: number;
  waveform_peaks?: number[];
}

interface SessionData {
  id: string;
  status: string;
  created_at: string;
  duration_seconds: number;
  audio_url: string | null;
  scores_json: ScoresJson;
  teacher_review_status: string;
  students: StudentData;
  assessments: {
    passages: PassageData;
    reading_level: ReadingLevel | null;
    assessment_period: AssessmentPeriod | null;
    student_grade: number | null;
  };
}

interface Override {
  id: string;
  field_name: string;
  original_value: unknown;
  new_value: unknown;
  reason: string | null;
  created_at: string;
  teachers: { full_name: string };
}

// Raw session row shape returned by the report queries (before transform).
interface RawSessionRow {
  passage_id?: string | null;
  scores_json: unknown;
  students: unknown;
  assessments: unknown;
  teacher_review_status: string | null;
  [key: string]: unknown;
}

// Normalize a fetched session row into SessionData, resolving the passage that was
// actually read. Multi-passage library sessions store the specific passage on
// sessions.passage_id; the assessment's own passages row is only the legacy
// single-passage fallback. Reading straight from the assessment would show the wrong
// passage text (and misaligned error highlights) for library sessions.
function transformSessionRow(row: RawSessionRow): SessionData {
  const assessments = row.assessments as {
    passages: PassageData;
    reading_level: ReadingLevel | null;
    assessment_period: AssessmentPeriod | null;
    student_grade: number | null;
  };
  const libraryPassage = row.passage_id ? getPassageById(row.passage_id) : undefined;
  const passages: PassageData = libraryPassage
    ? {
        id: libraryPassage.id,
        title: libraryPassage.title,
        text: libraryPassage.text,
        grade_band: libraryPassage.grade_content,
      }
    : assessments.passages;

  return {
    ...(row as unknown as SessionData),
    students: row.students as StudentData,
    assessments: { ...assessments, passages },
    scores_json: row.scores_json as ScoresJson,
    teacher_review_status: row.teacher_review_status || "unreviewed",
  };
}

export function SessionReport({ sessionId }: SessionReportProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [comprehensionAnswers, setComprehensionAnswers] = useState<ComprehensionAnswer[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [eventOverrides, setEventOverrides] = useState<SessionEventOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Override panel state
  const [overrideType, setOverrideType] = useState<"wcpm" | "prosody" | "summary" | null>(null);
  const [overrideDimension, setOverrideDimension] = useState<string | undefined>();
  const [overrideCurrentValue, setOverrideCurrentValue] = useState<unknown>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Comprehension regrade state
  const [regrading, setRegrading] = useState(false);

  // Animation triggers - default to true if data is loaded (fixes accordion/panel visibility)
  const [reportRef, isIntersecting] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.1 });

  // Consider visible once data loads OR intersection triggers (whichever first)
  const [dataLoaded, setDataLoaded] = useState(false);
  useEffect(() => {
    if (session && !loading) {
      // Small delay to ensure smooth render
      const timer = setTimeout(() => setDataLoaded(true), 100);
      return () => clearTimeout(timer);
    }
  }, [session, loading]);
  const isReportVisible = isIntersecting || dataLoaded;

  const supabase = createClient();

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);

      try {
        // Fetch session with related data
        const { data: sessionData, error: sessionError } = await supabase
          .from("sessions")
          .select(`
            id,
            status,
            created_at,
            duration_seconds,
            audio_url,
            scores_json,
            teacher_review_status,
            passage_id,
            students(first_name, last_name),
            assessments(
              passages(id, title, text, grade_band),
              reading_level,
              assessment_period,
              student_grade
            )
          `)
          .eq("id", sessionId)
          .single();

        if (sessionError || !sessionData) {
          setError("Session not found");
          setLoading(false);
          return;
        }

        // Fetch session events
        const { data: eventRows } = await supabase
          .from("session_events")
          .select("*")
          .eq("session_id", sessionId)
          .order("word_index", { ascending: true });

        // Fetch comprehension answers
        const { data: comprehensionRows } = await supabase
          .from("comprehension_answers")
          .select(`
            id,
            question_id,
            student_answer,
            is_correct,
            status,
            feedback,
            expected_answer,
            passage_questions(id, question, question_type, display_order)
          `)
          .eq("session_id", sessionId)
          .order("passage_questions(display_order)", { ascending: true });

        // Fetch overrides
        const { data: overrideRows } = await supabase
          .from("session_overrides")
          .select(`
            id,
            field_name,
            original_value,
            new_value,
            reason,
            created_at,
            teachers(full_name)
          `)
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false });

        // Fetch event overrides (word-level)
        const { data: eventOverrideRows } = await supabase
          .from("session_event_overrides")
          .select(`
            id,
            session_id,
            word_index,
            teacher_id,
            action,
            original_event_type,
            original_confidence,
            new_event_type,
            spoken_word_override,
            reason,
            created_at,
            teachers(full_name)
          `)
          .eq("session_id", sessionId)
          .order("word_index", { ascending: true });

        // Transform data (resolves the session's actual library passage)
        const transformedSession = transformSessionRow(sessionData as unknown as RawSessionRow);

        const transformedEvents: SessionEvent[] = (eventRows || []).map((e) => ({
          word_index: e.word_index,
          expected_word: e.expected_word,
          spoken_word: e.spoken_word,
          start_timestamp_ms: e.start_timestamp_ms,
          end_timestamp_ms: e.end_timestamp_ms,
          event_type: e.event_type as SessionEvent["event_type"],
          confidence_score: e.confidence_score,
        }));

        setSession(transformedSession);
        setEvents(transformedEvents);
        setComprehensionAnswers((comprehensionRows || []) as unknown as ComprehensionAnswer[]);
        setOverrides((overrideRows || []) as unknown as Override[]);
        setEventOverrides((eventOverrideRows || []) as unknown as SessionEventOverride[]);
      } catch (err) {
        setError("Failed to load report");
        console.error(err);
      }

      setLoading(false);
    }

    fetchData();
  }, [sessionId, supabase]);

  // Check reduced motion preference
  const reducedMotion = useReducedMotion();

  // WCPM count-up animation (with reduced motion support)
  const wcpm = session?.scores_json?.metrics?.wcpm || 0;
  const animatedWcpm = useCountUp(
    wcpm,
    SCORE_REVEAL.wcpm * 1000,
    isReportVisible,
    reducedMotion
  );

  // Benchmark from the session's stored norm set (resolved once at score
  // time). Sessions scored before norm storage fall back to resolving from
  // assessment fields — same resolver, and the basis label stays honest
  // ("estimated from passage level" when student grade wasn't captured).
  const benchmarkResult: BenchmarkResult | null = (() => {
    if (!session || wcpm <= 0) return null;
    const norms =
      parseStoredNorms(session.scores_json.norms) ??
      resolveNorms({
        studentGrade: session.assessments?.student_grade,
        readingLevel: session.assessments?.reading_level,
        period: session.assessments?.assessment_period,
      });
    return calculateBenchmark(wcpm, norms);
  })();

  // Override handlers
  const handleOpenOverride = useCallback((type: "wcpm" | "prosody" | "summary", value: unknown, dimension?: string) => {
    setOverrideType(type);
    setOverrideCurrentValue(value);
    setOverrideDimension(dimension);
  }, []);

  const handleSaveOverride = useCallback(async (newValue: unknown, reason?: string) => {
    if (!session || !overrideType) return;

    const fieldName = overrideType === "prosody" && overrideDimension
      ? `prosody_dimensions.${overrideDimension}`
      : overrideType;

    try {
      const response = await fetch("/api/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          field_name: fieldName,
          original_value: overrideCurrentValue,
          new_value: newValue,
          reason,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save override");
      }

      // Refresh session data
      const { data: updatedSession } = await supabase
        .from("sessions")
        .select(`
          id, status, created_at, duration_seconds, scores_json, teacher_review_status, passage_id,
          students(first_name, last_name),
          assessments(passages(id, title, text, grade_band), reading_level, assessment_period, student_grade)
        `)
        .eq("id", sessionId)
        .single();

      if (updatedSession) {
        setSession(transformSessionRow(updatedSession as unknown as RawSessionRow));
      }

      // Refresh overrides
      const { data: overrideRows } = await supabase
        .from("session_overrides")
        .select(`
          id, field_name, original_value, new_value, reason, created_at,
          teachers(full_name)
        `)
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });

      setOverrides((overrideRows || []) as unknown as Override[]);
    } catch (err) {
      console.error("Override error:", err);
      throw err;
    }
  }, [session, sessionId, supabase, overrideType, overrideDimension, overrideCurrentValue]);

  // Handle prosody dot click — opens the per-dimension override with THAT
  // dimension's current stored value (null for unrated Expression).
  const handleProsodyDotClick = useCallback((dimension: string) => {
    if (!session) return;
    const dims = session.scores_json.prosody_dimensions;
    const currentValue = dims?.[dimension as keyof ProsodyDimensions] ?? null;
    handleOpenOverride("prosody", currentValue, dimension);
  }, [session, handleOpenOverride]);

  // Handle event override save (word-level)
  const handleEventOverrideSave = useCallback(async (
    wordIndex: number,
    data: {
      action: EventOverrideAction;
      original_event_type: EventType;
      original_confidence?: number | null;
      new_event_type?: EventType;
      spoken_word_override?: string;
      reason?: string;
    }
  ) => {
    try {
      const response = await fetch("/api/event-override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          word_index: wordIndex,
          ...data,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save event override");
      }

      const result = await response.json();

      // Refresh event overrides
      const { data: eventOverrideRows } = await supabase
        .from("session_event_overrides")
        .select(`
          id,
          session_id,
          word_index,
          teacher_id,
          action,
          original_event_type,
          original_confidence,
          new_event_type,
          spoken_word_override,
          reason,
          created_at,
          teachers(full_name)
        `)
        .eq("session_id", sessionId)
        .order("word_index", { ascending: true });

      setEventOverrides((eventOverrideRows || []) as unknown as SessionEventOverride[]);

      // Update session with new metrics if returned
      if (result.metrics) {
        const { data: updatedSession } = await supabase
          .from("sessions")
          .select(`
            id, status, created_at, duration_seconds, scores_json, teacher_review_status, passage_id,
            students(first_name, last_name),
            assessments(passages(id, title, text, grade_band), reading_level, assessment_period, student_grade)
          `)
          .eq("id", sessionId)
          .single();

        if (updatedSession) {
          setSession(transformSessionRow(updatedSession as unknown as RawSessionRow));
        }
      }
    } catch (err) {
      console.error("Event override save error:", err);
      throw err;
    }
  }, [sessionId, supabase]);

  // Handle event override delete (word-level)
  const handleEventOverrideDelete = useCallback(async (wordIndex: number) => {
    try {
      const response = await fetch(`/api/event-override?session_id=${sessionId}&word_index=${wordIndex}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete event override");
      }

      // Refresh event overrides
      const { data: eventOverrideRows } = await supabase
        .from("session_event_overrides")
        .select(`
          id,
          session_id,
          word_index,
          teacher_id,
          action,
          original_event_type,
          original_confidence,
          new_event_type,
          spoken_word_override,
          reason,
          created_at,
          teachers(full_name)
        `)
        .eq("session_id", sessionId)
        .order("word_index", { ascending: true });

      setEventOverrides((eventOverrideRows || []) as unknown as SessionEventOverride[]);

      // Refresh session to get updated metrics
      const { data: updatedSession } = await supabase
        .from("sessions")
        .select(`
          id, status, created_at, duration_seconds, scores_json, teacher_review_status, passage_id,
          students(first_name, last_name),
          assessments(passages(id, title, text, grade_band), reading_level, assessment_period, student_grade)
        `)
        .eq("id", sessionId)
        .single();

      if (updatedSession) {
        setSession(transformSessionRow(updatedSession as unknown as RawSessionRow));
      }
    } catch (err) {
      console.error("Event override delete error:", err);
      throw err;
    }
  }, [sessionId, supabase]);

  // Re-grade comprehension answers with updated AI prompt
  const handleRegradeComprehension = useCallback(async () => {
    setRegrading(true);
    try {
      const response = await fetch("/api/comprehension/regrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to regrade");
      }

      // Refetch comprehension answers with updated grades
      const { data: comprehensionRows } = await supabase
        .from("comprehension_answers")
        .select(`
          id,
          question_id,
          student_answer,
          is_correct,
          status,
          feedback,
          expected_answer,
          passage_questions(id, question, question_type, display_order)
        `)
        .eq("session_id", sessionId)
        .order("passage_questions(display_order)", { ascending: true });

      if (comprehensionRows) {
        setComprehensionAnswers(comprehensionRows as unknown as ComprehensionAnswer[]);
      }

      // Refetch session to get updated scores_json
      const { data: updatedSession } = await supabase
        .from("sessions")
        .select("scores_json")
        .eq("id", sessionId)
        .single();

      if (updatedSession && session) {
        setSession({
          ...session,
          scores_json: updatedSession.scores_json as ScoresJson,
        });
      }
    } catch (err) {
      console.error("Regrade error:", err);
      alert(err instanceof Error ? err.message : "Failed to regrade comprehension");
    } finally {
      setRegrading(false);
    }
  }, [sessionId, supabase, session]);

  // Loading state - use skeleton
  if (loading) {
    return <ReportSkeleton />;
  }

  // Error state - calm serif design
  if (error || !session || !session.scores_json) {
    return (
      <div className="text-center py-16">
        <p className="font-serif text-xl text-ink italic">{error || "Report not available"}</p>
        <p className="text-sm text-stone mt-2">Try refreshing the page.</p>
      </div>
    );
  }

  const { scores_json: scoresJson, students: student, assessments, duration_seconds } = session;
  const passage = assessments.passages;
  const { metrics, prosody, comprehension, summary, error_patterns } = scoresJson;
  // Headline prosody = median of the stored deterministic dimensions (already
  // reflecting any teacher overrides). Null for sessions scored before
  // per-dimension prosody existed (backfillable).
  const prosodyDimensions = scoresJson.prosody_dimensions ?? null;
  const prosodyHeadline = deriveProsodyHeadline(prosodyDimensions);
  const overriddenProsodyDimensions = overrides
    .filter((o) => o.field_name.startsWith("prosody_dimensions."))
    .map((o) => o.field_name.replace("prosody_dimensions.", ""));
  const comprehensionUngraded = comprehension?.grading_status === "ungraded";
  const studentName = `${student.first_name} ${student.last_name}`;
  const isEdited = session.teacher_review_status === "edited";

  // Format date
  const date = new Date(session.created_at);
  const formattedDate = date
    .toLocaleDateString("en-US", { month: "long", day: "numeric" })
    .toLowerCase();
  const formattedTime = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();

  // Count error types — only within the portion the student actually reached in the
  // timed sample. Trailing never-reached words are not errors (see getLastReachedIndex).
  const lastReachedIndex = getLastReachedIndex(events);
  const reached = (e: SessionEvent) => e.word_index <= lastReachedIndex;
  const substitutions = events.filter((e) => reached(e) && e.event_type === "substitution").length;
  const omissions = events.filter((e) => reached(e) && e.event_type === "omission").length;
  const mispronunciations = events.filter((e) => reached(e) && e.event_type === "mispronunciation").length;
  const selfCorrections = events.filter((e) => reached(e) && e.event_type === "self_correction").length;

  const hasComprehension = comprehension && comprehension.total > 0;

  // Check if summary was overridden
  const summaryOverride = overrides.find(o => o.field_name === "summary");

  return (
    <div ref={reportRef} className="space-y-8">
      {/* ===== WCPM HEADLINE ===== */}
      <div className="text-center py-6">
        <div className="flex items-baseline justify-center gap-3">
          <span
            className="text-[96px] font-semibold text-ink leading-none cursor-pointer hover:text-ink/80 transition-colors"
            style={{ fontFamily: "var(--font-sans)" }}
            onClick={() => handleOpenOverride("wcpm", metrics.wcpm)}
            title="Click to override WCPM"
          >
            {animatedWcpm}
            {isEdited && overrides.some(o => o.field_name === "wcpm") && (
              <span className="border-b border-accent-blue" />
            )}
          </span>
          <span className="text-lg text-stone font-medium" style={{ alignSelf: "baseline" }}>
            WCPM
          </span>
        </div>

        {/* Benchmark line — band, percentile range, and the passage-vs-grade
            statement, all from the session's single resolved norm set */}
        {benchmarkResult && (
          <>
            <p className="text-base text-stone mt-3">
              {benchmarkResult.label} · {benchmarkResult.percentileText}
            </p>
            {describePassageVsGrade(benchmarkResult.norms) && (
              <p className="text-sm text-stone mt-1">
                {describePassageVsGrade(benchmarkResult.norms)}
              </p>
            )}
          </>
        )}
      </div>

      {/* ===== BENCHMARK BAR ===== */}
      {benchmarkResult && (
        <div className="max-w-[600px] mx-auto">
          <BenchmarkBand result={benchmarkResult} showNorms={true} />
        </div>
      )}

      {/* ===== AUDIO QUALITY WARNING ===== */}
      <AudioQualityIndicator avgConfidence={scoresJson.avg_confidence} />

      {/* ===== METRICS ROW ===== */}
      <div className="bg-paper rounded-xl border border-mist/60 shadow-sm overflow-hidden">
        <div className="p-6">
          <div className={`grid ${hasComprehension ? "grid-cols-4" : "grid-cols-3"} gap-4`}>
            <div className="text-center">
              <p className="text-3xl font-semibold text-ink">{metrics.wcpm}</p>
              <p className="text-xs text-stone uppercase tracking-wide mt-1">WCPM</p>
            </div>
            <div className="text-center border-l border-mist">
              <p className="text-3xl font-semibold text-ink">
                {metrics.accuracy_percent}<span className="text-lg">%</span>
              </p>
              <p className="text-xs text-stone uppercase tracking-wide mt-1">Accuracy</p>
            </div>
            <div className="text-center border-l border-mist">
              <p className="text-3xl font-semibold text-ink">
                {prosodyHeadline != null ? prosodyHeadline : "—"}<span className="text-lg">/4</span>
              </p>
              <p className="text-xs text-stone uppercase tracking-wide mt-1">Prosody</p>
            </div>
            {hasComprehension && (
              <div className="text-center border-l border-mist">
                <p className="text-3xl font-semibold text-ink">
                  {comprehension.status === "grading" ? (
                    <span className="text-lg text-stone">Grading…</span>
                  ) : comprehensionUngraded || comprehension.score == null ? (
                    <span className="text-lg text-stone">Needs review</span>
                  ) : (
                    <>{comprehension.score}<span className="text-lg">/{comprehension.total}</span></>
                  )}
                </p>
                <p className="text-xs text-stone uppercase tracking-wide mt-1">Comprehension</p>
                {comprehensionUngraded && (
                  <p className="text-[10px] text-stone mt-1">
                    AI grading failed — use Re-grade or review answers manually
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== AI SUMMARY BLOCK ===== */}
      <div className="pl-6 border-l-2 border-mist">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs text-stone uppercase tracking-wider">
            {summaryOverride ? "teacher's note" : "ai observation"}
          </p>
          {!summaryOverride && <AIBadge />}
        </div>
        <p
          className={`font-serif text-lg text-ink leading-relaxed cursor-pointer hover:bg-mist/30 transition-colors rounded px-2 py-1 -mx-2 ${
            summaryOverride ? "" : "italic"
          }`}
          onClick={() => handleOpenOverride("summary", summary)}
          title="Click to edit summary"
        >
          {summary}
        </p>
        {summaryOverride && (
          <span className="inline-block mt-2 text-[10px] text-stone uppercase tracking-wider">
            edited
          </span>
        )}
        {/* Holistic NAEP prosody estimate lives HERE, as an AI observation —
            never as the prosody score (that comes from the deterministic
            dimensions above). */}
        {prosody && (
          <p className="text-sm text-stone mt-3 italic">
            AI holistic prosody observation: Level {prosody.level}/4 on the NAEP
            oral reading fluency scale.
            {prosody.explanation ? ` ${prosody.explanation}` : ""}
          </p>
        )}
        <p className="text-xs text-stone mt-3">
          Results are advisory screening data, not a diagnosis or placement.
          You can edit any AI-generated content.{" "}
          <a
            href="/explainability"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-blue hover:underline"
          >
            How scoring works
          </a>
        </p>
      </div>

      {/* ===== ERROR PATTERNS ===== */}
      {error_patterns && error_patterns.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-stone uppercase tracking-wider">suggested patterns</p>
            <AIBadge />
          </div>
          <div className="space-y-4">
            {error_patterns.slice(0, 3).map((pattern, idx) => (
              <div key={pattern.id ?? `pattern-${idx}`}>
                <p className="text-base font-medium text-ink">{pattern.label}</p>
                <p className="text-sm text-stone mt-0.5">{pattern.description}</p>
                {pattern.matched_words && pattern.matched_words.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {pattern.matched_words.slice(0, 8).map((word, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 text-xs text-ink bg-mist rounded"
                      >
                        {word}
                      </span>
                    ))}
                    {pattern.matched_words.length > 8 && (
                      <span className="text-xs text-stone">
                        +{pattern.matched_words.length - 8} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {error_patterns && error_patterns.length === 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <p className="text-xs text-stone uppercase tracking-wider">suggested patterns</p>
            <AIBadge />
          </div>
          <p className="text-sm text-stone italic">No notable patterns identified.</p>
        </div>
      )}

      {/* ===== READING & AUDIO CARD ===== */}
      <div className="bg-paper rounded-xl border border-mist/60 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-mist/40 bg-mist/20 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink uppercase tracking-wide">
            Student Reading
          </h3>
          <p className="text-sm text-stone">
            {metrics.correct_words} of {metrics.total_words_attempted} words correct
          </p>
        </div>

        <div className="p-6">
          <ReportClient
            sessionId={sessionId}
            passageText={passage.text}
            events={events}
            eventOverrides={eventOverrides}
            prosodyDimensions={prosodyDimensions}
            overriddenProsodyDimensions={overriddenProsodyDimensions}
            hasAudio={!!session.audio_url}
            waveformPeaks={session.scores_json.waveform_peaks}
            durationSeconds={duration_seconds}
            errorCounts={{ errors: substitutions + omissions, mispronunciations, selfCorrections }}
            isVisible={isReportVisible}
            onProsodyDotClick={handleProsodyDotClick}
            onEventOverrideSave={handleEventOverrideSave}
            onEventOverrideDelete={handleEventOverrideDelete}
          />
        </div>
      </div>

      {/* ===== COMPREHENSION CARD ===== */}
      {comprehensionAnswers.length > 0 && (
        <div className="bg-paper rounded-xl border border-mist/60 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-mist/40 bg-mist/20 flex items-center justify-between">
            <h3 className="text-sm font-medium text-ink uppercase tracking-wide">
              Comprehension
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRegradeComprehension}
                disabled={regrading}
                className="text-xs text-stone hover:text-ink transition-colors disabled:opacity-50"
                title="Re-evaluate answers with updated AI grading"
              >
                {regrading ? "Re-grading..." : "Re-grade"}
              </button>
              <span className="text-sm font-medium text-ink">
                {comprehensionUngraded || comprehension?.score == null ? "—" : comprehension.score}
                /{comprehension?.total || comprehensionAnswers.length}
              </span>
              <div className="flex gap-1">
                {comprehensionAnswers.map((answer) => (
                  <div
                    key={answer.id}
                    className={`w-2 h-2 rounded-full ${
                      answer.status === "correct" ? "bg-success"
                        : answer.status === "partial" ? "bg-warning"
                        : answer.status === "ungraded" ? "bg-stone/40"
                        : "bg-alert"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="space-y-5">
              {comprehensionAnswers.map((answer, idx) => {
                const question = answer.passage_questions;
                return (
                  <div
                    key={answer.id}
                    className={`pb-5 ${idx < comprehensionAnswers.length - 1 ? "border-b border-mist/40" : ""}`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-stone">Q{idx + 1}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          answer.status === "correct"
                            ? "bg-success/15 text-success"
                            : answer.status === "partial"
                            ? "bg-warning/15 text-warning"
                            : answer.status === "ungraded"
                            ? "bg-mist text-stone"
                            : "bg-alert/15 text-alert"
                        }`}
                      >
                        {answer.status === "correct"
                          ? "Correct"
                          : answer.status === "partial"
                          ? "Partial"
                          : answer.status === "ungraded"
                          ? "Needs review"
                          : "Incorrect"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-ink mb-3">{question.question}</p>

                    {/* Two-column layout: student answer (left) + expected answer (right) */}
                    <div className="flex gap-4">
                      {/* Student answer - 70% */}
                      <div className="flex-[7]">
                        <p className="text-xs text-stone mb-1">Student&apos;s answer</p>
                        <p className="text-sm text-ink">
                          {answer.student_answer || "No answer provided"}
                        </p>
                      </div>

                      {/* Expected answer - 30% */}
                      {answer.expected_answer && (
                        <div className="flex-[3] pl-4 border-l border-mist/40">
                          <p className="text-xs text-stone mb-1">From text</p>
                          <p className="text-sm text-ink/70 italic">
                            &ldquo;{answer.expected_answer}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ===== DETAILED DATA PANEL ===== */}
      <DetailedDataPanel events={events} />

      {/* ===== TEACHER NOTES ===== */}
      <TeacherNotesSection sessionId={sessionId} />

      {/* ===== FOOTER ACTIONS ===== */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          {/* Edit history */}
          {overrides.length > 0 && (
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-stone hover:text-ink transition-colors"
            >
              Edit history ({overrides.length})
            </button>
          )}
        </div>

        <div className="flex items-center gap-4">
          {/* Print link */}
          <a
            href={`/report/${sessionId}/print`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-stone hover:text-ink transition-colors"
          >
            Print
          </a>

          {/* Override button */}
          <button
            onClick={() => handleOpenOverride("wcpm", metrics.wcpm)}
            className="text-stone hover:text-ink transition-colors"
          >
            Review or adjust scores
          </button>
        </div>
      </div>

      {/* ===== EDIT HISTORY ===== */}
      {showHistory && overrides.length > 0 && (
        <div className="border-t border-mist pt-4">
          <div className="space-y-2">
            {overrides.map((override) => {
              const date = new Date(override.created_at);
              const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
              const teacherName = override.teachers?.full_name || "Teacher";

              return (
                <p key={override.id} className="text-sm text-stone">
                  <span className="font-medium text-ink">{override.field_name}</span>:{" "}
                  {JSON.stringify(override.original_value)} → {JSON.stringify(override.new_value)}
                  {" · "}{dateStr} by {teacherName}
                  {override.reason && (
                    <span className="italic"> · &ldquo;{override.reason}&rdquo;</span>
                  )}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* ===== OVERRIDE PANEL ===== */}
      <OverridePanel
        type={overrideType || "wcpm"}
        isOpen={overrideType !== null}
        onClose={() => setOverrideType(null)}
        onSave={handleSaveOverride}
        currentValue={overrideCurrentValue}
        dimension={overrideDimension}
      />
    </div>
  );
}
