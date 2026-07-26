"use client";

import { useEffect } from "react";
import { EnhancedErrorPattern } from "@/lib/scoring/patterns";
import { getLastReachedIndex } from "@/lib/scoring/metrics";
import { ProsodyDimensions } from "@/lib/scoring/types";
import { deriveProsodyHeadline, prosodyTotal } from "@/lib/scoring/prosody-dimensions";
import {
  parseStoredNorms,
  getBand,
  getBandLabel,
  describePercentile,
  describeNormsBasis,
  describePassageVsGrade,
} from "@/lib/scoring/norms";

interface PrintReportProps {
  session: {
    id: string;
    created_at: string;
    duration_seconds: number;
    scores_json: {
      metrics: {
        wcpm: number;
        accuracy_percent: number;
        correct_words: number;
        total_words_attempted: number;
      };
      norms?: unknown;
      prosody?: {
        level: number;
        expression: string;
        phrasing: string;
        pace: string;
      };
      prosody_dimensions?: Partial<ProsodyDimensions>;
      summary: string;
      error_patterns?: EnhancedErrorPattern[];
    };
    students: { first_name: string; last_name: string };
    assessments: {
      class_label: string;
      passages: { title: string; text: string; grade_band: string };
      teachers: { full_name: string };
      schools: { name: string };
    };
  };
  events: Array<{
    word_index: number;
    expected_word: string;
    spoken_word: string | null;
    event_type: string;
  }>;
}

/**
 * Print-optimized report view.
 * Designed for letter-size paper (8.5" x 11") with 0.75" margins.
 * Uses print-specific styling for clean output.
 */
