"use client";

import { useState, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { SyncedTranscript } from "./SyncedTranscript";
import { ProsodyGauges } from "./ProsodyGauges";
import { SessionEvent, ScoringMetrics } from "@/lib/scoring/types";

// Dynamic import for ReportWaveform (heavy WaveSurfer dependency)
const ReportWaveform = dynamic(() => import("./ReportWaveform").then(m => ({ default: m.ReportWaveform })), {
  ssr: false,
  loading: () => <div className="h-[100px] bg-mist/30 rounded animate-pulse" />,
});

interface ReportClientProps {
  sessionId: string;
  passageText: string;
  events: SessionEvent[];
  metrics: ScoringMetrics;
  durationSeconds: number;
  errorCounts: { errors: number; mispronunciations: number; selfCorrections: number };
  isVisible?: boolean;
  onProsodyDotClick?: (dimension: string, level: number) => void;
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
  metrics,
  durationSeconds,
  errorCounts,
  isVisible = true,
  onProsodyDotClick,
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
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Fluency Dimensions
        </h3>
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
        </div>

        <SyncedTranscript
          passageText={passageText}
          events={events}
          currentTime={currentTime}
          onWordClick={handleWordClick}
        />
      </div>
    </div>
  );
}
