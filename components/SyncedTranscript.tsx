"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { SessionEvent, SessionEventOverride, EventType, EventOverrideAction } from "@/lib/scoring/types";
import { WordOverridePopover } from "./WordOverridePopover";

interface SyncedTranscriptProps {
  passageText: string;
  events: SessionEvent[];
  currentTime: number;
  overrides?: SessionEventOverride[];
  onWordClick?: (wordIndex: number, timestamp: number | null) => void;
  onOverrideSave?: (
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
  onOverrideDelete?: (wordIndex: number) => Promise<void>;
}

/**
 * Clickable transcript with word-level highlighting.
 * Words are highlighted based on current playback time.
 * Clicking a word seeks to its timestamp or opens override popover.
 */
export function SyncedTranscript({
  passageText,
  events,
  currentTime,
  overrides = [],
  onWordClick,
  onOverrideSave,
  onOverrideDelete,
}: SyncedTranscriptProps) {
  const words = passageText.split(/\s+/);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [selectedWordIndex, setSelectedWordIndex] = useState<number | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Create a map of word indices to events
  const eventMap = useMemo(() => {
    const map = new Map<number, SessionEvent>();
    events.forEach((e) => {
      map.set(e.word_index, e);
    });
    return map;
  }, [events]);

  // Create a map of word indices to overrides
  const overrideMap = useMemo(() => {
    const map = new Map<number, SessionEventOverride>();
    overrides.forEach((o) => {
      map.set(o.word_index, o);
    });
    return map;
  }, [overrides]);

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

  // Get effective event type considering overrides
  const getEffectiveEventType = (index: number): EventType => {
    const event = eventMap.get(index);
    const override = overrideMap.get(index);

    if (!override) {
      return event?.event_type || "correct";
    }

    // Apply override logic
    if (override.action === "reject") {
      // Teacher says AI was wrong - mark as correct
      return "correct";
    } else if (override.action === "flag_error" && override.new_event_type) {
      // Teacher flagged an error
      return override.new_event_type;
    } else if (override.action === "approve") {
      // Teacher confirms AI detection
      return event?.event_type || "correct";
    }

    return event?.event_type || "correct";
  };

  const handleWordClick = useCallback(
    (index: number, element: HTMLElement) => {
      const event = eventMap.get(index);

      // If override callbacks are provided, open the popover (don't auto-seek)
      if (onOverrideSave && onOverrideDelete) {
        const rect = element.getBoundingClientRect();
        setSelectedWordIndex(index);
        setAnchorRect(rect);
        setPopoverOpen(true);
        // Don't trigger seek - user can use "Play from here" in popover
        return;
      }

      // Only trigger seek if no override handlers (backward compatible)
      const timestamp = event?.start_timestamp_ms ?? null;
      onWordClick?.(index, timestamp);
    },
    [eventMap, onWordClick, onOverrideSave, onOverrideDelete]
  );

  const handlePopoverSave = useCallback(
    async (data: {
      action: EventOverrideAction;
      new_event_type?: EventType;
      spoken_word_override?: string;
      reason?: string;
    }) => {
      if (selectedWordIndex === null || !onOverrideSave) return;

      const event = eventMap.get(selectedWordIndex);
      await onOverrideSave(selectedWordIndex, {
        ...data,
        original_event_type: event?.event_type || "correct",
        original_confidence: event?.confidence_score ?? null,
      });
    },
    [selectedWordIndex, eventMap, onOverrideSave]
  );

  const handlePopoverDelete = useCallback(async () => {
    if (selectedWordIndex === null || !onOverrideDelete) return;
    await onOverrideDelete(selectedWordIndex);
  }, [selectedWordIndex, onOverrideDelete]);

  const handlePlayFromHere = useCallback(() => {
    if (selectedWordIndex === null) return;
    const event = eventMap.get(selectedWordIndex);
    const timestamp = event?.start_timestamp_ms ?? null;
    onWordClick?.(selectedWordIndex, timestamp);
  }, [selectedWordIndex, eventMap, onWordClick]);

  const getWordClasses = (index: number): string => {
    const event = eventMap.get(index);
    const override = overrideMap.get(index);
    const effectiveType = getEffectiveEventType(index);
    const isActive = activeWordIndex === index;

    let classes = "cursor-pointer transition-all duration-150 py-0.5 px-0.5 rounded ";

    // Active word highlight
    if (isActive) {
      classes += "bg-accent-blue/10 ";
    }

    // Check if there's an override
    const hasOverride = !!override;

    // Word styling based on effective event type and override status
    if (hasOverride) {
      // Overridden word: blue solid underline + color based on effective type
      if (effectiveType === "substitution" || effectiveType === "omission") {
        classes += "text-alert border-b-2 border-solid border-accent-blue ";
      } else if (effectiveType === "mispronunciation" || effectiveType === "self_correction") {
        classes += "text-warning border-b-2 border-solid border-accent-blue ";
      } else {
        // Correct (possibly overridden from error to correct)
        classes += "text-ink border-b-2 border-solid border-accent-blue hover:bg-mist/50 ";
      }
    } else if (event) {
      // No override - use original AI detection
      if (event.event_type === "substitution" || event.event_type === "omission") {
        // Hard errors: wrong word or skipped word
        classes += "text-alert border-b border-dotted border-alert ";
      } else if (event.event_type === "mispronunciation" || event.event_type === "self_correction") {
        // Hesitations: unclear pronunciation or self-corrected
        classes += "text-warning border-b border-dotted border-warning ";
      } else {
        // Correct words
        classes += "text-ink hover:bg-mist/50 ";
      }
    } else {
      // Words without events (not yet reached or no data)
      classes += "text-ink hover:bg-mist/50 ";
    }

    return classes;
  };

  const getWordTooltip = (index: number): string | undefined => {
    const event = eventMap.get(index);
    const override = overrideMap.get(index);

    // Build tooltip with override info if present
    let tooltip = "";

    if (override) {
      if (override.action === "flag_error") {
        tooltip = `Teacher flagged: ${override.new_event_type?.replace("_", " ")}`;
      } else if (override.action === "reject") {
        tooltip = `Teacher marked correct (AI said: ${override.original_event_type.replace("_", " ")})`;
      } else if (override.action === "approve") {
        tooltip = `Teacher confirmed: ${event?.event_type.replace("_", " ")}`;
      }
      if (override.reason) {
        tooltip += ` - "${override.reason}"`;
      }
      return tooltip;
    }

    // No override - show original AI detection info
    if (!event) return "Click to review";

    if (event.event_type === "substitution") {
      return `Said "${event.spoken_word}" instead`;
    } else if (event.event_type === "omission") {
      return "Word was skipped";
    } else if (event.event_type === "self_correction") {
      return `First said "${event.spoken_word}", then corrected`;
    } else if (event.event_type === "mispronunciation") {
      const confidence = event.confidence_score ? Math.round(event.confidence_score * 100) : 0;
      return `Unclear pronunciation (${confidence}% confidence)`;
    }

    return "Click to review";
  };

  // Get selected word data for popover
  const selectedWord = selectedWordIndex !== null ? words[selectedWordIndex] : "";
  const selectedEvent = selectedWordIndex !== null ? eventMap.get(selectedWordIndex) || null : null;
  const selectedOverride = selectedWordIndex !== null ? overrideMap.get(selectedWordIndex) || null : null;

  return (
    <div ref={containerRef} className="overflow-hidden">
      <p className="font-serif text-xl leading-relaxed break-words">
        {words.map((word, index) => (
          <span
            key={index}
            data-word-index={index}
            className={getWordClasses(index)}
            title={getWordTooltip(index)}
            onClick={(e) => handleWordClick(index, e.currentTarget)}
          >
            {word}{" "}
          </span>
        ))}
      </p>

      {/* Override Popover */}
      {onOverrideSave && onOverrideDelete && (
        <WordOverridePopover
          isOpen={popoverOpen}
          word={selectedWord}
          wordIndex={selectedWordIndex ?? 0}
          event={selectedEvent}
          existingOverride={selectedOverride}
          anchorRect={anchorRect}
          onClose={() => setPopoverOpen(false)}
          onSave={handlePopoverSave}
          onDelete={handlePopoverDelete}
          onPlayFromHere={handlePlayFromHere}
        />
      )}
    </div>
  );
}
