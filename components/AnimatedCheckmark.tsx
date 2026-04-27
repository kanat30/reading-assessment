"use client";

import { motion } from "framer-motion";

interface AnimatedCheckmarkProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  delay?: number;
  className?: string;
}

/**
 * An animated checkmark using SVG stroke-dashoffset.
 * The checkmark draws itself on mount with a smooth animation.
 */
export function AnimatedCheckmark({
  size = 80,
  strokeWidth = 2.5,
  color = "text-success",
  bgColor = "bg-success/10",
  delay = 0.1,
  className = "",
}: AnimatedCheckmarkProps) {
  // Calculate path length for the checkmark
  // The path is "M5 13l4 4L19 7" which is approximately 20 units
  const pathLength = 20;

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      className={`rounded-full ${bgColor} flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        className={`${color}`}
        style={{ width: size * 0.5, height: size * 0.5 }}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth={strokeWidth}
      >
        <motion.path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M5 13l4 4L19 7"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            pathLength: {
              duration: 0.4,
              delay: delay + 0.2,
              ease: "easeOut",
            },
            opacity: {
              duration: 0.1,
              delay: delay + 0.2,
            },
          }}
          style={{
            strokeDasharray: pathLength,
            strokeDashoffset: 0,
          }}
        />
      </svg>
    </motion.div>
  );
}
