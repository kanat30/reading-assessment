import { SessionEvent, ScoringMetrics, ErrorPattern } from "./types";

// Hasbrouck-Tindal Grade 6 Spring Norms
const NORMS = {
  percentile_90: 177,
  percentile_75: 166,
  percentile_50: 150,
  percentile_25: 122,
  percentile_10: 89,
};

export function calculateMetrics(
  events: SessionEvent[],
  durationSeconds: number
): ScoringMetrics {
  // Find where the student stopped reading (last non-omission event)
  let lastAttemptedIndex = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].event_type !== "omission") {
      lastAttemptedIndex = i;
      break;
    }
  }

  // Count correct words (correct + self_correction count as correct per Hasbrouck-Tindal)
  let correctWords = 0;
  let totalWordsAttempted = 0;

  for (let i = 0; i <= lastAttemptedIndex; i++) {
    const event = events[i];
    totalWordsAttempted++;
    if (event.event_type === "correct" || event.event_type === "self_correction") {
      correctWords++;
    }
  }

  // Handle edge case where nothing was attempted
  if (totalWordsAttempted === 0) {
    return {
      wcpm: 0,
      accuracy_percent: 0,
      correct_words: 0,
      total_words_attempted: 0,
      percentile_estimate: 1,
      percentile_band: "below",
    };
  }

  // Calculate WCPM
  const wcpm = Math.round((correctWords / durationSeconds) * 60);

  // Calculate accuracy
  const accuracy_percent = Math.round((correctWords / totalWordsAttempted) * 100);

  // Calculate percentile estimate using linear interpolation
  const percentile_estimate = estimatePercentile(wcpm);

  // Determine percentile band
  let percentile_band: "above" | "approaching" | "below";
  if (wcpm >= NORMS.percentile_50) {
    percentile_band = "above";
  } else if (wcpm >= NORMS.percentile_25) {
    percentile_band = "approaching";
  } else {
    percentile_band = "below";
  }

  return {
    wcpm,
    accuracy_percent,
    correct_words: correctWords,
    total_words_attempted: totalWordsAttempted,
    percentile_estimate,
    percentile_band,
  };
}

function estimatePercentile(wcpm: number): number {
  // Linear interpolation between norm points
  const points = [
    { percentile: 10, wcpm: NORMS.percentile_10 },
    { percentile: 25, wcpm: NORMS.percentile_25 },
    { percentile: 50, wcpm: NORMS.percentile_50 },
    { percentile: 75, wcpm: NORMS.percentile_75 },
    { percentile: 90, wcpm: NORMS.percentile_90 },
  ];

  // Below minimum
  if (wcpm <= points[0].wcpm) {
    return Math.max(1, Math.round((wcpm / points[0].wcpm) * points[0].percentile));
  }

  // Above maximum
  if (wcpm >= points[points.length - 1].wcpm) {
    const excess = wcpm - points[points.length - 1].wcpm;
    return Math.min(99, points[points.length - 1].percentile + Math.round(excess / 5));
  }

  // Find the two points to interpolate between
  for (let i = 0; i < points.length - 1; i++) {
    if (wcpm >= points[i].wcpm && wcpm < points[i + 1].wcpm) {
      const ratio =
        (wcpm - points[i].wcpm) / (points[i + 1].wcpm - points[i].wcpm);
      return Math.round(
        points[i].percentile + ratio * (points[i + 1].percentile - points[i].percentile)
      );
    }
  }

  return 50; // Fallback
}

export function analyzeErrorPatterns(events: SessionEvent[]): ErrorPattern[] {
  const patterns: Map<string, { count: number; total: number }> = new Map();

  // Group errors by suffix patterns
  const suffixes = ["-tion", "-ing", "-ed", "-ly", "-ness", "-ment", "-able", "-ible"];

  for (const event of events) {
    if (event.event_type === "substitution" || event.event_type === "omission" || event.event_type === "mispronunciation") {
      const word = event.expected_word.toLowerCase();

      for (const suffix of suffixes) {
        if (word.endsWith(suffix.slice(1))) {
          const key = `${suffix} words`;
          const current = patterns.get(key) || { count: 0, total: 0 };
          current.count++;
          patterns.set(key, current);
        }
      }
    }
  }

  // Count totals for each suffix pattern
  for (const event of events) {
    const word = event.expected_word.toLowerCase();
    for (const suffix of suffixes) {
      if (word.endsWith(suffix.slice(1))) {
        const key = `${suffix} words`;
        const current = patterns.get(key);
        if (current) {
          current.total++;
        }
      }
    }
  }

  // Convert to array and filter to patterns with errors
  const result: ErrorPattern[] = [];
  for (const [pattern, data] of patterns) {
    if (data.count > 0 && data.total > 0) {
      result.push({
        pattern,
        count: data.count,
        total: data.total,
      });
    }
  }

  // Sort by count descending
  result.sort((a, b) => b.count - a.count);

  return result.slice(0, 3); // Top 3 patterns
}
