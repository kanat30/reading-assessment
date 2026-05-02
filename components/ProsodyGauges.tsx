"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SessionEvent, ScoringMetrics } from "@/lib/scoring/types";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SCORE_REVEAL } from "@/lib/animation/constants";

// Concise explanations for each dimension
const DIMENSION_INFO: Record<string, string> = {
  expression: "Variation in tone and emphasis",
  phrasing: "Natural pauses at phrase boundaries",
  smoothness: "Reading without frequent corrections",
  pace: "Consistent reading speed (WCPM)",
};

function InfoTooltip({ text, align = "left" }: { text: string; align?: "left" | "right" }) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  const handleClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="text-stone/40 hover:text-stone transition-colors p-0.5"
        aria-label="More info"
      >
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className={`absolute top-full mt-1.5 z-50 ${
              align === "right" ? "right-0" : "left-0"
            }`}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            <div className="bg-ink text-paper text-xs px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-lg">
              {text}
            </div>
            {/* Arrow */}
            <div className={`absolute -top-1 w-2 h-2 bg-ink rotate-45 ${
              align === "right" ? "right-1.5" : "left-1.5"
            }`} />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

interface ProsodyGaugesProps {
  events: SessionEvent[];
  metrics: ScoringMetrics;
  isVisible?: boolean;
  onDotClick?: (dimension: string, level: number) => void;
}

interface DimensionScore {
  id: string;
  label: string;
  value: 1 | 2 | 3 | 4;
  description: string;
}

/**
 * Four MDFS (Multi-Dimensional Fluency Scale) prosody gauges.
 * Refined for Week 5 with staggered entrance animation and click-to-override.
 * Week 6: Added reduced motion support.
 */
export function ProsodyGauges({
  events,
  metrics,
  isVisible = true,
  onDotClick,
}: ProsodyGaugesProps) {
  const reducedMotion = useReducedMotion();
  const [animationStarted, setAnimationStarted] = useState(false);

  // Start animation when visible (or immediately if reduced motion)
  useEffect(() => {
    if (reducedMotion) {
      setAnimationStarted(true);
      return;
    }
    if (isVisible && !animationStarted) {
      setAnimationStarted(true);
    }
  }, [isVisible, animationStarted, reducedMotion]);

  // Calculate prosody dimensions
  const dimensions = calculateProsodyDimensions(events, metrics);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {dimensions.map((dim, rowIndex) => (
        <div key={dim.id} className="flex flex-col gap-1.5">
          {/* Label with info tooltip */}
          <div className="flex items-center gap-1">
            <p className="text-sm text-stone lowercase">
              {dim.label}
            </p>
            <InfoTooltip
              text={DIMENSION_INFO[dim.id]}
              align={rowIndex >= 2 ? "right" : "left"}
            />
          </div>

          {/* Dots */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4].map((level) => {
              const dotIndex = rowIndex * 4 + (level - 1);
              const isFilled = level <= dim.value;

              return (
                <motion.button
                  key={level}
                  initial={{ opacity: reducedMotion ? 1 : 0 }}
                  animate={animationStarted ? { opacity: 1 } : { opacity: 0 }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : {
                          duration: 0.15,
                          delay: dotIndex * SCORE_REVEAL.dotStagger,
                          ease: "easeOut",
                        }
                  }
                  onClick={() => onDotClick?.(dim.id, level)}
                  className={`w-2 h-2 rounded-full transition-all duration-[120ms] cursor-pointer hover:scale-125 ${
                    isFilled ? "bg-ink" : "bg-mist"
                  }`}
                  title={`Set ${dim.label.toLowerCase()} to ${level}`}
                  aria-label={`Set ${dim.label.toLowerCase()} to ${level}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Calculate prosody dimensions using rule-based heuristics.
 */
function calculateProsodyDimensions(
  events: SessionEvent[],
  metrics: ScoringMetrics
): DimensionScore[] {
  // Expression: Based on word duration variance
  const expression = calculateExpression(events);

  // Phrasing: 4 minus count of pauses > 1.5s
  const phrasing = calculatePhrasing(events);

  // Smoothness: 4 minus self-corrections count, clamped
  const smoothness = calculateSmoothness(events);

  // Pace: From WCPM
  const pace = calculatePace(metrics.wcpm);

  return [
    {
      id: "expression",
      label: "Expression",
      value: expression.value,
      description: expression.description,
    },
    {
      id: "phrasing",
      label: "Phrasing",
      value: phrasing.value,
      description: phrasing.description,
    },
    {
      id: "smoothness",
      label: "Smoothness",
      value: smoothness.value,
      description: smoothness.description,
    },
    {
      id: "pace",
      label: "Pace",
      value: pace.value,
      description: pace.description,
    },
  ];
}

function calculateExpression(events: SessionEvent[]): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  const durations: number[] = [];

  for (const e of events) {
    if (e.start_timestamp_ms !== null && e.end_timestamp_ms !== null) {
      const duration = e.end_timestamp_ms - e.start_timestamp_ms;
      if (duration > 0 && duration < 2000) {
        durations.push(duration);
      }
    }
  }

  if (durations.length < 5) {
    return { value: 2, description: "Limited data for expression analysis" };
  }

  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
    durations.length;
  const coeffOfVariation = Math.sqrt(variance) / mean;

  if (coeffOfVariation >= 0.3 && coeffOfVariation <= 0.6) {
    return { value: 4, description: "Natural variation in word emphasis" };
  } else if (coeffOfVariation >= 0.2 && coeffOfVariation < 0.7) {
    return { value: 3, description: "Some variation in expression" };
  } else if (coeffOfVariation < 0.2) {
    return { value: 2, description: "Mostly monotone delivery" };
  } else {
    return { value: 2, description: "Inconsistent word timing" };
  }
}

function calculatePhrasing(events: SessionEvent[]): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  let longPauses = 0;

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    if (prev.end_timestamp_ms !== null && curr.start_timestamp_ms !== null) {
      const gap = curr.start_timestamp_ms - prev.end_timestamp_ms;
      if (gap > 1500) {
        longPauses++;
      }
    }
  }

  const value = Math.max(1, Math.min(4, 4 - longPauses)) as 1 | 2 | 3 | 4;

  const descriptions: Record<number, string> = {
    4: "Natural phrase boundaries",
    3: "Occasional hesitations",
    2: "Some long pauses",
    1: "Frequent interruptions",
  };

  return { value, description: descriptions[value] };
}

function calculateSmoothness(events: SessionEvent[]): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  const selfCorrections = events.filter(
    (e) => e.event_type === "self_correction"
  ).length;

  const value = Math.max(1, Math.min(4, 4 - selfCorrections)) as 1 | 2 | 3 | 4;

  const descriptions: Record<number, string> = {
    4: "Smooth, uninterrupted reading",
    3: "Minor corrections made",
    2: "Several self-corrections",
    1: "Frequent self-corrections",
  };

  return { value, description: descriptions[value] };
}

function calculatePace(wcpm: number): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  let value: 1 | 2 | 3 | 4;
  let description: string;

  if (wcpm >= 90) {
    value = 4;
    description = "Appropriate, consistent pace";
  } else if (wcpm >= 70) {
    value = 3;
    description = "Generally steady pace";
  } else if (wcpm >= 50) {
    value = 2;
    description = "Slow but steady";
  } else {
    value = 1;
    description = "Very slow pace";
  }

  return { value, description };
}
