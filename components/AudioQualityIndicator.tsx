"use client";

import { useState } from "react";

interface AudioQualityIndicatorProps {
  avgConfidence: number; // 0-100 scale
  threshold?: number; // Below this = warning (default 75)
}

/**
 * Displays a warning when audio transcription confidence is low,
 * indicating that recording quality may have affected assessment accuracy.
 *
 * This helps teachers understand when AI-generated metrics should be
 * reviewed more carefully due to potential audio quality issues.
 */
export function AudioQualityIndicator({
  avgConfidence,
  threshold = 75
}: AudioQualityIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't show anything if confidence is good
  if (avgConfidence >= threshold) {
    return null;
  }

  // Determine severity
  const isVeryLow = avgConfidence < 60;
  const confidenceLabel = isVeryLow ? "Poor" : "Fair";
  const bgColor = isVeryLow ? "bg-alert/10" : "bg-warning/10";
  const borderColor = isVeryLow ? "border-alert/30" : "border-warning/30";
  const iconColor = isVeryLow ? "text-alert" : "text-warning";
  const textColor = isVeryLow ? "text-alert" : "text-warning";

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} overflow-hidden`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          {/* Warning icon */}
          <svg
            className={`w-5 h-5 ${iconColor} flex-shrink-0`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>

          <div>
            <p className={`text-sm font-medium ${textColor}`}>
              {confidenceLabel} Audio Quality Detected
            </p>
            <p className="text-xs text-stone mt-0.5">
              Transcription confidence: {avgConfidence}% — Review recommended
            </p>
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <svg
          className={`w-4 h-4 text-stone transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-mist/30">
          <p className="text-sm text-stone leading-relaxed">
            The speech recognition system had difficulty transcribing this recording clearly.
            This may be due to:
          </p>
          <ul className="text-sm text-stone mt-2 space-y-1 ml-4">
            <li className="flex items-start gap-2">
              <span className="text-stone/60">•</span>
              <span>Background noise in the recording environment</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone/60">•</span>
              <span>Student speaking too quietly or too far from the microphone</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-stone/60">•</span>
              <span>Audio equipment or connection issues</span>
            </li>
          </ul>
          <p className="text-sm text-stone mt-3 leading-relaxed">
            <strong className="text-ink">What this means:</strong> The automated scores (WCPM, accuracy, error patterns)
            may not accurately reflect the student&apos;s actual reading performance.
            Please listen to the recording and use your professional judgment to assess the reading.
          </p>
          <p className="text-xs text-stone/70 mt-3 italic">
            Tip: Click the WCPM number to override the score if needed after reviewing the audio.
          </p>
        </div>
      )}
    </div>
  );
}
