"use client";

import { useEffect } from "react";
import { EnhancedErrorPattern } from "@/lib/scoring/patterns";

interface PrintReportProps {
  session: {
    id: string;
    created_at: string;
    duration_seconds: number;
    scores_json: {
      metrics: {
        wcpm: number;
        accuracy_percent: number;
        percentile_estimate: number;
        percentile_band: "above" | "approaching" | "below";
        correct_words: number;
        total_words_attempted: number;
      };
      prosody?: {
        level: number;
        expression: string;
        phrasing: string;
        pace: string;
      };
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

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Print-optimized report view.
 * Designed for letter-size paper (8.5" x 11") with 0.75" margins.
 * Uses print-specific styling for clean output.
 */
export function PrintReport({ session, events }: PrintReportProps) {
  const { scores_json, students, assessments } = session;
  const { metrics, prosody, summary, error_patterns } = scores_json;
  const passage = assessments.passages;
  const teacher = assessments.teachers;
  const school = assessments.schools;

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

  // Build transcript with error highlighting
  const passageWords = passage.text.split(/\s+/);
  const eventMap = new Map(events.map((e) => [e.word_index, e]));

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
                {prosody?.level || "—"}/4
              </p>
              <p className="text-xs uppercase tracking-wide text-gray-500 print:text-[9pt]">
                Prosody (NAEP Scale)
              </p>
            </div>
          </div>

          {/* Percentile bar - static for print */}
          <div className="mb-2">
            <p className="text-xs text-gray-600 mb-1 print:text-[9pt]">
              {getOrdinalSuffix(metrics.percentile_estimate)} percentile · Hasbrouck-Tindal Grade 6 Spring Norms
            </p>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden print:bg-gray-300">
              <div
                className="h-full bg-black rounded-full"
                style={{ width: `${metrics.percentile_estimate}%` }}
              />
            </div>
          </div>
        </div>

        {/* Prosody Gauges - Print version with filled dots only */}
        {prosody && (
          <div className="mb-8 print-avoid-break">
            <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-3 print:text-[9pt]">
              Fluency Dimensions <span className="normal-case italic">(AI-generated)</span>
            </h2>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: "Expression", value: 3 },
                { label: "Phrasing", value: 3 },
                { label: "Smoothness", value: 3 },
                { label: "Pace", value: prosody.level },
              ].map((dim) => (
                <div key={dim.label} className="text-center">
                  <p className="text-sm text-black font-medium print:text-[10pt]">{dim.label}</p>
                  <div className="flex justify-center gap-1 mt-1">
                    {[1, 2, 3, 4].map((level) => (
                      <span
                        key={level}
                        className={`inline-block w-2 h-2 rounded-full ${
                          level <= dim.value ? "bg-black" : "border border-gray-400"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
            {passageWords.map((word, idx) => {
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
