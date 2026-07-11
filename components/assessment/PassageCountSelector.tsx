"use client";

import { motion } from "framer-motion";

type PassageCount = 1 | 3;

interface PassageCountSelectorProps {
  value: PassageCount;
  onChange: (count: PassageCount) => void;
}

const COUNT_OPTIONS: {
  count: PassageCount;
  label: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    count: 3,
    label: "3 Passages",
    description: "Median-of-3 protocol for reliable benchmark scoring",
    recommended: true,
  },
  {
    count: 1,
    label: "1 Passage",
    description: "Quick check for progress monitoring",
  },
];

export function PassageCountSelector({ value, onChange }: PassageCountSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-500 mb-2">
        Select how many passages students will read. The median-of-3 protocol provides the most reliable WCPM score.
      </div>
      <div className="grid grid-cols-2 gap-3">
        {COUNT_OPTIONS.map((option) => {
          const isSelected = value === option.count;

          return (
            <motion.button
              key={option.count}
              onClick={() => onChange(option.count)}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`
                relative text-left p-4 rounded-lg border-2 transition-all
                ${isSelected
                  ? "border-[#171717] bg-[#171717]/10"
                  : "border-neutral-200 hover:border-neutral-300 bg-white"
                }
              `}
            >
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${isSelected ? "text-[#171717]" : "text-neutral-900"}`}>
                    {option.count}
                  </span>
                  {option.recommended && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#171717]/15 text-[#171717] font-medium">
                      Recommended
                    </span>
                  )}
                </div>
                <div className={`text-sm mt-1 ${isSelected ? "text-[#525252]" : "text-neutral-500"}`}>
                  {option.description}
                </div>
              </div>

              {/* Selection indicator */}
              {isSelected && (
                <motion.div
                  layoutId="count-selection"
                  className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#171717] flex items-center justify-center"
                  initial={false}
                >
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      {value === 3 && (
        <div className="p-3 bg-neutral-100 rounded-lg border border-neutral-200 text-sm text-neutral-700">
          <strong>Median scoring:</strong> The middle WCPM of 3 passages is used for benchmarking.
          This follows the Acadience/DIBELS protocol for more reliable fluency measurement.
        </div>
      )}
    </div>
  );
}
