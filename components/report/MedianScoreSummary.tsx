"use client";

import { MedianResult, getBenchmarkColor } from "@/lib/scoring/benchmark";
import { BenchmarkBand } from "./BenchmarkBand";

interface MedianScoreSummaryProps {
  result: MedianResult;
}

export function MedianScoreSummary({ result }: MedianScoreSummaryProps) {
  const { scores, medianWcpm, benchmark } = result;
  const colors = getBenchmarkColor(benchmark.band);

  // Find which score is the median
  const sortedScores = [...scores].sort((a, b) => a - b);
  const medianIndex = scores.length === 3 ? 1 : -1; // Only highlight for 3 passages

  return (
    <div className="space-y-6">
      {/* Median benchmark display */}
      <div className={`p-6 rounded-xl ${colors.bg} border ${colors.border}`}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-sm font-medium text-stone">Median Score (of {scores.length})</span>
          {scores.length === 3 && (
            <span className="text-xs px-2 py-0.5 rounded bg-ink/5 text-stone">
              Acadience Protocol
            </span>
          )}
        </div>
        <BenchmarkBand result={benchmark} />
      </div>

      {/* Individual passage scores */}
      {scores.length > 1 && (
        <div>
          <p className="text-sm font-medium text-stone mb-3">Individual Passage Scores</p>
          <div className="grid grid-cols-3 gap-3">
            {sortedScores.map((score, index) => {
              const isMedian = scores.length === 3 && index === medianIndex;
              return (
                <div
                  key={index}
                  className={`p-4 rounded-lg border text-center ${
                    isMedian ? `${colors.bg} ${colors.border}` : "bg-mist/30 border-mist"
                  }`}
                >
                  <div className={`text-2xl font-bold font-mono ${isMedian ? colors.text : "text-ink"}`}>
                    {score}
                  </div>
                  <div className="text-xs text-stone mt-1">
                    {isMedian ? "Median" : `Passage ${index + 1}`}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-stone mt-2">
            Scores sorted low to high. The middle score is used for benchmark comparison.
          </p>
        </div>
      )}
    </div>
  );
}
