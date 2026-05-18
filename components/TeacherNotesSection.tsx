"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TeacherNote {
  id: string;
  note_text: string;
  created_at: string;
  updated_at: string;
}

interface TeacherNotesSectionProps {
  sessionId: string;
}

const MAX_NOTE_LENGTH = 2000;

/**
 * Collapsible notes section for SessionReport.
 * Allows teacher to view/edit their private notes.
 */
export function TeacherNotesSection({ sessionId }: TeacherNotesSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [note, setNote] = useState<TeacherNote | null>(null);
  const [noteText, setNoteText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch note on mount
  useEffect(() => {
    async function fetchNote() {
      try {
        const response = await fetch(`/api/session-notes?session_id=${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          if (data.note) {
            setNote(data.note);
            setNoteText(data.note.note_text);
          }
        }
      } catch (error) {
        console.error("Error fetching note:", error);
      }
      setLoading(false);
    }

    fetchNote();
  }, [sessionId]);

  const handleSave = useCallback(async () => {
    if (!noteText.trim()) return;

    setSaving(true);
    try {
      const response = await fetch("/api/session-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          note_text: noteText.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNote(data.note);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error saving note:", error);
    }
    setSaving(false);
  }, [sessionId, noteText]);

  const handleDelete = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/session-notes?session_id=${sessionId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setNote(null);
        setNoteText("");
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Error deleting note:", error);
    }
    setSaving(false);
  }, [sessionId]);

  const handleCancel = useCallback(() => {
    setNoteText(note?.note_text || "");
    setIsEditing(false);
  }, [note]);

  const charCount = noteText.length;
  const isOverLimit = charCount > MAX_NOTE_LENGTH;
  const hasNote = !!note;

  if (loading) {
    return null;
  }

  return (
    <div className="border-t border-mist pt-6">
      {/* Header - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-stone hover:text-ink transition-colors w-full"
      >
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>My notes</span>
        {hasNote && !isExpanded && (
          <span className="text-xs text-stone/60 ml-2">
            &middot; {note.note_text.slice(0, 50)}{note.note_text.length > 50 ? "..." : ""}
          </span>
        )}
      </button>

      {/* Expandable content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              {/* View mode */}
              {hasNote && !isEditing ? (
                <div className="space-y-3">
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                    {note.note_text}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-stone">
                      Last updated {new Date(note.updated_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit mode */
                <div className="space-y-3">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add your private notes about this reading..."
                    className={`w-full min-h-[100px] p-3 text-sm text-ink bg-paper border rounded-lg focus:outline-none leading-relaxed resize-y ${
                      isOverLimit
                        ? "border-alert focus:border-alert"
                        : "border-mist focus:border-accent-blue"
                    }`}
                    autoFocus={isEditing}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <p className={`text-xs ${isOverLimit ? "text-alert" : "text-stone"}`}>
                        {charCount}/{MAX_NOTE_LENGTH}
                      </p>
                      {hasNote && (
                        <button
                          onClick={handleDelete}
                          disabled={saving}
                          className="text-xs text-alert hover:text-alert/80 transition-colors disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {isEditing && (
                        <button
                          onClick={handleCancel}
                          className="text-xs text-stone hover:text-ink transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={handleSave}
                        disabled={saving || !noteText.trim() || isOverLimit}
                        className="px-3 py-1.5 text-xs font-medium text-paper bg-accent-blue rounded-md hover:bg-accent-blue/90 transition-colors disabled:opacity-50"
                      >
                        {saving ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
