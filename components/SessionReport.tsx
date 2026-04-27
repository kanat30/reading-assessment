"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { ReportClient } from "./ReportClient";
import { SessionEvent } from "@/lib/scoring/types";

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
  avg_confidence: number;
  scoring_duration_seconds: number;
}

interface SessionData {
  id: string;
  status: string;
  created_at: string;
  duration_seconds: number;
  scores_json: ScoresJson;
  students: StudentData;
  assessments: {
    passages: PassageData;
  };
}

const PROSODY_LABELS: Record<number, string> = {
  1: "Word-by-word",
  2: "Some phrasing",
  3: "Mostly fluent",
  4: "Expressive",
};

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function SessionReport({ sessionId }: SessionReportProps) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [comprehensionAnswers, setComprehensionAnswers] = useState<ComprehensionAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

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

        // Transform data
        const transformedSession = {
          ...sessionData,
          students: sessionData.students as unknown as StudentData,
          assessments: sessionData.assessments as unknown as { passages: PassageData },
          scores_json: sessionData.scores_json as ScoresJson,
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
      } catch (err) {
        setError("Failed to load report");
        console.error(err);
      }

      setLoading(false);
    }

    fetchData();
  }, [sessionId, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-mist border-t-accent-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !session || !session.scores_json) {
    return (
      <div className="text-center py-16">
        <p className="font-serif text-xl text-stone italic">{error || "Report not available"}</p>
      </div>
    );
  }

  const { scores_json: scoresJson, students: student, assessments, duration_seconds } = session;
  const passage = assessments.passages;
  const { metrics, prosody, comprehension, summary } = scoresJson;
  const studentName = `${student.first_name} ${student.last_name}`;

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
  const selfCorrections = events.filter((e) => e.event_type === "self_correction").length;

  const hasComprehension = comprehension && comprehension.total > 0;

  return (
    <div className="space-y-6">
      {/* ===== OVERVIEW CARD ===== */}
      <div className="bg-paper rounded-xl border border-mist/60 shadow-sm overflow-hidden">
        {/* Card header with date */}
        <div className="px-6 py-4 border-b border-mist/40 bg-mist/20">
          <p className="text-sm text-stone">
            {formattedDate} · {formattedTime} · grade {passage.grade_band}
          </p>
        </div>

        <div className="p-6">
          {/* Metrics row */}
          <div className={`grid ${hasComprehension ? "grid-cols-4" : "grid-cols-3"} gap-4 mb-6`}>
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

          {/* Percentile bar */}
          <div className="mb-6">
            <div className="flex justify-between text-xs text-stone mb-2">
              <span className="font-medium">{getOrdinalSuffix(metrics.percentile_estimate)} percentile</span>
            </div>
            <div className="w-full h-2.5 bg-mist rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.percentile_band === "success"
                    ? "bg-success"
                    : metrics.percentile_band === "warning"
                    ? "bg-warning"
                    : "bg-alert"
                }`}
                style={{ width: `${metrics.percentile_estimate}%` }}
              />
            </div>
          </div>

          {/* Summary */}
          <p className="font-serif text-base leading-relaxed text-ink/80 italic">{summary}</p>
        </div>
      </div>

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
          {/* Legend - inline */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm mb-6 pb-4 border-b border-mist/40">
            <div className="flex items-center gap-2">
              <span className="text-alert border-b border-dotted border-alert">word</span>
              <span className="text-stone">
                Error {substitutions + omissions > 0 && `(${substitutions + omissions})`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-warning">word</span>
              <span className="text-stone">
                Self-corrected {selfCorrections > 0 && `(${selfCorrections})`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ink">word</span>
              <span className="text-stone">Correct</span>
            </div>
          </div>

          {/* Interactive waveform and transcript */}
          <ReportClient
            sessionId={sessionId}
            passageText={passage.text}
            events={events}
            metrics={metrics}
            durationSeconds={duration_seconds}
          />
        </div>
      </div>

      {/* ===== ANALYSIS CARDS - Side by side on larger screens ===== */}
      {(prosody || comprehensionAnswers.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prosody Card */}
          {prosody && (
            <div className="bg-paper rounded-xl border border-mist/60 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-mist/40 bg-mist/20">
                <h3 className="text-sm font-medium text-ink uppercase tracking-wide">
                  Prosody
                </h3>
              </div>

              <div className="p-6">
                {/* NAEP Scale */}
                <div className="flex gap-2 mb-6">
                  {[1, 2, 3, 4].map((level) => (
                    <div
                      key={level}
                      className={`flex-1 text-center py-3 rounded-lg transition-all ${
                        prosody.level === level
                          ? prosody.level >= 3
                            ? "bg-success text-paper shadow-sm"
                            : prosody.level === 2
                            ? "bg-warning text-paper shadow-sm"
                            : "bg-alert text-paper shadow-sm"
                          : "bg-mist/40 text-stone"
                      }`}
                    >
                      <p className="text-xl font-semibold">{level}</p>
                      <p className="text-xs mt-0.5">{PROSODY_LABELS[level]}</p>
                    </div>
                  ))}
                </div>

                {/* Prosody details */}
                <div className="space-y-4 text-sm">
                  <div>
                    <p className="text-xs text-stone uppercase tracking-wide mb-1">Expression</p>
                    <p className="text-ink">{prosody.expression}</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone uppercase tracking-wide mb-1">Phrasing</p>
                    <p className="text-ink">{prosody.phrasing}</p>
                  </div>
                  <div>
                    <p className="text-xs text-stone uppercase tracking-wide mb-1">Pace</p>
                    <p className="text-ink">{prosody.pace}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comprehension Card */}
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
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              question.question_type === "literal"
                                ? "bg-accent-blue/10 text-accent-blue"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            {question.question_type === "literal" ? "Literal" : "Inferential"}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-ink mb-2">{question.question}</p>
                        <p className="text-sm text-stone">
                          {answer.student_answer || "No answer provided"}
                        </p>
                        {answer.feedback && (
                          <p className="text-xs text-stone/70 italic mt-2">{answer.feedback}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
