"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Suspense, use, useEffect } from "react";
import { AnimatedCheckmark } from "@/components/AnimatedCheckmark";
import { playChime, getSoundEnabled } from "@/lib/audio/sounds";

interface DonePageProps {
  params: Promise<{ token: string }>;
}

function DoneContent({ token }: { token: string }) {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s");

  // Play chime on mount (if sounds enabled and not already played)
  useEffect(() => {
    // The chime should have been played in the recording page
    // but we can play it here as a fallback if needed
    // Only play if we got here through a fresh navigation
    const hasPlayedChime = sessionStorage.getItem("fs:chime-played");
    if (!hasPlayedChime && getSoundEnabled()) {
      playChime();
      sessionStorage.setItem("fs:chime-played", "true");

      // Clear the flag after a short delay
      setTimeout(() => {
        sessionStorage.removeItem("fs:chime-played");
      }, 2000);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="min-h-screen bg-paper flex flex-col items-center justify-center px-6"
    >
      {/* Animated checkmark */}
      <AnimatedCheckmark size={100} delay={0.1} className="mb-6" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
        className="text-center max-w-sm"
      >
        <h1 className="font-serif text-[48px] font-semibold text-ink mb-4">
          All done!
        </h1>

        <div className="bg-success/10 rounded-2xl px-6 py-5 mb-6">
          <p className="text-lg text-ink font-medium">
            Great job completing your assessment!
          </p>
        </div>

        <p className="text-stone">
          You can close this tab now.
        </p>

        {/* Report link for testing - teachers access reports via dashboard */}
        {sessionId && (
          <Link
            href={`/report/${sessionId}`}
            className="mt-8 inline-block text-sm text-accent-blue hover:underline transition-opacity cursor-pointer"
          >
            View report
          </Link>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function DonePage({ params }: DonePageProps) {
  const { token } = use(params);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-paper flex flex-col items-center justify-center px-6">
          <div className="w-24 h-24 rounded-full bg-success/10 flex items-center justify-center mb-6">
            <svg
              className="w-12 h-12 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="font-serif text-[48px] font-semibold text-ink mb-4">
            All done!
          </h1>
          <p className="text-lg text-ink font-medium">Great job completing your assessment!</p>
        </div>
      }
    >
      <DoneContent token={token} />
    </Suspense>
  );
}
