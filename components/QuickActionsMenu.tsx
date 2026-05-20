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

const STATUS_OPTIONS: { value: ReviewStatus; label: string; icon: React.ReactNode }[] = [
  {
    value: "new",
    label: "New",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <circle cx="12" cy="12" r="4" />
      </svg>
    ),
  },
  {
    value: "reviewed",
    label: "Reviewed",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    value: "approved",
    label: "Approved",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: "flagged",
    label: "Needs attention",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5" />
      </svg>
    ),
  },
];

const STATUS_COLORS: Record<ReviewStatus, string> = {
  new: "text-accent-blue",
  reviewed: "text-stone",
  approved: "text-success",
  flagged: "text-alert",
  edited: "text-warning",
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
            className="absolute right-0 top-full mt-1 w-44 bg-paper border border-mist rounded-lg shadow-lg z-30 py-1.5 overflow-hidden"
          >
            {/* Status options as clean list */}
            {STATUS_OPTIONS.map((option) => {
              const isActive = option.value === currentStatus;
              return (
                <button
                  key={option.value}
                  onClick={(e) => handleStatusClick(option.value, e)}
                  className={`w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2.5 transition-colors ${
                    isActive
                      ? `${STATUS_COLORS[option.value]} bg-mist/30`
                      : "text-ink/70 hover:bg-mist/40 hover:text-ink"
                  }`}
                >
                  <span className={isActive ? STATUS_COLORS[option.value] : "text-stone/60"}>
                    {option.icon}
                  </span>
                  <span>{option.label}</span>
                  {isActive && (
                    <svg className="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              );
            })}

            <div className="border-t border-mist/60 my-1.5" />

            {/* Note action */}
            <button
              onClick={handleNoteClick}
              className="w-full px-3 py-1.5 text-left text-[13px] text-ink/70 hover:bg-mist/40 hover:text-ink transition-colors flex items-center gap-2.5"
            >
              <svg className="w-4 h-4 text-stone/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
              </svg>
              <span>{hasNote ? "Edit note" : "Add note"}</span>
            </button>

            <div className="border-t border-mist/60 my-1.5" />

            {/* Delete action */}
            <button
              onClick={handleDeleteClick}
              className="w-full px-3 py-1.5 text-left text-[13px] text-alert/80 hover:bg-alert/5 hover:text-alert transition-colors flex items-center gap-2.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              <span>Delete</span>
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

  const labelMap: Record<ReviewStatus, string> = {
    new: "New",
    reviewed: "Reviewed",
    approved: "Approved",
    flagged: "Needs attention",
    edited: "Edited",
  };

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${colorMap[status]}`}
      title={labelMap[status]}
    />
  );
}
