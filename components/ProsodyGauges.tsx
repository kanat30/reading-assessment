"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ProsodyDimensions } from "@/lib/scoring/types";
import { prosodyTotal } from "@/lib/scoring/prosody";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SCORE_REVEAL } from "@/lib/animation/constants";

// Honest labels: three dimensions are deterministic rules over timing/event
// data (documented in lib/scoring/prosody.ts); Expression cannot be derived
// from ASR timestamps and is teacher-rated.
const DIMENSION_INFO: Record<string, string> = {
  expression: "Teacher-rated — timing data cannot measure expression",
  phrasing: "Computed from pause placement (mid-sentence vs. at punctuation)",
  smoothness: "Computed from the self-correction/mispronunciation rate",
  pace: "Computed from words correct per minute",
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
  /**
   * The stored dimension values from scores_json.prosody_dimensions — the ONE
   * prosody source (computed at score time, mutated only by teacher
   * overrides). This component renders them; it never computes its own.
   */
  dimensions: Partial<ProsodyDimensions> | null;
  /** Dimension names the teacher has overridden (shown as edited). */
  overriddenDimensions?: string[];
  isVisible?: boolean;
  onDotClick?: (dimension: string, level: number) => void;
}

const DIMENSION_ORDER: Array<{ id: keyof ProsodyDimensions; label: string }> = [
  { id: "expression", label: "Expression" },
  { id: "phrasing", label: "Phrasing" },
  { id: "smoothness", label: "Smoothness" },
  { id: "pace", label: "Pace" },
];

/**
 * Four MDFS (Multi-Dimensional Fluency Scale) prosody gauges rendering the
 * stored per-dimension values. Expression shows "Not yet rated" until a
 * teacher sets it (dot click opens the override panel — that IS the rating
 * mechanism). Total renders /16 only once all four dimensions have values.
 */
export function ProsodyGauges({
  dimensions,
  overriddenDimensions = [],
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

  if (!dimensions) {
    return (
      <p className="text-sm text-stone italic">
        Dimension scores are not available for this session (scored before
        per-dimension prosody). Re-run the scoring backfill to compute them.
      </p>
    );
  }

  const totals = prosodyTotal(dimensions);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {DIMENSION_ORDER.map((dim, rowIndex) => {
          const value = dimensions[dim.id] ?? null;
          const isEdited = overriddenDimensions.includes(dim.id);

          return (
            <div key={dim.id} className="flex flex-col gap-1.5">
              {/* Label with info tooltip */}
              <div className="flex items-center gap-1">
                <p className="text-sm text-stone lowercase">{dim.label}</p>
                <InfoTooltip
                  text={DIMENSION_INFO[dim.id]}
                  align={rowIndex >= 2 ? "right" : "left"}
                />
                {isEdited && (
                  <span className="text-[9px] text-stone uppercase tracking-wider border-b border-accent-blue">
                    edited
                  </span>
                )}
              </div>

              {/* Dots */}
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4].map((level) => {
                  const dotIndex = rowIndex * 4 + (level - 1);
                  const isFilled = value != null && level <= value;

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
                        isFilled
                          ? "bg-ink"
                          : value == null
                          ? "border border-stone/40 bg-transparent"
                          : "bg-mist"
                      }`}
                      title={`Set ${dim.label.toLowerCase()} to ${level}`}
                      aria-label={`Set ${dim.label.toLowerCase()} to ${level}`}
                    />
                  );
                })}
                {value == null && (
                  <span className="text-[10px] text-stone italic ml-1">
                    Not yet rated
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Total across dimensions — /16 only once Expression is rated */}
      {totals && (
        <p className="text-xs text-stone mt-4">
          Total: <span className="font-medium text-ink">{totals.total}/{totals.max}</span>
          {!totals.expressionRated && " (Expression not yet rated)"}
        </p>
      )}
    </div>
  );
}
