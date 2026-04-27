"use client";

import { useState, useEffect, useRef } from "react";
import { SessionEvent } from "@/lib/scoring/types";

interface SyncedTranscriptProps {
  passageText: string;
  events: SessionEvent[];
  currentTime: number;
  onWordClick?: (wordIndex: number, timestamp: number | null) => void;
}

/**
 * Clickable transcript with word-level highlighting.
 * Words are highlighted based on current playback time.
 * Clicking a word seeks to its timestamp.
 */
export function SyncedTranscript({
  passageText,
  events,
  currentTime,
  onWordClick,
}: SyncedTranscriptProps) {
  const words = passageText.split(/\s+/);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create a map of word indices to events
  const eventMap = new Map<number, SessionEvent>();
  events.forEach((e) => {
    eventMap.set(e.word_index, e);
  });

  // Create word timing data (for seeking)
  const wordTimings = events.map((e) => ({
    index: e.word_index,
    startMs: e.start_timestamp_ms,
    endMs: e.end_timestamp_ms,
  }));

  // Find the current word based on playback time
  useEffect(() => {
    const currentMs = currentTime * 1000;

    // Find the word that contains the current time
    let activeIndex: number | null = null;

    for (const timing of wordTimings) {
      if (timing.startMs !== null && timing.endMs !== null) {
        if (currentMs >= timing.startMs && currentMs <= timing.endMs) {
          activeIndex = timing.index;
          break;
        }
        // If we're past this word and before the next, stay on this word
        if (currentMs > timing.endMs) {
          activeIndex = timing.index;
        }
      }
    }

    setActiveWordIndex(activeIndex);
  }, [currentTime, wordTimings]);

  // Auto-scroll to active word
  useEffect(() => {
    if (activeWordIndex === null || !containerRef.current) return;

    const wordElement = containerRef.current.querySelector(
      `[data-word-index="${activeWordIndex}"]`
    );
    if (wordElement) {
      wordElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest",
      });
    }
  }, [activeWordIndex]);

  const handleWordClick = (index: number) => {
    const event = eventMap.get(index);
    const timestamp = event?.start_timestamp_ms ?? null;
    onWordClick?.(index, timestamp);
  };

  const getWordClasses = (index: number): string => {
    const event = eventMap.get(index);
    const isActive = activeWordIndex === index;

    let classes = "cursor-pointer transition-all duration-150 py-0.5 px-0.5 rounded ";

    // Active word highlight
    if (isActive) {
      classes += "bg-accent-blue/10 ";
    }

    // Error styling
    if (event) {
      if (event.event_type === "substitution" || event.event_type === "omission") {
        classes += "text-alert border-b border-dotted border-alert ";
      } else if (event.event_type === "self_correction") {
        classes += "text-warning ";
      }
    } else {
      classes += "text-ink hover:bg-mist/50 ";
    }

    return classes;
  };

  const getWordTooltip = (index: number): string | undefined => {
    const event = eventMap.get(index);
    if (!event) return undefined;

    if (event.event_type === "substitution") {
      return `Said "${event.spoken_word}" instead`;
    } else if (event.event_type === "omission") {
      return "Word was skipped";
    } else if (event.event_type === "self_correction") {
      return `First said "${event.spoken_word}", then corrected`;
    }
    return undefined;
  };

  return (
    <div ref={containerRef} className="overflow-hidden">
      <p className="font-serif text-xl leading-relaxed break-words">
        {words.map((word, index) => (
          <span
            key={index}
            data-word-index={index}
            className={getWordClasses(index)}
            title={getWordTooltip(index)}
            onClick={() => handleWordClick(index)}
          >
            {word}{" "}
          </span>
        ))}
      </p>
    </div>
  );
}
