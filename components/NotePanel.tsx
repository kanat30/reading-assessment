"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface NotePanelProps {
  sessionId: string;
  studentName: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (noteText: string) => Promise<void>;
  onDelete: () => Promise<void>;
  initialNote?: string;
}

const MAX_NOTE_LENGTH = 2000;

/**
 * Slide-up panel for editing teacher notes on a session.
 * Follows the OverridePanel pattern.
 */
export function NotePanel({
  studentName,
  isOpen,
  onClose,
  onSave,
  onDelete,
  initialNote = "",
}: NotePanelProps) {
  const [noteText, setNoteText] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset note text when panel opens with new initial value
  useEffect(() => {
    if (isOpen) {
      setNoteText(initialNote);
    }
  }, [isOpen, initialNote]);

  const handleSave = useCallback(async () => {
    if (!noteText.trim()) return;

    setSaving(true);
    try {
      await onSave(noteText.trim());
      onClose();
    } catch (error) {
      console.error("Save note error:", error);
    } finally {
      setSaving(false);
    }
  }, [noteText, onSave, onClose]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      console.error("Delete note error:", error);
    } finally {
      setDeleting(false);
    }
  }, [onDelete, onClose]);

  const handleCancel = useCallback(() => {
    setNoteText(initialNote);
    onClose();
  }, [initialNote, onClose]);

  const charCount = noteText.length;
  const isOverLimit = charCount > MAX_NOTE_LENGTH;
  const hasExistingNote = initialNote.trim().length > 0;

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
            className="fixed bottom-0 left-0 right-0 bg-paper border-t-2 border-mist z-50 max-h-[60vh] overflow-y-auto"
          >
            <div className="max-w-3xl mx-auto p-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-ink">
                    {hasExistingNote ? "Edit note" : "Add note"}
                  </h3>
                  <p className="text-sm text-stone mt-1">
                    Private note for {studentName}&apos;s reading
                  </p>
                </div>

                <div className="space-y-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add your private notes about this reading..."
                    className={`w-full min-h-[150px] p-4 text-base text-ink bg-paper border rounded-lg focus:outline-none leading-relaxed resize-y ${
                      isOverLimit
                        ? "border-alert focus:border-alert"
                        : "border-mist focus:border-accent-blue"
                    }`}
                    autoFocus
                  />
                  <div className="flex justify-between items-center">
                    <p className="text-xs text-stone">
                      Only you can see this note
                    </p>
                    <p className={`text-xs ${isOverLimit ? "text-alert" : "text-stone"}`}>
                      {charCount}/{MAX_NOTE_LENGTH}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {/* Delete button (only if note exists) */}
                  <div>
                    {hasExistingNote && (
                      <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="text-sm text-alert hover:text-alert/80 transition-colors disabled:opacity-50"
                      >
                        {deleting ? "Deleting..." : "Delete note"}
                      </button>
                    )}
                  </div>

                  {/* Cancel/Save buttons */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={handleCancel}
                      className="text-sm text-stone hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving || !noteText.trim() || isOverLimit}
                      className="px-6 py-2.5 text-sm font-medium text-paper bg-accent-blue rounded-lg hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save note"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
