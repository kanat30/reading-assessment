"use client";

import { SessionEvent, ScoringMetrics } from "@/lib/scoring/types";

interface ProsodyGaugesProps {
  events: SessionEvent[];
  metrics: ScoringMetrics;
}

interface DimensionScore {
  label: string;
  value: 1 | 2 | 3 | 4;
  description: string;
}

/**
 * Four MDFS (Multi-Dimensional Fluency Scale) prosody gauges.
 * Uses rule-based estimates from the transcript data.
 */
export function ProsodyGauges({ events, metrics }: ProsodyGaugesProps) {
  // Calculate prosody dimensions
  const dimensions = calculateProsodyDimensions(events, metrics);

  return (
    <div className="grid grid-cols-2 gap-4">
      {dimensions.map((dim) => (
        <div key={dim.label} className="bg-mist/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-stone uppercase tracking-wide">
              {dim.label}
            </p>
            <span className="text-lg font-semibold text-ink">{dim.value}/4</span>
          </div>

          {/* Dot gauge */}
          <div className="flex gap-1.5 mb-2">
            {[1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`w-3 h-3 rounded-full transition-colors ${
                  level <= dim.value
                    ? level >= 3
                      ? "bg-success"
                      : level === 2
                      ? "bg-warning"
                      : "bg-alert"
                    : "bg-mist"
                }`}
              />
            ))}
          </div>

          <p className="text-xs text-stone">{dim.description}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Calculate prosody dimensions using rule-based heuristics.
 */
function calculateProsodyDimensions(
  events: SessionEvent[],
  metrics: ScoringMetrics
): DimensionScore[] {
  // Expression: Based on word duration variance
  // High variance = more expression (within reason)
  const expression = calculateExpression(events);

  // Phrasing: 4 minus count of pauses > 1.5s
  const phrasing = calculatePhrasing(events);

  // Smoothness: 4 minus self-corrections count, clamped
  const smoothness = calculateSmoothness(events);

  // Pace: From WCPM
  const pace = calculatePace(metrics.wcpm);

  return [
    {
      label: "Expression",
      value: expression.value,
      description: expression.description,
    },
    {
      label: "Phrasing",
      value: phrasing.value,
      description: phrasing.description,
    },
    {
      label: "Smoothness",
      value: smoothness.value,
      description: smoothness.description,
    },
    {
      label: "Pace",
      value: pace.value,
      description: pace.description,
    },
  ];
}

function calculateExpression(events: SessionEvent[]): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  // Calculate word duration variance
  const durations: number[] = [];

  for (const e of events) {
    if (e.start_timestamp_ms !== null && e.end_timestamp_ms !== null) {
      const duration = e.end_timestamp_ms - e.start_timestamp_ms;
      if (duration > 0 && duration < 2000) {
        // Filter outliers
        durations.push(duration);
      }
    }
  }

  if (durations.length < 5) {
    return { value: 2, description: "Limited data for expression analysis" };
  }

  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
  const variance =
    durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) /
    durations.length;
  const coeffOfVariation = Math.sqrt(variance) / mean;

  // Moderate variance indicates natural expression
  if (coeffOfVariation >= 0.3 && coeffOfVariation <= 0.6) {
    return { value: 4, description: "Natural variation in word emphasis" };
  } else if (coeffOfVariation >= 0.2 && coeffOfVariation < 0.7) {
    return { value: 3, description: "Some variation in expression" };
  } else if (coeffOfVariation < 0.2) {
    return { value: 2, description: "Mostly monotone delivery" };
  } else {
    return { value: 2, description: "Inconsistent word timing" };
  }
}

function calculatePhrasing(events: SessionEvent[]): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  // Count pauses > 1.5s between words
  let longPauses = 0;

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];

    if (prev.end_timestamp_ms !== null && curr.start_timestamp_ms !== null) {
      const gap = curr.start_timestamp_ms - prev.end_timestamp_ms;
      if (gap > 1500) {
        longPauses++;
      }
    }
  }

  const value = Math.max(1, Math.min(4, 4 - longPauses)) as 1 | 2 | 3 | 4;

  const descriptions: Record<number, string> = {
    4: "Natural phrase boundaries",
    3: "Occasional hesitations",
    2: "Some long pauses",
    1: "Frequent interruptions",
  };

  return { value, description: descriptions[value] };
}

function calculateSmoothness(events: SessionEvent[]): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  const selfCorrections = events.filter(
    (e) => e.event_type === "self_correction"
  ).length;

  const value = Math.max(1, Math.min(4, 4 - selfCorrections)) as 1 | 2 | 3 | 4;

  const descriptions: Record<number, string> = {
    4: "Smooth, uninterrupted reading",
    3: "Minor corrections made",
    2: "Several self-corrections",
    1: "Frequent self-corrections",
  };

  return { value, description: descriptions[value] };
}

function calculatePace(wcpm: number): {
  value: 1 | 2 | 3 | 4;
  description: string;
} {
  // WCPM benchmarks for grades 4-6
  // 90+ → 4, 70-89 → 3, 50-69 → 2, <50 → 1

  let value: 1 | 2 | 3 | 4;
  let description: string;

  if (wcpm >= 90) {
    value = 4;
    description = "Appropriate, consistent pace";
  } else if (wcpm >= 70) {
    value = 3;
    description = "Generally steady pace";
  } else if (wcpm >= 50) {
    value = 2;
    description = "Slow but steady";
  } else {
    value = 1;
    description = "Very slow pace";
  }

  return { value, description };
}
