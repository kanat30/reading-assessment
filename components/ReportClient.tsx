"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { SyncedTranscript } from "./SyncedTranscript";
import { ProsodyGauges } from "./ProsodyGauges";
import { AIBadge } from "./AIBadge";
import { SessionEvent, SessionEventOverride, ScoringMetrics, EventType, EventOverrideAction } from "@/lib/scoring/types";

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
  metrics: ScoringMetrics;
  durationSeconds: number;
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
  metrics,
  durationSeconds,
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
      {/* WaveSurfer waveform with error dots */}
      <div>
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Audio Playback
        </h3>
        <ReportWaveform
          audioUrl={`/api/audio/${sessionId}`}
          events={events}
          duration={durationSeconds}
          seekRequest={seekRequest}
          onTimeUpdate={handleTimeUpdate}
          onSeek={handleWaveformSeek}
        />
      </div>

      {/* Prosody gauges */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-sm font-medium text-stone uppercase tracking-wide">
            Fluency Dimensions
          </h3>
          <AIBadge />
        </div>
        <ProsodyGauges events={events} metrics={metrics} isVisible={isVisible} onDotClick={onProsodyDotClick} />
      </div>

      {/* Synced transcript */}
      <div>
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Reading Transcript
        </h3>
        <p className="text-xs text-stone mb-3 italic">
          Click any word to jump to that moment in the recording.
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
