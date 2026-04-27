"use client";

import { useState, useCallback } from "react";
import { ReportWaveform } from "./ReportWaveform";
import { SyncedTranscript } from "./SyncedTranscript";
import { ProsodyGauges } from "./ProsodyGauges";
import { SessionEvent, ScoringMetrics } from "@/lib/scoring/types";

interface ReportClientProps {
  sessionId: string;
  passageText: string;
  events: SessionEvent[];
  metrics: ScoringMetrics;
  durationSeconds: number;
}

/**
 * Client-side interactive components for the report page.
 * Handles audio playback synchronization with transcript.
 */
export function ReportClient({
  sessionId,
  passageText,
  events,
  metrics,
  durationSeconds,
}: ReportClientProps) {
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState<number | null>(null);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleWaveformSeek = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleWordClick = useCallback((wordIndex: number, timestamp: number | null) => {
    if (timestamp !== null) {
      setSeekTime(timestamp / 1000);
      setCurrentTime(timestamp / 1000);
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
          onTimeUpdate={handleTimeUpdate}
          onSeek={handleWaveformSeek}
        />
      </div>

      {/* Prosody gauges */}
      <div>
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Fluency Dimensions
        </h3>
        <ProsodyGauges events={events} metrics={metrics} />
      </div>

      {/* Synced transcript */}
      <div>
        <h3 className="text-sm font-medium text-stone uppercase tracking-wide mb-4">
          Reading Transcript
        </h3>
        <p className="text-xs text-stone mb-3 italic">
          Click any word to jump to that moment in the recording.
        </p>
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
