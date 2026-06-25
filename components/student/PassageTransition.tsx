"use client";

import { motion } from "framer-motion";
import { AnimatedCheckmark } from "@/components/AnimatedCheckmark";

interface PassageTransitionProps {
  completedPassage: number; // 0-indexed, just completed
  totalPassages: number;
  onContinue: () => void;
}

export function PassageTransition({
  completedPassage,
  totalPassages,
  onContinue,
}: PassageTransitionProps) {
  const nextPassage = completedPassage + 1;
  const isLastPassage = nextPassage >= totalPassages;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="min-h-screen bg-paper flex flex-col items-center justify-center px-6"
    >
      <AnimatedCheckmark size={80} delay={0.1} className="mb-6" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-center max-w-md"
      >
        <h2 className="font-serif text-2xl font-semibold text-ink mb-2">
          {isLastPassage ? "All done!" : "Great job!"}
        </h2>

        <p className="text-stone mb-6">
          {isLastPassage
            ? "You completed all the passages."
            : `You completed passage ${completedPassage + 1}. ${totalPassages - nextPassage} more to go.`}
        </p>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {Array.from({ length: totalPassages }).map((_, index) => (
            <div
              key={index}
              className={`w-3 h-3 rounded-full transition-all ${
                index <= completedPassage ? "bg-success" : "bg-mist"
              }`}
            />
          ))}
        </div>

        <button
          onClick={onContinue}
          className="w-full max-w-xs py-4 bg-accent-blue text-paper rounded-xl font-medium hover:bg-accent-blue/90 transition-colors"
        >
          {isLastPassage ? "Finish" : `Continue to Passage ${nextPassage + 1}`}
        </button>
      </motion.div>
    </motion.div>
  );
}
