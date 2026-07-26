"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Rasinski MDFS rubric descriptions
const PROSODY_DESCRIPTIONS = {
  1: "Word-by-word, choppy, no expression",
  2: "Hesitant, some phrasing, limited expression",
  3: "Mostly smooth, appropriate phrasing, some expression",
  4: "Fluent, expressive, conversational pace",
};

type OverrideType = "wcpm" | "prosody" | "summary";

interface OverridePanelProps {
  type: OverrideType;
  isOpen: boolean;
  onClose: () => void;
  onSave: (value: unknown, reason?: string) => Promise<void>;
  currentValue: unknown;
  dimension?: string; // For prosody: 'expression' | 'phrasing' | 'pace' | 'level'
}

/**
 * Override panel that slides up from the bottom of the report.
 * Handles WCPM, prosody, and summary overrides.
 */
export function OverridePanel({
  type,
  isOpen,
  onClose,
  onSave,
  currentValue,
  dimension,
}: OverridePanelProps) {
  const [value, setValue] = useState<unknown>(currentValue);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-sync on every open: the panel is reused across fields/dimensions, so a
  // stale value from the previous edit must never carry over (e.g. rating
  // Expression right after adjusting Pace).
  useEffect(() => {
    if (isOpen) {
      setValue(currentValue);
      setReason("");
    }
  }, [isOpen, currentValue]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(value, reason || undefined);
      onClose();
    } catch (error) {
      console.error("Override save error:", error);
    } finally {
      setSaving(false);
    }
  }, [value, reason, onSave, onClose]);

  const handleCancel = useCallback(() => {
    setValue(currentValue);
    setReason("");
    onClose();
  }, [currentValue, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-ink/20 z-40"
            onClick={handleCancel}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="fixed bottom-0 left-0 right-0 bg-paper border-t-2 border-mist z-50 max-h-[50vh] overflow-y-auto"
          >
            <div className="max-w-3xl mx-auto p-8">
              {/* WCPM Override */}
              {type === "wcpm" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-ink">
                    What WCPM did you observe?
                  </h3>

                  <div className="flex justify-center">
                    <input
                      type="number"
                      value={typeof value === 'number' ? value : ''}
                      onChange={(e) => setValue(parseInt(e.target.value) || 0)}
                      className="w-48 h-24 text-center font-sans text-[56px] font-semibold text-ink bg-paper border-2 border-mist rounded-lg focus:border-accent-blue focus:outline-none appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      min={0}
                      max={300}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-stone">
                      Why are you correcting this?
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value.slice(0, 200))}
                      placeholder="Optional reason (max 200 characters)"
                      className="w-full px-4 py-3 text-sm text-ink bg-paper border border-mist rounded-lg focus:border-accent-blue focus:outline-none"
                      maxLength={200}
                    />
                  </div>

                  <div className="flex items-center gap-4 justify-end">
                    <button
                      onClick={handleCancel}
                      className="text-sm text-stone hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-6 py-2.5 text-sm font-medium text-paper bg-accent-blue rounded-lg hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save correction"}
                    </button>
                  </div>
                </div>
              )}

              {/* Prosody Override */}
              {type === "prosody" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-ink">
                    {currentValue == null
                      ? `Rate ${dimension || "prosody"} (1–4)`
                      : `Set ${dimension || "prosody"} to:`}
                  </h3>
                  {dimension === "expression" && currentValue == null && (
                    <p className="text-sm text-stone -mt-3">
                      Expression is teacher-rated — timing data cannot measure
                      intonation or stress. Your rating becomes this dimension&apos;s score.
                    </p>
                  )}

                  <div className="grid grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((level) => (
                      <button
                        key={level}
                        onClick={() => setValue(level)}
                        className={`p-4 rounded-lg border-2 text-left transition-all ${
                          value === level
                            ? "border-accent-blue bg-accent-blue/5"
                            : "border-mist hover:border-stone/40"
                        }`}
                      >
                        <p className="text-2xl font-semibold text-ink mb-1">{level}</p>
                        <p className="text-xs text-stone leading-snug">
                          {PROSODY_DESCRIPTIONS[level as keyof typeof PROSODY_DESCRIPTIONS]}
                        </p>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-stone">
                      Why are you correcting this?
                    </label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value.slice(0, 200))}
                      placeholder="Optional reason (max 200 characters)"
                      className="w-full px-4 py-3 text-sm text-ink bg-paper border border-mist rounded-lg focus:border-accent-blue focus:outline-none"
                      maxLength={200}
                    />
                  </div>

                  <div className="flex items-center gap-4 justify-end">
                    <button
                      onClick={handleCancel}
                      className="text-sm text-stone hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || typeof value !== "number"}
                      className="px-6 py-2.5 text-sm font-medium text-paper bg-accent-blue rounded-lg hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : currentValue == null ? "Save rating" : "Save correction"}
                    </button>
                  </div>
                </div>
              )}

              {/* Summary Override */}
              {type === "summary" && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-ink">
                    Edit the summary.
                  </h3>

                  <textarea
                    value={(value as string) ?? ''}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full min-h-[120px] p-4 font-serif text-lg italic text-ink bg-paper border border-mist rounded-lg focus:border-accent-blue focus:outline-none leading-relaxed resize-y"
                    placeholder="Enter the summary..."
                  />

                  <p className="text-xs text-stone">
                    Your edit replaces the AI summary on this report. The original is preserved in history.
                  </p>

                  <div className="flex items-center gap-4 justify-end">
                    <button
                      onClick={handleCancel}
                      className="text-sm text-stone hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-6 py-2.5 text-sm font-medium text-paper bg-accent-blue rounded-lg hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save correction"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
