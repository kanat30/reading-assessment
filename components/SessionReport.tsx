"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/browser";
import { ReportClient } from "./ReportClient";
import { OverridePanel } from "./OverridePanel";
import { ReportSkeleton } from "./skeletons/ReportSkeleton";
import { useCountUp } from "@/hooks/useCountUp";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { SessionEvent, EnhancedErrorPattern } from "@/lib/scoring/types";
import { SCORE_REVEAL } from "@/lib/animation/constants";

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

interface ComprehensionAnswer {
  id: string;
  question_id: string;
  student_answer: string;
  is_correct: boolean | null;
  feedback: string | null;
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
    percentile_estimate: number;
    percentile_band: "success" | "warning" | "alert";
    correct_words: number;
    total_words_attempted: number;
  };
  prosody?: {
    level: number;
    expression: string;
    phrasing: string;
    pace: string;
  };
  comprehension?: {
    score: number;
    total: number;
  };
  summary: string;
  error_patterns?: EnhancedErrorPattern[];
  avg_confidence: number;
  scoring_duration_seconds: number;
}

interface SessionData {
  id: string;
  status: string;
  created_at: string;
  duration_seconds: number;
  scores_json: ScoresJson;
  teacher_review_status: string;
  students: StudentData;
  assessments: {
    passages: PassageData;
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

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function SessionReport({ sessionId }: SessionReportProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [comprehensionAnswers, setComprehensionAnswers] = useState<ComprehensionAnswer[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Override panel state
  const [overrideType, setOverrideType] = useState<"wcpm" | "prosody" | "summary" | null>(null);
  const [overrideDimension, setOverrideDimension] = useState<string | undefined>();
  const [overrideCurrentValue, setOverrideCurrentValue] = useState<unknown>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Animation triggers - default to true if data is loaded (fixes accordion/panel visibility)
  const [reportRef, isIntersecting] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.1 });
  const [percentileAnimated, setPercentileAnimated] = useState(false);

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
            scores_json,
            teacher_review_status,
            students(first_name, last_name),
            assessments(passages(id, title, text, grade_band))
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
            feedback,
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

        // Transform data
        const transformedSession = {
          ...sessionData,
          students: sessionData.students as unknown as StudentData,
          assessments: sessionData.assessments as unknown as { passages: PassageData },
          scores_json: sessionData.scores_json as ScoresJson,
          teacher_review_status: sessionData.teacher_review_status || "unreviewed",
        };

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

  // Trigger percentile animation after WCPM finishes
  useEffect(() => {
    if (reducedMotion) {
      setPercentileAnimated(true);
      return;
    }

    if (isReportVisible && !percentileAnimated) {
      const timer = setTimeout(() => {
        setPercentileAnimated(true);
      }, (SCORE_REVEAL.wcpm + SCORE_REVEAL.percentileDelay) * 1000);
      return () => clearTimeout(timer);
    }
  }, [isReportVisible, percentileAnimated, reducedMotion]);

  // Override handlers
  const handleOpenOverride = useCallback((type: "wcpm" | "prosody" | "summary", value: unknown, dimension?: string) => {
    setOverrideType(type);
    setOverrideCurrentValue(value);
    setOverrideDimension(dimension);
  }, []);

  const handleSaveOverride = useCallback(async (newValue: unknown, reason?: string) => {
    if (!session || !overrideType) return;

    const fieldName = overrideType === "prosody" && overrideDimension
      ? `prosody.${overrideDimension}`
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
          id, status, created_at, duration_seconds, scores_json, teacher_review_status,
          students(first_name, last_name),
          assessments(passages(id, title, text, grade_band))
        `)
        .eq("id", sessionId)
        .single();

      if (updatedSession) {
        setSession({
          ...updatedSession,
          students: updatedSession.students as unknown as StudentData,
          assessments: updatedSession.assessments as unknown as { passages: PassageData },
          scores_json: updatedSession.scores_json as ScoresJson,
          teacher_review_status: updatedSession.teacher_review_status || "unreviewed",
        });
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

  // Handle prosody dot click
  const handleProsodyDotClick = useCallback((dimension: string, level: number) => {
    if (!session?.scores_json?.prosody) return;
    const currentLevel = session.scores_json.prosody.level;
    handleOpenOverride("prosody", currentLevel, dimension);
  }, [session, handleOpenOverride]);

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

  // Count error types
  const substitutions = events.filter((e) => e.event_type === "substitution").length;
  const omissions = events.filter((e) => e.event_type === "omission").length;
  const mispronunciations = events.filter((e) => e.event_type === "mispronunciation").length;
  const selfCorrections = events.filter((e) => e.event_type === "self_correction").length;

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

        {/* Percentile line */}
        <p className="text-base text-stone mt-3">
          {getOrdinalSuffix(metrics.percentile_estimate)} percentile · grade {passage.grade_band} spring
        </p>
      </div>

      {/* ===== PERCENTILE BAR ===== */}
      <div className="max-w-[600px] mx-auto relative">
        <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden relative">
          {/* 50th percentile marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-px bg-stone/30"
            style={{ left: "50%" }}
          />

          {/* Animated fill */}
          <motion.div
            className={`h-full rounded-full ${
              metrics.percentile_band === "success"
                ? "bg-success"
                : metrics.percentile_band === "warning"
                ? "bg-warning"
                : "bg-alert"
            }`}
            initial={{ width: reducedMotion ? `${metrics.percentile_estimate}%` : 0 }}
            animate={{ width: percentileAnimated ? `${metrics.percentile_estimate}%` : 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: SCORE_REVEAL.percentile, ease: "easeOut" }}
          />
        </div>
      </div>

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
                {prosody?.level || "—"}<span className="text-lg">/4</span>
              </p>
              <p className="text-xs text-stone uppercase tracking-wide mt-1">Prosody</p>
            </div>
            {hasComprehension && (
              <div className="text-center border-l border-mist">
                <p className="text-3xl font-semibold text-ink">
                  {comprehension.score}<span className="text-lg">/{comprehension.total}</span>
                </p>
                <p className="text-xs text-stone uppercase tracking-wide mt-1">Comprehension</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== AI SUMMARY BLOCK ===== */}
      <div className="pl-6 border-l-2 border-mist">
        <p className="text-xs text-stone uppercase tracking-wider mb-2">
          {summaryOverride ? "teacher's note" : "summary"}
        </p>
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
      </div>

      {/* ===== ERROR PATTERNS ===== */}
      {error_patterns && error_patterns.length > 0 && (
        <div>
          <p className="text-xs text-stone uppercase tracking-wider mb-3">patterns</p>
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
          <p className="text-xs text-stone uppercase tracking-wider mb-3">patterns</p>
          <p className="text-sm text-stone italic">No notable patterns.</p>
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
            metrics={metrics}
            durationSeconds={duration_seconds}
            errorCounts={{ errors: substitutions + omissions, mispronunciations, selfCorrections }}
            isVisible={isReportVisible}
            onProsodyDotClick={handleProsodyDotClick}
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">
                {comprehension?.score || 0}/{comprehension?.total || comprehensionAnswers.length}
              </span>
              <div className="flex gap-1">
                {comprehensionAnswers.map((answer) => (
                  <div
                    key={answer.id}
                    className={`w-2 h-2 rounded-full ${
                      answer.is_correct ? "bg-success" : "bg-alert"
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
                          answer.is_correct
                            ? "bg-success/15 text-success"
                            : "bg-alert/15 text-alert"
                        }`}
                      >
                        {answer.is_correct ? "Correct" : "Incorrect"}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-ink mb-2">{question.question}</p>
                    <p className="text-sm text-stone">
                      {answer.student_answer || "No answer provided"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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
            Disagree with this score?
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
                    <span className="italic"> · "{override.reason}"</span>
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
