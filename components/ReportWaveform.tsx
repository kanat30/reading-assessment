"use client";

import { useRef, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useWaveSurfer } from "@/hooks/useWaveSurfer";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SessionEvent } from "@/lib/scoring/types";
import { SCORE_REVEAL } from "@/lib/animation/constants";

// Seek request with unique ID to allow re-seeking to the same position
interface SeekRequest {
  time: number;
  id: number;
}

interface ReportWaveformProps {
  audioUrl: string;
  events: SessionEvent[];
  duration: number;
  seekRequest?: SeekRequest | null;
  onTimeUpdate?: (time: number) => void;
  onSeek?: (time: number) => void;
}

/**
 * WaveSurfer-based audio waveform with refined error dot overlays.
 * Week 5 refinements:
 * - Height increased to 80px
 * - Distinct dot styles for substitutions, omissions, and self-corrections
 * - Improved hover state with inline labels
 */
export function ReportWaveform({
  audioUrl,
  events,
  duration,
  seekRequest,
  onTimeUpdate,
  onSeek,
}: ReportWaveformProps) {
  const reducedMotion = useReducedMotion();

  const {
    containerRef,
    isPlaying,
    isReady,
    currentTime,
    duration: audioDuration,
    toggle,
    seekTo,
    play,
  } = useWaveSurfer({
    url: audioUrl,
    waveColor: "#71716E", // stone
    progressColor: "#0A0A0A", // ink
    cursorColor: "#1E40AF", // accent-blue
    cursorWidth: 2,
    height: 80, // Increased from 64px
    barWidth: 2,
    barGap: 2,
    barRadius: 1,
  });

  const [hoveredError, setHoveredError] = useState<number | null>(null);
  const [showErrorDots, setShowErrorDots] = useState(false);

  // Trigger error dots stagger after waveform is ready
  useEffect(() => {
    if (reducedMotion) {
      setShowErrorDots(true);
      return;
    }

    if (isReady) {
      const timer = setTimeout(() => {
        setShowErrorDots(true);
      }, SCORE_REVEAL.errorDotDelay * 1000);
      return () => clearTimeout(timer);
    }
  }, [isReady, reducedMotion]);

  // Notify parent of time updates
  useEffect(() => {
    onTimeUpdate?.(currentTime);
  }, [currentTime, onTimeUpdate]);

  // Track last processed seek request to avoid duplicate seeks
  const lastSeekIdRef = useRef<number>(0);

  // Respond to external seek requests (e.g., from transcript word clicks)
  useEffect(() => {
    if (seekRequest && isReady && seekRequest.id !== lastSeekIdRef.current) {
      lastSeekIdRef.current = seekRequest.id;
      seekTo(seekRequest.time);
      onSeek?.(seekRequest.time);
      // Auto-play after seeking for better UX
      if (!isPlaying) {
        play();
      }
    }
  }, [seekRequest, isReady, seekTo, onSeek, isPlaying, play]);

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
    <motion.div
      className="w-full"
      initial={{ opacity: reducedMotion ? 1 : 0 }}
      animate={{ opacity: isReady ? 1 : (reducedMotion ? 1 : 0) }}
      transition={reducedMotion ? { duration: 0 } : { duration: SCORE_REVEAL.waveformFade, ease: "easeOut" }}
    >
      {/* Waveform container with padding for error dots */}
      <div className="relative pt-4">
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

              // Dot sizing: substitutions/omissions = 10px, self-corrections = 8px
              const dotSize = isSelfCorrection ? "w-2 h-2" : "w-2.5 h-2.5";

              // Tooltip content
              const tooltip = isSubstitution
                ? `"${event.spoken_word}" → "${event.expected_word}"`
                : isOmission
                ? `skipped "${event.expected_word}"`
                : `corrected "${event.expected_word}"`;

              return (
                <motion.div
                  key={idx}
                  className="absolute top-0 pointer-events-auto cursor-pointer"
                  style={{
                    left: `${position}%`,
                    transform: "translateX(-50%)",
                  }}
                  initial={{ opacity: reducedMotion ? 1 : 0 }}
                  animate={{ opacity: showErrorDots ? 1 : 0 }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : {
                          duration: 0.15,
                          delay: idx * SCORE_REVEAL.errorDotStagger,
                          ease: "easeOut",
                        }
                  }
                  onMouseEnter={() => setHoveredError(idx)}
                  onMouseLeave={() => setHoveredError(null)}
                  onClick={() => handleErrorClick(event)}
                >
                  {/* Tooltip - appears above the dot */}
                  {isHovered && (
                    <div
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-paper text-ink text-xs rounded-full whitespace-nowrap z-20 shadow-sm border border-mist"
                      style={{ minWidth: "max-content" }}
                    >
                      {tooltip}
                    </div>
                  )}

                  {/* Dot */}
                  <div
                    className={`${dotSize} rounded-full transition-transform duration-[120ms] ${
                      isHovered ? "scale-125" : ""
                    } ${
                      isOmission
                        ? "bg-transparent border-[1.5px] border-alert"
                        : isSelfCorrection
                        ? "bg-warning"
                        : "bg-alert"
                    }`}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mt-4">
        <button
          onClick={toggle}
          className={`
            flex items-center justify-center gap-2
            px-5 py-2 rounded-full
            text-sm font-medium
            transition-all duration-150
            ${isReady
              ? "bg-mist/60 hover:bg-mist text-ink active:scale-[0.98]"
              : "bg-mist/30 text-stone cursor-not-allowed"
            }
          `}
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

        <span className="text-sm text-stone tabular-nums">
          {formatTime(currentTime)} / {formatTime(audioDuration || duration)}
        </span>
      </div>
    </motion.div>
  );
}
