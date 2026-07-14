import { SessionEvent, DeepgramWord, EventType } from "./types";

/**
 * Normalize a word for comparison: lowercase, strip leading/trailing punctuation,
 * but preserve internal apostrophes (e.g., "don't" stays "don't")
 */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/^[^\w']+/, "")
    .replace(/[^\w']+$/, "");
}

/**
 * Needleman-Wunsch sequence alignment for comparing spoken words against expected passage.
 * Returns aligned events for each expected word.
 */
export function alignWords(
  expectedWords: string[],
  spokenWords: DeepgramWord[]
): { events: SessionEvent[]; insertions: SessionEvent[] } {
  const normalizedExpected = expectedWords.map(normalizeWord);
  const normalizedSpoken = spokenWords.map((w) => normalizeWord(w.word));

  const n = normalizedExpected.length;
  const m = normalizedSpoken.length;

  // Scoring parameters
  const MATCH = 2;
  const MISMATCH = -1;
  const GAP = -1;

  // Initialize DP matrix
  const dp: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) dp[i][0] = i * GAP;
  for (let j = 0; j <= m; j++) dp[0][j] = j * GAP;

  // Fill DP matrix
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match =
        normalizedExpected[i - 1] === normalizedSpoken[j - 1] ? MATCH : MISMATCH;
      dp[i][j] = Math.max(
        dp[i - 1][j - 1] + match,
        dp[i - 1][j] + GAP,
        dp[i][j - 1] + GAP
      );
    }
  }

  // Traceback to find alignment
  const alignment: Array<{ expectedIdx: number | null; spokenIdx: number | null }> = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const canDiag = i > 0 && j > 0;
    const isMatch =
      canDiag && normalizedExpected[i - 1] === normalizedSpoken[j - 1];
    const diagOptimal =
      canDiag && dp[i][j] === dp[i - 1][j - 1] + (isMatch ? MATCH : MISMATCH);
    const upOptimal = i > 0 && dp[i][j] === dp[i - 1][j] + GAP;

    // Earliest-match bias: when a diagonal MATCH ties with skipping the expected
    // word (an omission), prefer the omission. This only ever ties when the spoken
    // word also matches an *earlier* passage position — i.e. a repeated word — so
    // it attaches the match to the earliest occurrence and keeps the read
    // contiguous. Without this, a student who stops on a repeated word (e.g. the
    // first "construction") has their last word snapped to a later copy, marking
    // the whole passage in between as read-but-omitted and inflating the stop
    // point. A genuine substitution is a diagonal MISMATCH, so it is unaffected.
    if (diagOptimal && !(isMatch && upOptimal)) {
      alignment.unshift({ expectedIdx: i - 1, spokenIdx: j - 1 });
      i--;
      j--;
    } else if (upOptimal) {
      alignment.unshift({ expectedIdx: i - 1, spokenIdx: null });
      i--;
    } else {
      alignment.unshift({ expectedIdx: null, spokenIdx: j - 1 });
      j--;
    }
  }

  // Build events from alignment
  const events: SessionEvent[] = [];
  const insertions: SessionEvent[] = [];
  const usedExpectedIndices = new Set<number>();

  for (const align of alignment) {
    if (align.expectedIdx !== null && align.spokenIdx !== null) {
      // Match or substitution
      const expectedWord = expectedWords[align.expectedIdx];
      const spoken = spokenWords[align.spokenIdx];
      const isMatch = normalizedExpected[align.expectedIdx] === normalizedSpoken[align.spokenIdx];

      events.push({
        word_index: align.expectedIdx,
        expected_word: expectedWord,
        spoken_word: spoken.word,
        start_timestamp_ms: Math.round(spoken.start * 1000),
        end_timestamp_ms: Math.round(spoken.end * 1000),
        event_type: isMatch ? "correct" : "substitution",
        confidence_score: spoken.confidence,
      });
      usedExpectedIndices.add(align.expectedIdx);
    } else if (align.expectedIdx !== null) {
      // Omission - expected word not spoken
      events.push({
        word_index: align.expectedIdx,
        expected_word: expectedWords[align.expectedIdx],
        spoken_word: null,
        start_timestamp_ms: null,
        end_timestamp_ms: null,
        event_type: "omission",
        confidence_score: null,
      });
      usedExpectedIndices.add(align.expectedIdx);
    } else if (align.spokenIdx !== null) {
      // Insertion - spoken word not in expected
      const spoken = spokenWords[align.spokenIdx];
      insertions.push({
        word_index: -1,
        expected_word: "",
        spoken_word: spoken.word,
        start_timestamp_ms: Math.round(spoken.start * 1000),
        end_timestamp_ms: Math.round(spoken.end * 1000),
        event_type: "insertion",
        confidence_score: spoken.confidence,
      });
    }
  }

  // Sort events by word_index
  events.sort((a, b) => a.word_index - b.word_index);

  // Detect self-corrections: if a substitution is immediately followed by the correct word within 1.5s
  detectSelfCorrections(events, insertions, spokenWords, normalizedExpected);

  // Detect mispronunciations: correct words with low confidence scores
  detectMispronunciations(events);

  return { events, insertions };
}

function detectSelfCorrections(
  events: SessionEvent[],
  insertions: SessionEvent[],
  spokenWords: DeepgramWord[],
  normalizedExpected: string[]
): void {
  // Look for patterns where a word was spoken incorrectly, then correctly spoken shortly after
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.event_type !== "substitution" || !event.end_timestamp_ms) continue;

    const expectedNorm = normalizeWord(event.expected_word);

    // Check insertions that occur right after this substitution
    for (const insertion of insertions) {
      if (!insertion.start_timestamp_ms || !insertion.spoken_word) continue;

      const timeDiff = insertion.start_timestamp_ms - event.end_timestamp_ms;
      if (timeDiff > 0 && timeDiff < 1500) {
        const insertionNorm = normalizeWord(insertion.spoken_word);
        if (insertionNorm === expectedNorm) {
          // This is a self-correction
          event.event_type = "self_correction";
          break;
        }
      }
    }
  }
}

/**
 * Detect mispronunciations based on confidence scores.
 * Words that match but have low confidence (< 0.80) may indicate
 * pronunciation issues - the ASR understood it but wasn't confident.
 */
function detectMispronunciations(events: SessionEvent[]): void {
  const MISPRONUNCIATION_THRESHOLD = 0.80;

  for (const event of events) {
    // Only flag "correct" words with low confidence as mispronunciations
    if (
      event.event_type === "correct" &&
      event.confidence_score !== null &&
      event.confidence_score < MISPRONUNCIATION_THRESHOLD
    ) {
      event.event_type = "mispronunciation";
    }
  }
}
