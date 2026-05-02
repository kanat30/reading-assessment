"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/browser";
import { TRANSITION } from "@/lib/animation/constants";

interface Session {
  id: string;
  students: {
    first_name: string;
    last_name: string;
  };
  assessments: {
    class_label: string;
  };
}

interface CommandPaletteProps {
  onCreateAssessment: () => void;
  sessions: Session[];
}

/**
 * Command palette (Cmd+K) for quick navigation and actions.
 * Only mounted on dashboard (teacher-only).
 */
export function CommandPalette({ onCreateAssessment, sessions }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Toggle with Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setSearch("");
        setShowSignOutConfirm(false);
      }

      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        setShowSignOutConfirm(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === "create-assessment") {
        setOpen(false);
        onCreateAssessment();
      } else if (value === "dashboard") {
        setOpen(false);
        router.push("/dashboard");
      } else if (value === "sign-out") {
        setShowSignOutConfirm(true);
      } else if (value.startsWith("session:")) {
        const sessionId = value.replace("session:", "");
        setOpen(false);
        // Navigate to session detail or expand it
        router.push(`/report/${sessionId}`);
      }
    },
    [router, onCreateAssessment]
  );

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  // Filter sessions by search
  const filteredSessions = sessions.filter((session) => {
    if (!search) return true;
    const name = `${session.students.first_name} ${session.students.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: TRANSITION.page }}
            onClick={() => {
              setOpen(false);
              setShowSignOutConfirm(false);
            }}
            className="fixed inset-0 bg-ink z-50"
          />

          {/* Command palette */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: TRANSITION.page, ease: "easeOut" }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[640px] max-w-[90vw] bg-paper border border-mist rounded-2xl shadow-xl z-50 overflow-hidden"
          >
            <Command
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  setShowSignOutConfirm(false);
                }
              }}
              loop
            >
              {/* Input */}
              <div className="p-4 border-b border-mist">
                <Command.Input
                  value={search}
                  onValueChange={setSearch}
                  placeholder=""
                  className="w-full text-2xl text-ink bg-transparent border-none outline-none placeholder:text-stone/50"
                  autoFocus
                />
              </div>

              {/* Sign out confirmation */}
              {showSignOutConfirm ? (
                <div className="p-6 text-center">
                  <p className="text-base text-ink mb-4">Sign out of FluencyScope?</p>
                  <div className="flex justify-center gap-4">
                    <button
                      onClick={() => setShowSignOutConfirm(false)}
                      className="px-4 py-2 text-sm text-stone hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSignOut}
                      className="px-4 py-2 text-sm bg-accent-blue text-paper rounded-lg hover:bg-accent-blue/90 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Command list */}
                  <Command.List className="max-h-[320px] overflow-y-auto p-2">
                    <Command.Empty className="p-4 text-center text-sm text-stone">
                      No results found.
                    </Command.Empty>

                    {/* Actions group */}
                    <Command.Group heading="Actions" className="px-2 py-1 text-xs text-stone uppercase tracking-wide">
                      <Command.Item
                        value="create-assessment"
                        onSelect={handleSelect}
                        className="px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-3 text-base text-ink aria-selected:bg-mist aria-selected:border-l-2 aria-selected:border-accent-blue transition-colors"
                      >
                        <span className="text-stone">+</span>
                        Create new assessment
                      </Command.Item>

                      <Command.Item
                        value="dashboard"
                        onSelect={handleSelect}
                        className="px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-3 text-base text-ink aria-selected:bg-mist aria-selected:border-l-2 aria-selected:border-accent-blue transition-colors"
                      >
                        <span className="text-stone">⌘</span>
                        Go to dashboard
                      </Command.Item>

                      <Command.Item
                        value="sign-out"
                        onSelect={handleSelect}
                        className="px-3 py-2.5 rounded-lg cursor-pointer flex items-center gap-3 text-base text-ink aria-selected:bg-mist aria-selected:border-l-2 aria-selected:border-accent-blue transition-colors"
                      >
                        <span className="text-stone">↪</span>
                        Sign out
                      </Command.Item>
                    </Command.Group>

                    {/* Readings group */}
                    {filteredSessions.length > 0 && (
                      <Command.Group heading="Readings" className="px-2 py-1 mt-2 text-xs text-stone uppercase tracking-wide">
                        {filteredSessions.slice(0, 6).map((session) => (
                          <Command.Item
                            key={session.id}
                            value={`session:${session.id}`}
                            onSelect={handleSelect}
                            className="px-3 py-2.5 rounded-lg cursor-pointer flex items-center justify-between text-base text-ink aria-selected:bg-mist aria-selected:border-l-2 aria-selected:border-accent-blue transition-colors"
                          >
                            <span>
                              {session.students.first_name} {session.students.last_name}
                            </span>
                            <span className="text-sm text-stone">
                              {session.assessments.class_label}
                            </span>
                          </Command.Item>
                        ))}
                      </Command.Group>
                    )}
                  </Command.List>

                  {/* Footer */}
                  <div className="px-4 py-2 border-t border-mist text-xs text-stone flex items-center gap-4">
                    <span>↵ select</span>
                    <span>↑↓ navigate</span>
                    <span>esc close</span>
                  </div>
                </>
              )}
            </Command>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
