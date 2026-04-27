"use client";

import { motion } from "framer-motion";

interface BreathingDotProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * A pulsing dot that "breathes" using a 2-second sine wave.
 * Scales from 1.0 to 1.15 in a smooth, calming rhythm.
 */
export function BreathingDot({
  size = 16,
  color = "bg-accent-blue",
  className = "",
}: BreathingDotProps) {
  return (
    <motion.div
      className={`rounded-full ${color} ${className}`}
      style={{ width: size, height: size }}
      animate={{
        scale: [1, 1.15, 1],
      }}
      transition={{
        duration: 2,
        ease: "easeInOut",
        repeat: Infinity,
        repeatType: "loop",
      }}
    />
  );
}
