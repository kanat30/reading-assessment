"use client";

import { motion } from "framer-motion";

interface ProgressIndicatorProps {
  currentPassage: number; // 0-indexed
  totalPassages: number;
}

export function ProgressIndicator({ currentPassage, totalPassages }: ProgressIndicatorProps) {
  if (totalPassages <= 1) return null;

  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-xs text-stone font-medium">
        Passage {currentPassage + 1} of {totalPassages}
      </span>
      <div className="flex gap-1">
        {Array.from({ length: totalPassages }).map((_, index) => (
          <motion.div
            key={index}
            initial={false}
            animate={{
              scale: index === currentPassage ? 1 : 0.8,
              opacity: index <= currentPassage ? 1 : 0.3,
            }}
            className={`w-2 h-2 rounded-full transition-colors ${
              index < currentPassage
                ? "bg-success"
                : index === currentPassage
                  ? "bg-accent-blue"
                  : "bg-mist"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
