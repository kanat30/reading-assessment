"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { SyncedTranscript } from "./SyncedTranscript";
import { ProsodyGauges } from "./ProsodyGauges";
import { SessionEvent, SessionEventOverride, EventType, EventOverrideAction, ProsodyDimensions } from "@/lib/scoring/types";

// Dynamic import for ReportWaveform (heavy WaveSurfer dependency)
const ReportWaveform = dynamic(() => import("./ReportWaveform").then(m => ({ default: m.ReportWaveform })), {
  ssr: false,
  loading: () => <div className="h-[100px] bg-mist/30 rounded animate-pulse" />,
});

interface ReportClientProps {
  sessionId: string;
  passageText: string;
  events: SessionEvent[];
  eventOverrides?: SessionEventOverride[];
  /** Stored prosody dimensions from scores_json (incl. teacher overrides). */
  prosodyDimensions?: Partial<ProsodyDimensions> | null;
  overriddenProsodyDimensions?: string[];
  durationSeconds: number;
  /** False when the session has no stored audio (e.g. removed by retention); hides the dead player. */
  hasAudio?: boolean;
  /** Pre-computed peaks from scores_json so audio-less sessions still show the reading's shape. */
  waveformPeaks?: number[];
  errorCounts: { errors: number; mispronunciations: number; selfCorrections: number };
  isVisible?: boolean;
  onProsodyDotClick?: (dimension: string, level: number) => void;
  onEventOverrideSave?: (
    wordIndex: number,
    data: {
      action: EventOverrideAction;
      original_event_type: EventType;
      original_confidence?: number | null;
      new_event_type?: EventType;
      spoken_word_override?: string;
      reason?: string;
    }
  ) => Promise<void>;
  onEventOverrideDelete?: (wordIndex: number) => Promise<void>;
}

/**
 * Client-side interactive components for the report page.
 * Handles audio playback synchronization with transcript.
 */
// Seek request with unique ID to allow re-seeking to the same position
interface SeekRequest {
  time: number;
  id: number;
}

export function ReportClient({
  sessionId,
  passageText,
  events,
  eventOverrides = [],
  prosodyDimensions = null,
  overriddenProsodyDimensions = [],
  durationSeconds,
  hasAudio = true,
  waveformPeaks,
  errorCounts,
  isVisible = true,
  onProsodyDotClick,
  onEventOverrideSave,
  onEventOverrideDelete,
}: ReportClientProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [seekRequest, setSeekRequest] = useState<SeekRequest | null>(null);
  const seekIdRef = useRef(0);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleWaveformSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleWordClick = useCallback((wordIndex: number, timestamp: number | null) => {
    if (timestamp !== null) {
      const timeInSeconds = timestamp / 1000;
      seekIdRef.current += 1;
      setSeekRequest({ time: timeInSeconds, id: seekIdRef.current });
      setCurrentTime(timeInSeconds);
    }
  }, []);

  return (
    <div className="space-y-8 overflow-hidden">
      {/* WaveSurfer waveform with error dots; static peaks when there is no audio */}
      <div>
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Audio Playback
        </h3>
        {hasAudio ? (
          <ReportWaveform
            audioUrl={`/api/audio/${sessionId}`}
            events={events}
            duration={durationSeconds}
            seekRequest={seekRequest}
            onTimeUpdate={handleTimeUpdate}
            onSeek={handleWaveformSeek}
          />
        ) : (
          <div>
            <div className="h-[80px] flex items-center gap-[2px] overflow-hidden">
              {(waveformPeaks ?? []).map((peak, i) => (
                <div
                  key={i}
                  className="w-[2px] shrink-0 rounded-[1px] bg-stone/50"
                  style={{ height: `${Math.max(3, peak * 76)}px` }}
                />
              ))}
            </div>
            <p className="text-xs text-stone mt-2 italic">
              Audio is not available for this reading.
            </p>
          </div>
        )}
      </div>

      {/* Prosody gauges — stored deterministic dimensions (Expression is
          teacher-rated), not an AI output, so no AI badge here. */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-medium text-stone uppercase tracking-wide">
            Fluency Dimensions
          </h3>
          <span className="text-[10px] text-stone uppercase tracking-wider">
            computed from timing data · click a dot to adjust
          </span>
        </div>
        <ProsodyGauges
          dimensions={prosodyDimensions}
          overriddenDimensions={overriddenProsodyDimensions}
          isVisible={isVisible}
          onDotClick={onProsodyDotClick}
        />
      </div>

      {/* Synced transcript */}
      <div>
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Reading Transcript
        </h3>
        <p className="text-xs text-stone mb-3 italic">
          {hasAudio
            ? "Click any word to jump to that moment in the recording."
            : "Click any flagged word to review or override it."}
        </p>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm mb-4 pb-4 border-b border-mist/40">
          <div className="flex items-center gap-2">
            <span className="text-alert border-b border-dotted border-alert">word</span>
            <span className="text-stone">
              Error {errorCounts.errors > 0 && `(${errorCounts.errors})`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-warning border-b border-dotted border-warning">word</span>
            <span className="text-stone">
              Hesitation {(errorCounts.mispronunciations + errorCounts.selfCorrections) > 0 && `(${errorCounts.mispronunciations + errorCounts.selfCorrections})`}
            </span>
          </div>
          {eventOverrides.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-ink border-b-2 border-solid border-accent-blue">word</span>
              <span className="text-stone">
                Teacher override ({eventOverrides.length})
              </span>
            </div>
          )}
        </div>

        <SyncedTranscript
          passageText={passageText}
          events={events}
          currentTime={currentTime}
          overrides={eventOverrides}
          onWordClick={handleWordClick}
          onOverrideSave={onEventOverrideSave}
          onOverrideDelete={onEventOverrideDelete}
        />
      </div>
    </div>
  );
}
