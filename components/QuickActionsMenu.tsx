"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ReviewStatus = "new" | "reviewed" | "approved" | "flagged" | "edited";

interface QuickActionsMenuProps {
  sessionId: string;
  currentStatus: ReviewStatus;
  hasNote: boolean;
  onStatusChange: (status: ReviewStatus) => void;
  onAddNote: () => void;
  onDelete: () => void;
}

const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bgColor: string }> = {
  new: { label: "New", color: "text-accent-blue", bgColor: "bg-accent-blue/10 hover:bg-accent-blue/20" },
  reviewed: { label: "Reviewed", color: "text-stone", bgColor: "bg-stone/10 hover:bg-stone/20" },
  approved: { label: "Approved", color: "text-success", bgColor: "bg-success/10 hover:bg-success/20" },
  flagged: { label: "Flagged", color: "text-alert", bgColor: "bg-alert/10 hover:bg-alert/20" },
  edited: { label: "Edited", color: "text-warning", bgColor: "bg-warning/10 hover:bg-warning/20" },
};

export function QuickActionsMenu({
  currentStatus,
  hasNote,
  onStatusChange,
  onAddNote,
  onDelete,
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleStatusClick = (status: ReviewStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    if (status !== currentStatus) {
      onStatusChange(status);
    }
    setIsOpen(false);
  };

  const handleNoteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddNote();
    setIsOpen(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={handleToggle}
        className="p-1.5 rounded text-stone/50 hover:text-ink hover:bg-mist/50 transition-colors"
        title="Quick actions"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>

      {/* Dropdown menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-1 w-48 bg-paper border border-mist rounded-lg shadow-lg z-30 py-1 overflow-hidden"
          >
            {/* Status section */}
            <div className="px-3 py-2">
              <p className="text-[10px] text-stone uppercase tracking-wider mb-2">Status</p>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(STATUS_CONFIG) as ReviewStatus[])
                  .filter(s => s !== "edited") // Don't allow manual "edited" selection
                  .map((status) => {
                    const config = STATUS_CONFIG[status];
                    const isActive = status === currentStatus;
                    return (
                      <button
                        key={status}
                        onClick={(e) => handleStatusClick(status, e)}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${config.bgColor} ${config.color} ${
                          isActive ? "ring-1 ring-current" : ""
                        }`}
                      >
                        {config.label}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="border-t border-mist my-1" />

            {/* Note action */}
            <button
              onClick={handleNoteClick}
              className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-mist/40 transition-colors flex items-center gap-2"
            >
              <span className="text-base">{hasNote ? "Edit note" : "Add note"}</span>
            </button>

            <div className="border-t border-mist my-1" />

            {/* Delete action */}
            <button
              onClick={handleDeleteClick}
              className="w-full px-3 py-2 text-left text-sm text-alert hover:bg-alert/10 transition-colors"
            >
              Delete reading
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Status dot indicator for list rows
 */
export function StatusDot({ status }: { status: ReviewStatus }) {
  const colorMap: Record<ReviewStatus, string> = {
    new: "bg-accent-blue",
    reviewed: "bg-stone/40",
    approved: "bg-success",
    flagged: "bg-alert",
    edited: "bg-warning",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colorMap[status]}`}
      title={STATUS_CONFIG[status]?.label || status}
    />
  );
}
