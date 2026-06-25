"use client";

import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Suspense, use, useEffect, useState } from "react";
import { AnimatedCheckmark } from "@/components/AnimatedCheckmark";
import { playChime, playTick, getSoundEnabled } from "@/lib/audio/sounds";
import { Button } from "@/components/ui/button";

// Session storage key for passage index in multi-passage flow
const PASSAGE_INDEX_KEY = "fs:passage-index";

interface DonePageProps {
  params: Promise<{ token: string }>;
}

function DoneContent({ token }: { token: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s");
  const passageIndex = parseInt(searchParams.get("pi") || "0", 10);
  const totalPassages = parseInt(searchParams.get("tp") || "1", 10);

  const [isTransitioning, setIsTransitioning] = useState(false);

  // Check if there are more passages to read
  const hasMorePassages = passageIndex < totalPassages - 1;
  const nextPassageNumber = passageIndex + 2; // 1-indexed for display

  // Play chime on mount (if sounds enabled and not already played)
  useEffect(() => {
    const hasPlayedChime = sessionStorage.getItem("fs:chime-played");
    if (!hasPlayedChime && getSoundEnabled()) {
      playChime();
      sessionStorage.setItem("fs:chime-played", "true");

      setTimeout(() => {
        sessionStorage.removeItem("fs:chime-played");
      }, 2000);
    }
  }, []);

  const handleContinue = () => {
    setIsTransitioning(true);
    playTick();

    // Update passage index in session storage
    const nextIndex = passageIndex + 1;
    sessionStorage.setItem(PASSAGE_INDEX_KEY, nextIndex.toString());

    // Navigate back to recording page for next passage
    router.push(`/read/${token}/recording`);
  };

  // Multi-passage: show transition UI
  if (hasMorePassages) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="min-h-screen bg-paper flex flex-col items-center justify-center px-6"
      >
        <AnimatedCheckmark size={80} delay={0.1} className="mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="text-center max-w-sm"
        >
          <h1 className="font-serif text-[36px] font-semibold text-ink mb-3">
            Great reading!
          </h1>

          <div className="bg-accent-blue/10 rounded-2xl px-6 py-5 mb-6">
            <p className="text-lg text-ink font-medium mb-1">
              Passage {passageIndex + 1} of {totalPassages} complete
            </p>
            <p className="text-stone text-sm">
              {totalPassages - passageIndex - 1} more {totalPassages - passageIndex - 1 === 1 ? "passage" : "passages"} to go
            </p>
          </div>

          <Button
            onClick={handleContinue}
            disabled={isTransitioning}
            className="w-full bg-ink text-paper hover:bg-ink/90 rounded-xl py-6 text-lg font-medium"
          >
            {isTransitioning ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading...
              </span>
            ) : (
              `Continue to Passage ${nextPassageNumber}`
            )}
          </Button>
        </motion.div>
      </motion.div>
    );
  }

  // All passages complete: show final done message
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="min-h-screen bg-paper flex flex-col items-center justify-center px-6"
    >
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
            {totalPassages > 1
              ? `Great job completing all ${totalPassages} passages!`
              : "Great job completing your assessment!"}
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
