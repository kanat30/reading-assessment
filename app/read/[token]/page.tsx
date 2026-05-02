"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { preloadAudio } from "@/lib/audio/sounds";
import { createClient } from "@/lib/supabase/browser";

type FlowState = "loading" | "not-found" | "landing";

interface Passage {
  id: string;
  title: string;
  text: string;
  grade_band: string;
  word_count: number;
}

interface Assessment {
  id: string;
  class_label: string;
  share_token: string;
  passages: Passage;
}

interface TokenPageProps {
  params: Promise<{ token: string }>;
}

const STUDENT_NAME_KEY = "fs:student-name";

function isValidName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.includes(" ");
}

export default function TokenPage({ params }: TokenPageProps) {
  const { token } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [state, setState] = useState<FlowState>("loading");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [studentName, setStudentName] = useState("");
  const [nameError, setNameError] = useState("");

  // Load assessment data
  useEffect(() => {
    async function loadAssessment() {
      const { data, error } = await supabase
        .from("assessments")
        .select("*, passages(*)")
        .eq("share_token", token)
        .single();

      if (error || !data) {
        setState("not-found");
        return;
      }

      // Check if expired
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        setState("not-found");
        return;
      }

      setAssessment(data);
      setState("landing");
    }

    loadAssessment();
  }, [token, supabase]);

  // Load saved name from session storage
  useEffect(() => {
    const savedName = sessionStorage.getItem(STUDENT_NAME_KEY);
    if (savedName) {
      setStudentName(savedName);
    }
  }, []);

  const handleInteraction = () => {
    preloadAudio();
  };

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = studentName.trim();
    if (!isValidName(trimmed)) {
      setNameError("Please enter your first and last name");
      return;
    }

    sessionStorage.setItem(STUDENT_NAME_KEY, trimmed);
    setNameError("");
    // Go directly to recording
    router.push(`/read/${token}/recording`);
  };

  // Loading state - simple skeleton
  if (state === "loading") {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center px-6">
        <div className="w-full max-w-md space-y-4">
          <div className="skeleton-shimmer h-10 w-32 rounded mx-auto" />
          <div className="skeleton-shimmer h-6 w-48 rounded mx-auto" />
          <div className="skeleton-shimmer h-12 w-full rounded-lg mt-8" />
          <div className="skeleton-shimmer h-12 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // Not found / expired state - calm serif design
  if (state === "not-found") {
    return (
      <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
        <p className="font-serif text-xl text-ink italic text-center">
          This link has expired.
        </p>
        <p className="text-sm text-stone mt-2 text-center">
          Ask your teacher for a new link.
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-paper flex flex-col"
      onClick={handleInteraction}
    >
      <AnimatePresence mode="wait">
        {state === "landing" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="flex-1 flex items-center justify-center px-6 py-12"
          >
            <div className="w-full max-w-md">
              <div className="text-center mb-8">
                <h1 className="font-serif text-[32px] font-semibold text-ink mb-2">
                  Welcome!
                </h1>
                <p className="text-base text-stone">
                  Let&apos;s get started with your reading.
                </p>
              </div>

              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="studentName"
                    className="block text-sm font-medium text-ink mb-2"
                  >
                    What&apos;s your name?
                  </label>
                  <Input
                    id="studentName"
                    type="text"
                    value={studentName}
                    onChange={(e) => {
                      setStudentName(e.target.value);
                      if (nameError) setNameError("");
                    }}
                    placeholder="First Last"
                    className="w-full text-lg py-3 h-auto"
                    autoComplete="name"
                    autoFocus
                  />
                  {nameError && (
                    <p className="mt-2 text-sm text-alert">{nameError}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-accent-blue text-paper text-base py-4 h-auto rounded-lg hover:bg-accent-blue/90 transition-colors duration-[120ms]"
                >
                  Continue
                </Button>
              </form>

              {/* Class label indicator */}
              {assessment?.class_label && (
                <p className="text-xs text-stone text-center mt-6">
                  {assessment.class_label}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
