/**
 * Benchmark Scoring Logic
 * Uses Hasbrouck-Tindal norms for grade-level comparison
 */

import {
  HASBROUCK_TINDAL_NORMS,
  ReadingLevel,
  AssessmentPeriod,
  BenchmarkBand,
} from "../passages/library";

export interface BenchmarkResult {
  band: BenchmarkBand;
  label: string;
  wcpm: number;
  percentile: number;
  gradeNorms: {
    p25: number;
    p50: number;
  };
  period: AssessmentPeriod;
  gradeLevel: 4 | 5 | 6 | 7 | 8;
}

/**
 * Map reading level to grade for norm lookup
 * Reading levels are passage difficulty; we map to appropriate grade norms
 */
const READING_LEVEL_TO_GRADE: Record<ReadingLevel, 4 | 5 | 6 | 7 | 8> = {
  3: 4, // Level 3 (3rd-4th grade reading) uses grade 4 norms
  4: 4, // Level 4 (4th-5th grade reading) uses grade 4 norms - core use case
  5: 5, // Level 5 (6th grade) uses grade 5 norms
  6: 6, // Level 6 (7th grade) uses grade 6 norms
  7: 7, // Level 7 (8th grade+) uses grade 7 norms
};

/**
 * Calculate benchmark band and percentile estimate
 */
export function calculateBenchmark(
  wcpm: number,
  readingLevel: ReadingLevel,
  period: AssessmentPeriod
): BenchmarkResult {
  const gradeLevel = READING_LEVEL_TO_GRADE[readingLevel];
  const norms = HASBROUCK_TINDAL_NORMS[gradeLevel][period];

  let band: BenchmarkBand;
  let label: string;
  let percentile: number;

  if (wcpm >= norms.p50) {
    band = "at";
    label = "At Benchmark";
    // Estimate percentile above 50th
    const excess = wcpm - norms.p50;
    const spreadAbove50 = norms.p50 * 0.3; // Rough estimate of p75-p50 spread
    percentile = Math.min(99, 50 + (excess / spreadAbove50) * 25);
  } else if (wcpm >= norms.p25) {
    band = "below";
    label = "Below Benchmark";
    // Linear interpolation between 25th and 50th
    const range = norms.p50 - norms.p25;
    const position = wcpm - norms.p25;
    percentile = 25 + (position / range) * 25;
  } else {
    band = "well_below";
    label = "Well Below Benchmark";
    // Below 25th percentile
    percentile = (wcpm / norms.p25) * 25;
  }

  return {
    band,
    label,
    wcpm,
    percentile: Math.round(Math.max(1, Math.min(99, percentile))),
    gradeNorms: norms,
    period,
    gradeLevel,
  };
}

/**
 * Calculate median of WCPM scores (Acadience/DIBELS protocol)
 */
export function calculateMedianWCPM(scores: number[]): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return scores[0];

  const sorted = [...scores].sort((a, b) => a - b);

  if (sorted.length === 2) {
    // Average of 2
    return Math.round((sorted[0] + sorted[1]) / 2);
  }

  // Median of 3 or more
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
}

export interface MedianResult {
  medianWcpm: number;
  scores: number[];
  benchmark: BenchmarkResult;
}

/**
 * Calculate median result with benchmark band
 */
export function calculateMedianResult(
  wcpmScores: number[],
  readingLevel: ReadingLevel,
  period: AssessmentPeriod
): MedianResult {
  const medianWcpm = calculateMedianWCPM(wcpmScores);

  return {
    medianWcpm,
    scores: wcpmScores,
    benchmark: calculateBenchmark(medianWcpm, readingLevel, period),
  };
}

/**
 * Get color class for benchmark band
 */
export function getBenchmarkColor(band: BenchmarkBand): {
  bg: string;
  text: string;
  border: string;
} {
  switch (band) {
    case "at":
      return {
        bg: "bg-success/10",
        text: "text-success",
        border: "border-success",
      };
    case "below":
      return {
        bg: "bg-warning/10",
        text: "text-warning",
        border: "border-warning",
      };
    case "well_below":
      return {
        bg: "bg-error/10",
        text: "text-error",
        border: "border-error",
      };
  }
}

/**
 * Get period label for display
 */
export function getPeriodLabel(period: AssessmentPeriod): string {
  switch (period) {
    case "BOY":
      return "Beginning of Year";
    case "MOY":
      return "Middle of Year";
    case "EOY":
      return "End of Year";
  }
}
