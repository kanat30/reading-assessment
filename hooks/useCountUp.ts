"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Custom hook for count-up animation
 * Counts from 0 to target over a specified duration with ease-out curve
 *
 * @param target - The target number to count up to
 * @param durationMs - Duration of the animation in milliseconds (default: 800)
 * @param enabled - Whether the animation should play (default: true)
 * @param reducedMotion - Whether to skip animation for accessibility (default: false)
 */
export function useCountUp(
  target: number,
  durationMs: number = 800,
  enabled: boolean = true,
  reducedMotion: boolean = false
): number {
  const [current, setCurrent] = useState(0);
  const hasAnimated = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Skip animation when reduced motion is preferred
    if (reducedMotion && enabled) {
      setCurrent(target);
      return;
    }

    // Only animate once per component mount when enabled
    if (!enabled || hasAnimated.current) {
      if (!enabled) {
        setCurrent(0);
      }
      return;
    }

    hasAnimated.current = true;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);

      // Ease-out curve: 1 - (1 - x)^3
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      const newValue = Math.round(easedProgress * target);
      setCurrent(newValue);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setCurrent(target);
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [target, durationMs, enabled, reducedMotion]);

  // Reset when target changes
  useEffect(() => {
    if (hasAnimated.current && enabled) {
      // Already animated, just update to new target
      setCurrent(target);
    }
  }, [target, enabled]);

  return current;
}
