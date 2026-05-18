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
  use_numbered_students: boolean;
  expected_student_count: number | null;
}

interface TokenPageProps {
  params: Promise<{ token: string }>;
}

const STUDENT_NAME_KEY = "fs:student-name";

function isValidName(name: string, isNumbered: boolean = false): boolean {
  const trimmed = name.trim();
  if (isNumbered) {
    // For numbered students, we expect "Student N" format
    return /^Student \d+$/.test(trimmed);
  }
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
    const isNumbered = assessment?.use_numbered_students || false;

    if (!isValidName(trimmed, isNumbered)) {
      setNameError(isNumbered
        ? "Please select your student number"
        : "Please enter your first and last name"
      );
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
                <h1 className="font-serif text-[28px] font-semibold text-ink">
                  Reading Assessment
                </h1>
              </div>

              {/* Instructions - visual cards */}
              <div className="mb-8 space-y-3">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-accent-blue/5 border border-accent-blue/10">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent-blue/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 001.414 1.414m2.828-9.9a9 9 0 012.828-2.828" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-ink font-medium text-sm">Read aloud</p>
                    <p className="text-stone text-xs">Read the passage out loud clearly</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-success/5 border border-success/10">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-ink font-medium text-sm">Stay close to mic</p>
                    <p className="text-stone text-xs">Keep your microphone nearby</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-warning/5 border border-warning/10">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-ink font-medium text-sm">Answer questions</p>
                    <p className="text-stone text-xs">A few questions about what you read</p>
                  </div>
                </div>
              </div>

              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="studentName"
                    className="block text-sm font-medium text-ink mb-2"
                  >
                    {assessment?.use_numbered_students
                      ? "I am..."
                      : "What's your name?"}
                  </label>

                  {assessment?.use_numbered_students ? (
                    // Dropdown for numbered students
                    <select
                      id="studentName"
                      value={studentName}
                      onChange={(e) => {
                        setStudentName(e.target.value);
                        if (nameError) setNameError("");
                      }}
                      className="w-full text-lg py-3 px-4 h-auto rounded-lg border border-mist bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue"
                      autoFocus
                    >
                      <option value="">Select your number...</option>
                      {Array.from(
                        { length: assessment.expected_student_count || 20 },
                        (_, i) => i + 1
                      ).map((num) => (
                        <option key={num} value={`Student ${num}`}>
                          Student {num}
                        </option>
                      ))}
                    </select>
                  ) : (
                    // Text input for regular name entry
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
                  )}

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
