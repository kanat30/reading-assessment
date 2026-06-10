"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SessionEvent, SessionEventOverride, EventType, EventOverrideAction } from "@/lib/scoring/types";

interface WordOverridePopoverProps {
  isOpen: boolean;
  word: string;
  wordIndex: number;
  event: SessionEvent | null;
  existingOverride: SessionEventOverride | null;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onSave: (data: {
    action: EventOverrideAction;
    new_event_type?: EventType;
    spoken_word_override?: string;
    reason?: string;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  onPlayFromHere?: () => void;
}

const ERROR_TYPES: { value: EventType; label: string; description: string }[] = [
  { value: "substitution", label: "Substitution", description: "Said a different word" },
  { value: "omission", label: "Omission", description: "Skipped the word" },
  { value: "mispronunciation", label: "Mispronunciation", description: "Unclear pronunciation" },
  { value: "self_correction", label: "Self-correction", description: "Corrected themselves" },
];

// Quick reasons for marking AI error as correct
const CORRECT_REASONS = [
  { label: "Read correctly", description: "AI misheard" },
  { label: "Acceptable accent", description: "Valid pronunciation" },
  { label: "Audio issue", description: "Recording problem" },
];

export function WordOverridePopover({
  isOpen,
  word,
  wordIndex,
  event,
  existingOverride,
  anchorRect,
  onClose,
  onSave,
  onDelete,
  onPlayFromHere,
}: WordOverridePopoverProps) {
  const [selectedAction, setSelectedAction] = useState<EventOverrideAction | null>(null);
  const [selectedErrorType, setSelectedErrorType] = useState<EventType>("substitution");
  const [spokenWord, setSpokenWord] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const isCorrect = event?.event_type === "correct" || !event;

  // Reset state when opening for a new word
  useEffect(() => {
    if (isOpen) {
      if (existingOverride) {
        setSelectedAction(existingOverride.action);
        setSelectedErrorType(existingOverride.new_event_type || "substitution");
        setSpokenWord(existingOverride.spoken_word_override || "");
        setReason(existingOverride.reason || "");
      } else {
        setSelectedAction(null);
        setSelectedErrorType("substitution");
        setSpokenWord(event?.spoken_word || "");
        setReason("");
      }
    }
  }, [isOpen, existingOverride, event]);

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (isOpen) {
      // Delay to avoid closing immediately on the click that opened it
      setTimeout(() => {
        window.addEventListener("mousedown", handleClickOutside);
      }, 0);
    }
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  const handleSave = useCallback(async () => {
    if (!selectedAction) return;

    setSaving(true);
    try {
      await onSave({
        action: selectedAction,
        new_event_type: selectedAction === "flag_error" ? selectedErrorType : undefined,
        spoken_word_override: spokenWord || undefined,
        reason: reason || undefined,
      });
      onClose();
    } catch (error) {
      console.error("Save override error:", error);
    } finally {
      setSaving(false);
    }
  }, [selectedAction, selectedErrorType, spokenWord, reason, onSave, onClose]);

  const handleDelete = useCallback(async () => {
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error("Delete override error:", error);
    } finally {
      setSaving(false);
    }
  }, [onDelete, onClose]);

  // Calculate position
  const getPosition = () => {
    if (!anchorRect) return { top: "50%", left: "50%" };

    const popoverWidth = 320;
    const popoverHeight = 400;
    const padding = 8;

    let top = anchorRect.bottom + padding;
    let left = anchorRect.left + anchorRect.width / 2 - popoverWidth / 2;

    // Keep within viewport
    if (left < padding) left = padding;
    if (left + popoverWidth > window.innerWidth - padding) {
      left = window.innerWidth - popoverWidth - padding;
    }

    // If too close to bottom, show above
    if (top + popoverHeight > window.innerHeight - padding) {
      top = anchorRect.top - popoverHeight - padding;
    }

    return { top: `${top}px`, left: `${left}px` };
  };

  const position = getPosition();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-ink/10 z-40"
          />

          {/* Popover */}
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 w-80 bg-paper rounded-lg border border-mist shadow-lg overflow-hidden"
            style={{ top: position.top, left: position.left }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-mist bg-mist/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-stone uppercase tracking-wide">Word #{wordIndex + 1}</p>
                  <p className="text-lg font-serif text-ink">{word}</p>
                </div>
                <div className="text-right">
                  {event && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        isCorrect
                          ? "bg-success/15 text-success"
                          : event.event_type === "mispronunciation" || event.event_type === "self_correction"
                          ? "bg-warning/15 text-warning"
                          : "bg-alert/15 text-alert"
                      }`}
                    >
                      {isCorrect ? "Correct" : event.event_type.replace("_", " ")}
                    </span>
                  )}
                </div>
              </div>
              {event?.spoken_word && event.spoken_word !== word && (
                <p className="text-sm text-stone mt-1">
                  Heard: &quot;{event.spoken_word}&quot;
                </p>
              )}
              {onPlayFromHere && event?.start_timestamp_ms && (
                <button
                  onClick={onPlayFromHere}
                  className="mt-3 flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-accent-blue hover:bg-accent-blue/10 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                  Play from here
                </button>
              )}
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Show existing override status */}
              {existingOverride && (
                <div className="p-3 bg-accent-blue/10 rounded-lg">
                  <p className="text-xs text-stone uppercase tracking-wide mb-1">Current override</p>
                  <p className="text-sm text-ink">
                    {existingOverride.action === "flag_error" && (
                      <>Flagged as {existingOverride.new_event_type?.replace("_", " ")}</>
                    )}
                    {existingOverride.action === "approve" && <>Confirmed as error</>}
                    {existingOverride.action === "reject" && <>Marked as correct</>}
                  </p>
                  {existingOverride.reason && (
                    <p className="text-xs text-stone mt-1 italic">&quot;{existingOverride.reason}&quot;</p>
                  )}
                </div>
              )}

              {/* Actions based on AI detection */}
              {isCorrect ? (
                // Word marked correct by AI - allow flagging error
                <div className="space-y-3">
                  <p className="text-sm text-stone">AI marked this word as correct.</p>

                  <button
                    onClick={() => setSelectedAction("flag_error")}
                    className={`w-full p-3 text-left rounded-lg border-2 transition-all ${
                      selectedAction === "flag_error"
                        ? "border-alert bg-alert/5"
                        : "border-mist hover:border-stone/40"
                    }`}
                  >
                    <p className="text-sm font-medium text-ink">Flag as Error</p>
                    <p className="text-xs text-stone mt-0.5">Mark this as an error the AI missed</p>
                  </button>

                  {selectedAction === "flag_error" && (
                    <div className="space-y-3 pl-2 border-l-2 border-alert/30">
                      <p className="text-xs text-stone">What type of error?</p>
                      <div className="grid grid-cols-2 gap-2">
                        {ERROR_TYPES.map((type) => (
                          <button
                            key={type.value}
                            onClick={() => setSelectedErrorType(type.value)}
                            className={`p-2 text-left rounded border transition-all ${
                              selectedErrorType === type.value
                                ? "border-accent-blue bg-accent-blue/5"
                                : "border-mist hover:border-stone/40"
                            }`}
                          >
                            <p className="text-xs font-medium text-ink">{type.label}</p>
                          </button>
                        ))}
                      </div>

                      {selectedErrorType === "substitution" && (
                        <div>
                          <label className="text-xs text-stone">What did they say?</label>
                          <input
                            type="text"
                            value={spokenWord}
                            onChange={(e) => setSpokenWord(e.target.value)}
                            placeholder="Optional"
                            className="w-full mt-1 px-3 py-2 text-sm text-ink bg-paper border border-mist rounded focus:border-accent-blue focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                // Word marked as error by AI - allow approve or reject
                <div className="space-y-3">
                  <p className="text-sm text-stone">
                    AI detected: {event?.event_type.replace("_", " ")}
                    {event?.confidence_score && ` (${Math.round(event.confidence_score * 100)}% confident)`}
                  </p>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSelectedAction("approve")}
                      className={`p-3 text-left rounded-lg border-2 transition-all ${
                        selectedAction === "approve"
                          ? "border-alert bg-alert/5"
                          : "border-mist hover:border-stone/40"
                      }`}
                    >
                      <p className="text-sm font-medium text-ink">Confirm Error</p>
                      <p className="text-xs text-stone mt-0.5">AI was correct</p>
                    </button>

                    <button
                      onClick={() => setSelectedAction("reject")}
                      className={`p-3 text-left rounded-lg border-2 transition-all ${
                        selectedAction === "reject"
                          ? "border-success bg-success/5"
                          : "border-mist hover:border-stone/40"
                      }`}
                    >
                      <p className="text-sm font-medium text-ink">Mark Correct</p>
                      <p className="text-xs text-stone mt-0.5">AI was wrong</p>
                    </button>
                  </div>

                  {/* Quick reasons when marking as correct */}
                  {selectedAction === "reject" && (
                    <div className="space-y-2 pl-2 border-l-2 border-success/30">
                      <p className="text-xs text-stone">Why was this correct?</p>
                      <div className="flex flex-wrap gap-2">
                        {CORRECT_REASONS.map((r) => (
                          <button
                            key={r.label}
                            onClick={() => setReason(r.label)}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                              reason === r.label
                                ? "border-success bg-success/10 text-success"
                                : "border-mist text-stone hover:border-stone/40"
                            }`}
                          >
                            {r.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reason field (always shown when action selected) */}
              {selectedAction && (
                <div>
                  <label className="text-xs text-stone">
                    {selectedAction === "reject" ? "Or add a custom note" : "Reason (optional)"}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, 200))}
                    placeholder="Brief note about this correction"
                    className="w-full mt-1 px-3 py-2 text-sm text-ink bg-paper border border-mist rounded focus:border-accent-blue focus:outline-none"
                    maxLength={200}
                  />
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-mist bg-mist/10 flex items-center justify-between">
              <div>
                {existingOverride && (
                  <button
                    onClick={handleDelete}
                    disabled={saving}
                    className="text-xs text-alert hover:text-alert/80 transition-colors disabled:opacity-50"
                  >
                    Remove override
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="text-sm text-stone hover:text-ink transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !selectedAction}
                  className="px-4 py-1.5 text-sm font-medium text-paper bg-accent-blue rounded hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
