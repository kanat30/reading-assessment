"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ReviewPromptModalProps {
  isOpen: boolean;
  studentName: string;
  onMarkReviewed: () => void;
  onSkip: () => void;
}

/**
 * Small modal asking "Mark as reviewed?" when teacher
 * collapses a session panel after viewing a 'new' session.
 */
export function ReviewPromptModal({
  isOpen,
  studentName,
  onMarkReviewed,
  onSkip,
}: ReviewPromptModalProps) {
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
            onClick={onSkip}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm"
          >
            <div className="bg-paper rounded-xl border border-mist shadow-lg p-6">
              <h3 className="text-base font-medium text-ink mb-2">
                Mark as reviewed?
              </h3>
              <p className="text-sm text-stone mb-6">
                You viewed {studentName}&apos;s reading. Mark it as reviewed to track your progress.
              </p>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onSkip}
                  className="px-4 py-2 text-sm text-stone hover:text-ink transition-colors"
                >
                  Skip
                </button>
                <button
                  onClick={onMarkReviewed}
                  className="px-4 py-2 text-sm font-medium text-paper bg-accent-blue rounded-lg hover:bg-accent-blue/90 transition-colors"
                >
                  Mark reviewed
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
