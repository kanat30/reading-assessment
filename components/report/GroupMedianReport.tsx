"use client";

import {
  calculateMedianResult,
  calculateMedianWCPM,
  getBenchmarkColor,
} from "@/lib/scoring/benchmark";
import { ReadingLevel, AssessmentPeriod } from "@/lib/passages/library";
import { BenchmarkBand } from "./BenchmarkBand";

// One passage's headline metrics, pulled from that session's stored scores_json.
export interface GroupPassageStat {
  wcpm: number | null;
  accuracy: number | null;
  prosodyLevel: number | null;
  comprehensionScore: number | null;
  comprehensionTotal: number | null;
  comprehensionPending: boolean;
}

interface GroupMedianReportProps {
  stats: GroupPassageStat[]; // one entry per passage the student actually read
  totalPassages: number; // passages the assessment was configured for (e.g. 3)
  readingLevel: number | null;
  period: string | null;
}

const VALID_LEVELS = [3, 4, 5, 6, 7];
const VALID_PERIODS = ["BOY", "MOY", "EOY"];

// Median of a numeric list (reuses the WCPM median so accuracy/prosody follow the same
// Acadience rule: middle of 3, average of 2). Returns null for an empty list.
function median(nums: number[]): number | null {
  return nums.length === 0 ? null : calculateMedianWCPM(nums);
}

/**
 * Compact "overall" report for a student's multi-passage (median-of-3) assessment.
 * Everything here is derived from the passages the student submitted — the median WCPM
 * is the reportable benchmark, with median accuracy/prosody and aggregate comprehension
 * as supporting context. It is deliberately shallow; the per-passage sub-rows below it
 * hold the full breakdowns.
 */
export function GroupMedianReport({
  stats,
  totalPassages,
  readingLevel,
  period,
}: GroupMedianReportProps) {
  const wcpms = stats
    .map((s) => s.wcpm)
    .filter((n): n is number => typeof n === "number");
  const accuracies = stats
    .map((s) => s.accuracy)
    .filter((n): n is number => typeof n === "number");
  const prosodyLevels = stats
    .map((s) => s.prosodyLevel)
    .filter((n): n is number => typeof n === "number");

  const readCount = stats.length;
  const scored = wcpms.length;

  // Comprehension is a small per-passage check; aggregate across the read passages.
  const compStats = stats.filter(
    (s) => (s.comprehensionTotal ?? 0) > 0
  );
  const compPending = stats.some((s) => s.comprehensionPending);
  const compScore = compStats.reduce((a, s) => a + (s.comprehensionScore ?? 0), 0);
  const compTotal = compStats.reduce((a, s) => a + (s.comprehensionTotal ?? 0), 0);

  const medAccuracy = median(accuracies);
  const medProsody = prosodyLevels.length
    ? Math.round(median(prosodyLevels)!)
    : null;

  const levelValid = readingLevel != null && VALID_LEVELS.includes(readingLevel);
  const periodValid = period != null && VALID_PERIODS.includes(period);
  const medianResult =
    scored > 0 && levelValid && periodValid
      ? calculateMedianResult(
          wcpms,
          readingLevel as ReadingLevel,
          period as AssessmentPeriod
        )
      : null;

  // One numbered marker per scored passage, in passage order (1, 2, 3), placed on the
  // benchmark ribbon at its own WCPM.
  const passageMarkers = stats
    .map((s, i) => ({ label: String(i + 1), wcpm: s.wcpm }))
    .filter((m): m is { label: string; wcpm: number } => typeof m.wcpm === "number");

  const colors = medianResult ? getBenchmarkColor(medianResult.benchmark.band) : null;

  const passageLabel =
    readCount === totalPassages
      ? `${totalPassages} passages`
      : `${readCount} of ${totalPassages} passages`;

  return (
    <div className="rounded-xl border border-mist/60 bg-[#FDFCFA] p-5 mb-3">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone">
          Overall · median of {passageLabel}
        </p>
        {readCount < totalPassages && (
          <span className="text-xs text-warning">
            Partial — {readCount} of {totalPassages} read
          </span>
        )}
      </div>

      {medianResult && colors ? (
        <div className={`p-5 rounded-xl ${colors.bg} border ${colors.border}`}>
          <BenchmarkBand result={medianResult.benchmark} passageMarkers={passageMarkers} />
          <p className="text-[11px] text-stone mt-3">
            Numbered markers show each passage&apos;s WCPM; the highlighted marker is the
            median, which sets the benchmark.
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone">
          {scored === 0
            ? "Awaiting scores."
            : `Median ${calculateMedianWCPM(wcpms)} WCPM · benchmark band unavailable for this assessment.`}
        </p>
      )}

      {/* Supporting metrics — median accuracy / prosody, aggregate comprehension */}
      <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-mist">
        <div className="text-center">
          <div className="text-2xl font-semibold text-ink font-mono">
            {medAccuracy != null ? `${medAccuracy}%` : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-stone mt-1">
            Median accuracy
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-ink font-mono">
            {medProsody != null ? `${medProsody}/4` : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-stone mt-1">
            Typical prosody
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-ink font-mono">
            {compTotal > 0 ? `${compScore}/${compTotal}` : compPending ? "…" : "—"}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-stone mt-1">
            Comprehension{compPending && compTotal > 0 ? " · grading" : ""}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-stone mt-4 leading-relaxed">
        Advisory only. The benchmark uses the median WCPM of the passages read
        (Acadience median-of-3 protocol); accuracy and prosody shown are the median
        across those passages. Open a passage below for its full breakdown.{" "}
        <a
          href="/explainability"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ink"
        >
          How scoring works
        </a>
      </p>
    </div>
  );
}
