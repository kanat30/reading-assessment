import { SessionEvent, ScoringMetrics, ErrorPattern } from "./types";

// A student reads one contiguous chunk of the passage and then goes silent, so
// once they truly stop there should be no more voiced words. But the aligner can
// still attach a stray match past the stop point — most often when the word the
// student stopped on repeats later in the passage (see the earliest-match bias in
// alignment.ts), or when a handful of common words in the skipped remainder happen
// to match. Left unchecked, that stray match teleports the stop point forward and
// marks the whole intervening passage as read-but-omitted, corrupting WCPM,
// accuracy, and the bands. GAP_THRESHOLD is the largest run of never-voiced words
// we still treat as an in-read skip; a bigger silent gap followed only by a sparse
// TAIL_TOLERANCE of voiced words is treated as the stray tail after the real stop.
// NOTE: the SQL override-recompute (recalculate_session_metrics, migration 0022)
// re-implements the gap/tail cutoff below. Keep these two constants in sync there.
const NOT_REACHED_GAP_THRESHOLD = 12;
const NOT_REACHED_TAIL_TOLERANCE = 3;

/**
 * Index of the last passage word the student actually reached (voiced) within the
 * timed sample. Words after this index were never attempted — the read simply ran
 * out of time. In ORF scoring those "not reached" words are NOT errors: they are
 * excluded from WCPM, accuracy, error patterns, and the transcript's error styling.
 *
 * A word counts as reached if it was voiced (has a spoken word). A genuine
 * mid-passage skip — a run of omissions the student then keeps reading past (a
 * substantial voiced run follows) — stays counted as errors. Only a large silent
 * gap followed by a stray, sparse tail of voiced words is treated as the aligner
 * mis-attaching a match past where the student actually stopped; in that case the
 * stop point is the end of the leading contiguous read. Returns -1 if nothing was
 * voiced.
 */
export function getLastReachedIndex(
  events: ReadonlyArray<{ word_index: number; spoken_word: string | null; event_type: string }>
): number {
  const voiced: number[] = [];
  for (const event of events) {
    if (event.spoken_word !== null && event.event_type !== "insertion") {
      voiced.push(event.word_index);
    }
  }
  if (voiced.length === 0) return -1;
  voiced.sort((a, b) => a - b);

  // Cut at the first large silent gap whose remaining voiced words are only a
  // sparse tail (the stray post-stop matches). A big gap followed by substantial
  // continued reading is a real skip and is left intact.
  for (let k = 0; k < voiced.length - 1; k++) {
    const gap = voiced[k + 1] - voiced[k] - 1;
    if (gap >= NOT_REACHED_GAP_THRESHOLD) {
      const remainingAfterGap = voiced.length - (k + 1);
      if (remainingAfterGap <= NOT_REACHED_TAIL_TOLERANCE) {
        return voiced[k];
      }
    }
  }

  return voiced[voiced.length - 1];
}

export function calculateMetrics(
  events: SessionEvent[],
  durationSeconds: number
): ScoringMetrics {
  // Only score up to the last word the student actually reached; trailing
  // never-reached words are excluded (they are not errors).
  const lastAttemptedIndex = getLastReachedIndex(events);

  // Count correct words (correct + self_correction count as correct per Hasbrouck-Tindal)
  let correctWords = 0;
  let totalWordsAttempted = 0;

  for (const event of events) {
    if (event.event_type === "insertion") continue;
    if (event.word_index > lastAttemptedIndex) continue; // not reached
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
    };
  }

  // Calculate WCPM
  const wcpm = Math.round((correctWords / durationSeconds) * 60);

  // Calculate accuracy
  const accuracy_percent = Math.round((correctWords / totalWordsAttempted) * 100);

  return {
    wcpm,
    accuracy_percent,
    correct_words: correctWords,
    total_words_attempted: totalWordsAttempted,
  };
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
