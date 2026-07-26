/**
 * Benchmark scoring — banding a WCPM against a resolved Hasbrouck-Tindal norm
 * set. The norm set itself is resolved exactly once per session (see
 * lib/scoring/norms.ts) and stored in scores_json.norms; everything here takes
 * that resolved set as input rather than re-deriving grade/period.
 */

import { AssessmentPeriod, BenchmarkBand } from "../passages/library";
import {
  ResolvedNorms,
  NormCuts,
  PercentileRange,
  getBand,
  getBandLabel,
  getPercentileRange,
  describePercentile,
} from "./norms";

export interface BenchmarkResult {
  band: BenchmarkBand;
  label: string;
  wcpm: number;
  /** Honest percentile position against the five published cuts. */
  percentile: PercentileRange;
  percentileText: string;
  norms: ResolvedNorms;
  /** Convenience aliases used by display components. */
  gradeNorms: NormCuts;
  period: AssessmentPeriod;
  gradeLevel: ResolvedNorms["grade"];
}

/**
 * Band a WCPM against a resolved norm set.
 */
export function calculateBenchmark(wcpm: number, norms: ResolvedNorms): BenchmarkResult {
  const band = getBand(wcpm, norms.cuts);
  return {
    band,
    label: getBandLabel(band),
    wcpm,
    percentile: getPercentileRange(wcpm, norms.cuts),
    percentileText: describePercentile(wcpm, norms.cuts),
    norms,
    gradeNorms: norms.cuts,
    period: norms.period,
    gradeLevel: norms.grade,
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
  norms: ResolvedNorms
): MedianResult {
  const medianWcpm = calculateMedianWCPM(wcpmScores);

  return {
    medianWcpm,
    scores: wcpmScores,
    benchmark: calculateBenchmark(medianWcpm, norms),
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
