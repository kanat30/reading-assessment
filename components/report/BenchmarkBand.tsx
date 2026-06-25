"use client";

import { motion } from "framer-motion";
import { BenchmarkResult, getBenchmarkColor, getPeriodLabel } from "@/lib/scoring/benchmark";

interface BenchmarkBandProps {
  result: BenchmarkResult;
  showNorms?: boolean;
  compact?: boolean;
}

export function BenchmarkBand({ result, showNorms = true, compact = false }: BenchmarkBandProps) {
  const colors = getBenchmarkColor(result.band);
  const { p25, p50 } = result.gradeNorms;

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

        {/* Current WCPM marker */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring" }}
          className={`absolute top-1 bottom-1 w-2 rounded-full ${colors.border} border-2 bg-paper shadow-sm`}
          style={{ left: `calc(${wcpmPosition}% - 4px)` }}
        />
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
