"use client";

import { motion } from "framer-motion";
import { BenchmarkResult, getBenchmarkColor, getPeriodLabel } from "@/lib/scoring/benchmark";

interface BenchmarkBandProps {
  result: BenchmarkResult;
  showNorms?: boolean;
  compact?: boolean;
  // Optional per-passage markers (median-of-3 group view). Each is placed on the scale
  // at its WCPM with its label; the one matching the median is highlighted.
  passageMarkers?: { label: string; wcpm: number }[];
}

export function BenchmarkBand({ result, showNorms = true, compact = false, passageMarkers }: BenchmarkBandProps) {
  const colors = getBenchmarkColor(result.band);
  const { p25, p50 } = result.gradeNorms;
  // For 3 reads the median equals one of the passage WCPMs, so its numbered marker
  // doubles as the median highlight; only draw the standalone median pill when it does
  // not coincide with a passage marker (e.g. a 2-passage average).
  const medianOnAPassage =
    !!passageMarkers && passageMarkers.some((m) => m.wcpm === result.wcpm);

  // Calculate position on the benchmark scale (0-100%)
  // Scale: 0 to p50 * 1.5 (showing some room above benchmark)
  const maxScale = Math.round(p50 * 1.5);
  const wcpmPosition = Math.min(100, (result.wcpm / maxScale) * 100);
  const p25Position = (p25 / maxScale) * 100;
  const p50Position = (p50 / maxScale) * 100;

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg ${colors.bg}`}>
        <span className={`font-semibold ${colors.text}`}>{result.label}</span>
        <span className="text-stone text-sm">|</span>
        <span className="text-ink font-mono">{result.wcpm} WCPM</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main score display */}
      <div className="flex items-baseline gap-3">
        <span className="text-4xl font-bold text-ink font-mono">{result.wcpm}</span>
        <span className="text-lg text-stone">WCPM</span>
        <span className={`ml-auto px-3 py-1 rounded-lg text-sm font-semibold ${colors.bg} ${colors.text}`}>
          {result.label}
        </span>
      </div>

      {/* Visual scale */}
      <div className="relative h-8 bg-mist/50 rounded-lg overflow-hidden">
        {/* Well below zone (0 to p25) */}
        <div
          className="absolute left-0 top-0 bottom-0 bg-error/20"
          style={{ width: `${p25Position}%` }}
        />
        {/* Below zone (p25 to p50) */}
        <div
          className="absolute top-0 bottom-0 bg-warning/20"
          style={{ left: `${p25Position}%`, width: `${p50Position - p25Position}%` }}
        />
        {/* At benchmark zone (p50+) */}
        <div
          className="absolute top-0 bottom-0 bg-success/20"
          style={{ left: `${p50Position}%`, right: 0 }}
        />

        {/* P25 marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-warning/60"
          style={{ left: `${p25Position}%` }}
        />
        {/* P50 marker */}
        <div
          className="absolute top-0 bottom-0 w-px bg-success/60"
          style={{ left: `${p50Position}%` }}
        />

        {/* Per-passage numbered markers (group view) */}
        {passageMarkers?.map((m, i) => {
          const pos = Math.min(100, (m.wcpm / maxScale) * 100);
          const isMedian = m.wcpm === result.wcpm;
          return (
            <div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10"
              style={{ left: `${pos}%` }}
              title={`Passage ${m.label} · ${m.wcpm} WCPM${isMedian ? " (median)" : ""}`}
            >
              <div
                className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm ${
                  isMedian
                    ? "bg-accent-blue text-paper ring-2 ring-accent-blue/30"
                    : "bg-paper text-ink border border-ink/40"
                }`}
              >
                {m.label}
              </div>
            </div>
          );
        })}

        {/* Median / current WCPM marker — vivid in group view, suppressed when it already
            coincides with a numbered passage marker */}
        {!medianOnAPassage && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className={`absolute top-1 bottom-1 w-2 rounded-full border-2 shadow-sm z-10 ${
              passageMarkers ? "border-accent-blue bg-accent-blue" : `${colors.border} bg-paper`
            }`}
            style={{ left: `calc(${wcpmPosition}% - 4px)` }}
          />
        )}
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-stone">
        <span>0</span>
        <div className="flex gap-8">
          <span className="text-warning">25th: {p25}</span>
          <span className="text-success">50th: {p50}</span>
        </div>
        <span>{maxScale}</span>
      </div>

      {/* Norms info */}
      {showNorms && (
        <div className="mt-2 text-xs text-stone">
          Grade {result.gradeLevel} norms ({getPeriodLabel(result.period)})
        </div>
      )}
    </div>
  );
}