export function PrintReport({ session, events }: PrintReportProps) {
  const { scores_json, students, assessments } = session;
  const { metrics, summary, error_patterns } = scores_json;
  const passage = assessments.passages;
  const teacher = assessments.teachers;
  const school = assessments.schools;

  // The session's stored norm set — resolved once at score time. Null for
  // sessions scored before norm storage (run scripts/backfill-norms.ts).
  const norms = parseStoredNorms(scores_json.norms);
  const band = norms ? getBand(metrics.wcpm, norms.cuts) : null;
  const normsCaption = norms ? describeNormsBasis(norms) : null;

  // Deterministic prosody dimensions (Expression is teacher-rated).
  const dimensions = scores_json.prosody_dimensions ?? null;
  const prosodyHeadline = deriveProsodyHeadline(dimensions);
  const prosodyTotals = prosodyTotal(dimensions);

  const studentName = `${students.first_name} ${students.last_name}`;

  // Format date
  const date = new Date(session.created_at);
  const formattedDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Auto-trigger print on load
  useEffect(() => {
    // Small delay to ensure styles are loaded
    const timer = setTimeout(() => {
      window.print();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Build transcript with error highlighting. The read is a fixed 60s sample, so
  // only show/score up to the last word the student actually reached — the trailing
  // never-reached words are not errors (see getLastReachedIndex).
  const passageWords = passage.text.split(/\s+/);
  const eventMap = new Map(events.map((e) => [e.word_index, e]));
  const lastReachedIndex = getLastReachedIndex(events);
  const hasUnreached = lastReachedIndex >= 0 && lastReachedIndex < passageWords.length - 1;
  const reachedWords = hasUnreached ? passageWords.slice(0, lastReachedIndex + 1) : passageWords;
  const notReachedCount = passageWords.length - reachedWords.length;

  return (
    <>
      {/* Print-specific styles */}
      <style jsx global>{`
        @media print {
          @page {
            margin: 0.75in;
            size: letter;
          }
          body {
            background: white !important;
            color: black !important;
            font-size: 11pt !important;
            line-height: 1.5 !important;
          }
          .no-print {
            display: none !important;
          }
          .print-page-break {
            page-break-before: always;
          }
          .print-avoid-break {
            page-break-inside: avoid;
          }
        }
        @media screen {
          body {
            background: #f5f5f5;
          }
        }
      `}</style>

      <div className="max-w-[6.5in] mx-auto bg-white p-8 print:p-0 print:max-w-none print:mx-0">
        {/* Header */}
        <header className="text-xs text-gray-500 mb-6 print:text-[10pt] print:text-gray-600 print-avoid-break">
          FluencyScope · Reading Assessment
        </header>

        {/* Student Name - Document Headline */}
        <h1 className="text-3xl font-semibold text-black mb-2 print:text-[24pt] print:font-semibold print-avoid-break">
          {studentName}
        </h1>

        {/* Metadata line */}
        <p className="text-sm text-gray-600 mb-8 print:text-[10pt] print:text-gray-600">
          {formattedDate} · {assessments.class_label} · {passage.title} · Grade {passage.grade_band}
        </p>

        {/* Metrics Block */}
        <div className="mb-8 print-avoid-break">
          <div className="grid grid-cols-3 gap-6 mb-4">
            <div>
              <p className="text-4xl font-semibold text-black print:text-[36pt]">
                {metrics.wcpm}
              </p>
              <p className="text-xs uppercase tracking-wide text-gray-500 print:text-[9pt]">
                Words Correct Per Minute
              </p>
            </div>
            <div>
              <p className="text-4xl font-semibold text-black print:text-[36pt]">
                {metrics.accuracy_percent}%
              </p>
              <p className="text-xs uppercase tracking-wide text-gray-500 print:text-[9pt]">
                Accuracy
              </p>
            </div>
            <div>
              <p className="text-4xl font-semibold text-black print:text-[36pt]">
                {prosodyHeadline != null ? `${prosodyHeadline}/4` : "—"}
              </p>
              <p className="text-xs uppercase tracking-wide text-gray-500 print:text-[9pt]">
                Prosody (median of dimensions)
              </p>
            </div>
          </div>

          {/* Benchmark line — rendered from the session's stored norm set only */}
          {norms && band && normsCaption ? (
            <div className="mb-2">
              <p className="text-sm text-black mb-0.5 print:text-[10pt]">
                <span className="font-semibold">{getBandLabel(band)}</span>
                {" · "}
                {describePercentile(metrics.wcpm, norms.cuts)}
              </p>
              <p className="text-xs text-gray-600 print:text-[9pt]">
                {normsCaption.caption} · 25th percentile: {norms.cuts.p25} WCPM · 50th: {norms.cuts.p50} WCPM
              </p>
              {describePassageVsGrade(norms) && (
                <p className="text-xs text-gray-600 print:text-[9pt]">
                  {describePassageVsGrade(norms)}
                </p>
              )}
              {normsCaption.basisNote && (
                <p className="text-xs text-gray-600 italic print:text-[9pt]">
                  {normsCaption.basisNote}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600 italic mb-2 print:text-[9pt]">
              Benchmark comparison unavailable — this session was scored before
              norm-set recording. Re-run the scoring backfill to attach norms.
            </p>
          )}
        </div>

        {/* Fluency dimensions — deterministic values computed from timing data;
            Expression is teacher-rated. Never fabricated: sessions scored before
            dimension computation show an honest absence instead of placeholders. */}
        <div className="mb-8 print-avoid-break">
          <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-3 print:text-[9pt]">
            Fluency Dimensions{" "}
            <span className="normal-case italic">
              (computed from timing data · Expression is teacher-rated)
            </span>
          </h2>
          {dimensions ? (
            <>
              <div className="grid grid-cols-4 gap-4">
                {(
                  [
                    { label: "Expression", value: dimensions.expression ?? null },
                    { label: "Phrasing", value: dimensions.phrasing ?? null },
                    { label: "Smoothness", value: dimensions.smoothness ?? null },
                    { label: "Pace", value: dimensions.pace ?? null },
                  ] as Array<{ label: string; value: number | null }>
                ).map((dim) => (
                  <div key={dim.label} className="text-center">
                    <p className="text-sm text-black font-medium print:text-[10pt]">{dim.label}</p>
                    {dim.value != null ? (
                      <div className="flex justify-center gap-1 mt-1">
                        {[1, 2, 3, 4].map((level) => (
                          <span
                            key={level}
                            className={`inline-block w-2 h-2 rounded-full ${
                              level <= dim.value! ? "bg-black" : "border border-gray-400"
                            }`}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 italic mt-1 print:text-[9pt]">
                        Not yet rated
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {prosodyTotals && (
                <p className="text-xs text-gray-600 mt-2 print:text-[9pt]">
                  Total: {prosodyTotals.total}/{prosodyTotals.max}
                  {!prosodyTotals.expressionRated && " (Expression not yet rated)"}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500 italic print:text-[9pt]">
              Dimension scores unavailable — this session was scored before
              per-dimension prosody. Re-run the scoring backfill to compute them.
            </p>
          )}
        </div>

        {/* AI Summary */}
        <div className="mb-8 print-avoid-break">
          <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-2 print:text-[9pt]">
            AI Observation <span className="normal-case italic">(AI-generated)</span>
          </h2>
          <p className="font-serif text-base italic text-black leading-relaxed print:text-[11pt] print:leading-relaxed">
            {summary}
          </p>
        </div>

        {/* Reading Transcript */}
        <div className="mb-8">
          <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-2 print:text-[9pt]">
            Reading Transcript
          </h2>
          <p className="text-sm text-black leading-relaxed print:text-[10pt] print:leading-normal">
            {reachedWords.map((word, idx) => {
              const event = eventMap.get(idx);
              const isError =
                event &&
                (event.event_type === "substitution" ||
                  event.event_type === "omission" ||
                  event.event_type === "mispronunciation");

              if (isError) {
                return (
                  <span key={idx}>
                    <span className="font-bold underline">{word}</span>{" "}
                  </span>
                );
              }

              return <span key={idx}>{word} </span>;
            })}
            {hasUnreached && (
              <span className="text-gray-400 italic">
                {" "}— read {reachedWords.length} of {passageWords.length} words in the timed sample; {notReachedCount} not reached —
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-2 print:text-[8pt]">
            Bold/underlined words indicate errors (substitutions, omissions, or unclear pronunciation).
          </p>
        </div>

        {/* Error Patterns */}
        {error_patterns && error_patterns.length > 0 && (
          <div className="mb-8 print-avoid-break">
            <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-2 print:text-[9pt]">
              Suggested Patterns <span className="normal-case italic">(AI-generated)</span>
            </h2>
            <ul className="list-disc list-inside text-sm text-black print:text-[10pt]">
              {error_patterns.slice(0, 3).map((pattern) => (
                <li key={pattern.id} className="mb-1">
                  <span className="font-medium">{pattern.label}</span>
                  {pattern.matched_words && pattern.matched_words.length > 0 && (
                    <span className="text-gray-600">
                      {" "}— {pattern.matched_words.slice(0, 4).join(", ")}
                      {pattern.matched_words.length > 4 && "..."}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-4 border-t border-gray-300 text-xs text-gray-500 print:text-[8pt] print:mt-auto print-avoid-break">
          <div className="flex justify-between">
            <span>{school.name}</span>
            <span>Teacher: {teacher.full_name}</span>
            <span>Generated: {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
        </footer>
      </div>

      {/* Screen-only back button */}
      <div className="fixed bottom-4 right-4 no-print">
        <button
          onClick={() => window.history.back()}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm hover:bg-gray-700 transition-colors"
        >
          ← Back to Report
        </button>
      </div>
    </>
  );
}
