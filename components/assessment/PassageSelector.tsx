"use client";

import { motion } from "framer-motion";
import { ReadingLevel, getPassagesByLevel } from "@/lib/passages/library";

interface PassageSelectorProps {
  level: ReadingLevel;
  maxSelections: 1 | 3;
  selected: string[];
  onChange: (passageIds: string[]) => void;
}

export function PassageSelector({ level, maxSelections, selected, onChange }: PassageSelectorProps) {
  const passages = getPassagesByLevel(level);

  const handleToggle = (passageId: string) => {
    if (selected.includes(passageId)) {
      // Remove from selection
      onChange(selected.filter((id) => id !== passageId));
    } else if (selected.length < maxSelections) {
      // Add to selection
      onChange([...selected, passageId]);
    }
  };

  const isDisabled = (passageId: string) => {
    return !selected.includes(passageId) && selected.length >= maxSelections;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-neutral-500">
          Select {maxSelections === 1 ? "a passage" : `${maxSelections} passages`} for this assessment.
        </div>
        <div className="text-sm font-medium text-neutral-700">
          {selected.length} / {maxSelections} selected
        </div>
      </div>

      <div className="grid gap-3">
        {passages.map((passage) => {
          const isSelected = selected.includes(passage.id);
          const disabled = isDisabled(passage.id);
          const selectionIndex = selected.indexOf(passage.id);

          return (
            <motion.button
              key={passage.id}
              onClick={() => handleToggle(passage.id)}
              disabled={disabled}
              whileHover={!disabled ? { scale: 1.01 } : {}}
              whileTap={!disabled ? { scale: 0.99 } : {}}
              className={`
                relative w-full text-left p-4 rounded-lg border-2 transition-all
                ${isSelected
                  ? "border-[#171717] bg-[#171717]/10"
                  : disabled
                    ? "border-neutral-100 bg-neutral-50 opacity-50 cursor-not-allowed"
                    : "border-neutral-200 hover:border-neutral-300 bg-white cursor-pointer"
                }
              `}
            >
              {/* Selection number badge */}
              {isSelected && maxSelections > 1 && (
                <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#171717] text-white text-sm font-bold flex items-center justify-center shadow">
                  {selectionIndex + 1}
                </div>
              )}

              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className={`font-semibold leading-snug ${isSelected ? "text-[#171717]" : "text-neutral-900"}`}>
                    {passage.title}
                  </h3>
                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-2">
                    <span className="text-sm text-neutral-500">
                      {passage.word_count} words · {passage.lexile}L · {passage.genre}
                    </span>
                    {passage.themes.slice(0, 2).map((theme) => (
                      <span
                        key={theme}
                        className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 capitalize whitespace-nowrap"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Selection indicator — reserved column so it never overlaps content */}
                <div className="w-5 shrink-0 flex justify-end">
                  {isSelected && (
                    <motion.div
                      className="w-5 h-5 rounded-full bg-[#171717] flex items-center justify-center"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
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

      {passages.length === 0 && (
        <div className="p-4 text-center text-neutral-500 bg-neutral-50 rounded-lg">
          No passages available for Level {level}
        </div>
      )}

      {selected.length === maxSelections && (
        <div className="p-3 bg-neutral-100 rounded-lg border border-neutral-200 text-sm text-neutral-700">
          <strong>Ready to continue!</strong> You&apos;ve selected all {maxSelections} passages.
          {maxSelections === 3 && " Students will read them in the order shown (1, 2, 3)."}
        </div>
      )}
    </div>
  );
}
