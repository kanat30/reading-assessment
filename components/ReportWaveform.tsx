"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useWaveSurfer } from "@/hooks/useWaveSurfer";
import { SessionEvent } from "@/lib/scoring/types";

interface ReportWaveformProps {
  audioUrl: string;
  events: SessionEvent[];
  duration: number;
  onTimeUpdate?: (time: number) => void;
  onSeek?: (time: number) => void;
}

/**
 * WaveSurfer-based audio waveform with error dot overlays.
 * Clicking error dots seeks to the error timestamp.
 */
export function ReportWaveform({
  audioUrl,
  events,
  duration,
  onTimeUpdate,
  onSeek,
}: ReportWaveformProps) {
  const {
    containerRef,
    isPlaying,
    isReady,
    currentTime,
    duration: audioDuration,
    toggle,
    seekTo,
  } = useWaveSurfer({
    url: audioUrl,
    waveColor: "#71716E", // stone
    progressColor: "#0A0A0A", // ink
    cursorColor: "#1E40AF", // accent-blue
    height: 64,
    barWidth: 2,
    barGap: 2,
    barRadius: 1,
  });

  const [hoveredError, setHoveredError] = useState<number | null>(null);

  // Notify parent of time updates
  useEffect(() => {
    onTimeUpdate?.(currentTime);
  }, [currentTime, onTimeUpdate]);

  // Filter for error events with timestamps
  const errorEvents = events.filter(
    (e) =>
      (e.event_type === "substitution" ||
        e.event_type === "omission" ||
        e.event_type === "self_correction") &&
      e.start_timestamp_ms !== null
  );

  // Calculate error dot positions
  const getErrorPosition = (event: SessionEvent): number => {
    if (!event.start_timestamp_ms || !audioDuration) return 0;
    const timeSeconds = event.start_timestamp_ms / 1000;
    return (timeSeconds / audioDuration) * 100;
  };

  const handleErrorClick = (event: SessionEvent) => {
    if (event.start_timestamp_ms === null) return;
    const timeSeconds = event.start_timestamp_ms / 1000;
    seekTo(timeSeconds);
    onSeek?.(timeSeconds);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full overflow-hidden">
      {/* Waveform container */}
      <div className="relative overflow-hidden">
        <div ref={containerRef} className="w-full" />

        {/* Error dots overlay */}
        {isReady && (
          <div className="absolute inset-0 pointer-events-none">
            {errorEvents.map((event, idx) => {
              const position = getErrorPosition(event);
              const isHovered = hoveredError === idx;
              const isSubstitution = event.event_type === "substitution";
              const isOmission = event.event_type === "omission";
              const isSelfCorrection = event.event_type === "self_correction";

              const dotColor = isSelfCorrection
                ? "bg-warning"
                : "bg-alert";

              const tooltip = isSubstitution
                ? `Said "${event.spoken_word}" instead of "${event.expected_word}"`
                : isOmission
                ? `Skipped "${event.expected_word}"`
                : `Corrected "${event.spoken_word}" to "${event.expected_word}"`;

              return (
                <div
                  key={idx}
                  className="absolute top-0 pointer-events-auto cursor-pointer"
                  style={{
                    left: `${position}%`,
                    transform: "translateX(-50%)",
                  }}
                  onMouseEnter={() => setHoveredError(idx)}
                  onMouseLeave={() => setHoveredError(null)}
                  onClick={() => handleErrorClick(event)}
                >
                  {/* Dot */}
                  <div
                    className={`w-2 h-2 rounded-full ${dotColor} ${
                      isHovered ? "ring-2 ring-offset-1" : ""
                    } ${isSelfCorrection ? "ring-warning/50" : "ring-alert/50"}`}
                    style={{ marginTop: -4 }}
                  />

                  {/* Tooltip */}
                  {isHovered && (
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-ink text-paper text-xs rounded whitespace-nowrap z-10"
                    >
                      {tooltip}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-3">
        <button
          onClick={toggle}
          className="flex items-center gap-2 text-sm text-ink hover:text-accent-blue transition-colors"
          disabled={!isReady}
        >
          {isPlaying ? (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
              Pause
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </>
          )}
        </button>

        <span className="text-sm text-stone font-mono">
          {formatTime(currentTime)} / {formatTime(audioDuration || duration)}
        </span>
      </div>
    </div>
  );
}
