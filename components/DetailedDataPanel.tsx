"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SessionEvent } from "@/lib/scoring/types";

interface DetailedDataPanelProps {
  events: SessionEvent[];
}

/**
 * Expandable panel showing raw word-by-word data.
 * Provides transparency into the underlying data used by AI analysis.
 */
export function DetailedDataPanel({ events }: DetailedDataPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter to events with actual data (not trailing omissions)
  const eventsWithData = events.filter(
    (e) => e.event_type !== "omission" || e.spoken_word !== null
  );

  return (
    <div className="border border-mist/60 rounded-lg overflow-hidden">
      {/* Header button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-mist/20 hover:bg-mist/30 transition-colors text-left"
      >
        <span className="text-sm text-stone">
          View raw data ({eventsWithData.length} words)
        </span>
        <svg
          className={`w-4 h-4 text-stone transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-stone border-b border-mist">
                    <th className="pb-2 pr-3 font-medium">#</th>
                    <th className="pb-2 pr-3 font-medium">Expected</th>
                    <th className="pb-2 pr-3 font-medium">Spoken</th>
                    <th className="pb-2 pr-3 font-medium">Type</th>
                    <th className="pb-2 pr-3 font-medium">Confidence</th>
                    <th className="pb-2 font-medium">Timing (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {eventsWithData.map((event, idx) => {
                    const duration =
                      event.start_timestamp_ms !== null &&
                      event.end_timestamp_ms !== null
                        ? event.end_timestamp_ms - event.start_timestamp_ms
                        : null;

                    const confidenceColor =
                      event.confidence_score !== null
                        ? event.confidence_score >= 0.8
                          ? "text-ink"
                          : event.confidence_score >= 0.5
                          ? "text-stone"
                          : "text-stone/60"
                        : "text-stone/40";

                    const typeColor =
                      event.event_type === "correct"
                        ? "text-ink"
                        : event.event_type === "self_correction"
                        ? "text-stone"
                        : "text-alert";

                    return (
                      <tr
                        key={idx}
                        className="border-b border-mist/40 last:border-0"
                      >
                        <td className="py-1.5 pr-3 text-stone/60">
                          {event.word_index + 1}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-ink">
                          {event.expected_word}
                        </td>
                        <td className="py-1.5 pr-3 font-mono text-stone">
                          {event.spoken_word || "—"}
                        </td>
                        <td className={`py-1.5 pr-3 ${typeColor}`}>
                          {formatEventType(event.event_type)}
                        </td>
                        <td className={`py-1.5 pr-3 ${confidenceColor}`}>
                          {event.confidence_score !== null
                            ? `${Math.round(event.confidence_score * 100)}%`
                            : "—"}
                        </td>
                        <td className="py-1.5 text-stone/70">
                          {duration !== null ? `${duration}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <p className="mt-4 text-[10px] text-stone/60 italic">
                Confidence scores and timing are from speech recognition. Lower
                confidence may indicate unclear audio, not necessarily errors.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatEventType(type: string): string {
  switch (type) {
    case "correct":
      return "correct";
    case "substitution":
      return "subst.";
    case "omission":
      return "omit";
    case "insertion":
      return "insert";
    case "self_correction":
      return "self-corr.";
    case "mispronunciation":
      return "mispron.";
    default:
      return type;
  }
}
