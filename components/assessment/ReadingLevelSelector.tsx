"use client";

import { motion } from "framer-motion";
import { ReadingLevel, getLexileRange } from "@/lib/passages/library";

interface ReadingLevelSelectorProps {
  value: ReadingLevel | null;
  onChange: (level: ReadingLevel) => void;
}

const LEVEL_OPTIONS: {
  level: ReadingLevel;
  label: string;
  subtitle: string;
}[] = [
  { level: 3, label: "Level 3", subtitle: "3rd-4th grade reading" },
  { level: 4, label: "Level 4", subtitle: "4th-5th grade reading" },
  { level: 5, label: "Level 5", subtitle: "6th grade" },
  { level: 6, label: "Level 6", subtitle: "7th grade" },
  { level: 7, label: "Level 7", subtitle: "8th grade+" },
];

export function ReadingLevelSelector({ value, onChange }: ReadingLevelSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-neutral-500 mb-2">
        Select the reading level for this assessment. This determines which passages will be available.
      </div>
      <div className="grid gap-2">
        {LEVEL_OPTIONS.map((option) => {
          const lexileRange = getLexileRange(option.level);
          const isSelected = value === option.level;

          return (
            <motion.button
              key={option.level}
              onClick={() => onChange(option.level)}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className={`
                relative w-full text-left p-4 rounded-lg border-2 transition-all
                ${isSelected
                  ? "border-[#171717] bg-[#171717]/10"
                  : "border-neutral-200 hover:border-neutral-300 bg-white"
                }
              `}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${isSelected ? "text-[#171717]" : "text-neutral-900"}`}>
                      {option.label}
                    </span>
                  </div>
                  <div className="text-sm text-neutral-500 mt-0.5">
                    {option.subtitle}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <div className={`text-sm font-mono ${isSelected ? "text-[#525252]" : "text-neutral-400"}`}>
                    {lexileRange.min}L-{lexileRange.max}L
                  </div>
                  {/* Selection indicator */}
                  {isSelected && (
                    <motion.div
                      layoutId="level-selection"
                      className="w-5 h-5 rounded-full bg-[#171717] flex items-center justify-center"
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
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
