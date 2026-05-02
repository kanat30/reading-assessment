import { SessionEvent } from "./types";

/**
 * Enhanced error pattern interface for Week 5
 * Provides richer context for teacher reports
 */
export interface EnhancedErrorPattern {
  id: string;                    // 'multisyllabic' | 'suffix-tion' | 'function-words' | etc.
  label: string;                 // human-readable
  description: string;           // one short sentence
  matched_words: string[];       // unique expected words that matched
  event_count: number;
}

// Suffixes to detect, in order of priority
const SUFFIXES = ["-tion", "-sion", "-ous", "-ular", "-ment", "-ity", "-able", "-ible"];

// Function words (high-frequency grammatical words)
const FUNCTION_WORDS = new Set([
  "the", "a", "an", "of", "to", "in", "is", "was", "were", "are",
  "be", "by", "for", "with", "on", "at", "as", "that", "this"
]);

// Dolch sight words (220 most common words for early readers)
const DOLCH_WORDS = new Set([
  // Pre-primer
  "a", "and", "away", "big", "blue", "can", "come", "down", "find", "for",
  "funny", "go", "help", "here", "i", "in", "is", "it", "jump", "little",
  "look", "make", "me", "my", "not", "one", "play", "red", "run", "said",
  "see", "the", "three", "to", "two", "up", "we", "where", "yellow", "you",
  // Primer
  "all", "am", "are", "at", "ate", "be", "black", "brown", "but", "came",
  "did", "do", "eat", "four", "get", "good", "have", "he", "into", "like",
  "must", "new", "no", "now", "on", "our", "out", "please", "pretty", "ran",
  "ride", "saw", "say", "she", "so", "soon", "that", "there", "they", "this",
  "too", "under", "want", "was", "well", "went", "what", "white", "who", "will",
  "with", "yes",
  // First grade
  "after", "again", "an", "any", "as", "ask", "by", "could", "every", "fly",
  "from", "give", "going", "had", "has", "her", "him", "his", "how", "just",
  "know", "let", "live", "may", "of", "old", "once", "open", "over", "put",
  "round", "some", "stop", "take", "thank", "them", "then", "think", "walk", "were",
  "when",
  // Second grade
  "always", "around", "because", "been", "before", "best", "both", "buy", "call", "cold",
  "does", "don't", "fast", "first", "five", "found", "gave", "goes", "green", "its",
  "made", "many", "off", "or", "pull", "read", "right", "sing", "sit", "sleep",
  "tell", "their", "these", "those", "upon", "us", "use", "very", "wash", "which",
  "why", "wish", "work", "would", "write", "your",
  // Third grade
  "about", "better", "bring", "carry", "clean", "cut", "done", "draw", "drink", "eight",
  "fall", "far", "full", "got", "grow", "hold", "hot", "hurt", "if", "keep",
  "kind", "laugh", "light", "long", "much", "myself", "never", "only", "own", "pick",
  "seven", "shall", "show", "six", "small", "start", "ten", "today", "together", "try",
  "warm"
]);

/**
 * Count syllables in a word using a simple heuristic:
 * - Count vowel groups (consecutive vowels count as one)
 * - Subtract 1 if word ends in silent 'e'
 */
function countSyllables(word: string): number {
  const normalizedWord = word.toLowerCase().replace(/[^a-z]/g, "");
  if (normalizedWord.length === 0) return 0;

  // Count vowel groups
  const vowelGroups = normalizedWord.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 0;

  // Subtract 1 if ends in silent 'e' (but only if we have 2+ syllables)
  if (count > 1 && normalizedWord.endsWith("e") && !normalizedWord.endsWith("le")) {
    count--;
  }

  // Handle special case: words ending in 'le' after consonant (e.g., "table" = 2 syllables)
  if (normalizedWord.match(/[^aeiou]le$/)) {
    // Already counted correctly by vowel groups
  }

  return Math.max(1, count);
}

/**
 * Get the suffix of a word if it matches one of our target suffixes
 */
function getSuffix(word: string): string | null {
  const normalizedWord = word.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (normalizedWord.endsWith(suffix.slice(1))) { // Remove leading '-'
      return suffix;
    }
  }
  return null;
}

/**
 * Compute error patterns from session events
 * Returns up to 3 patterns, applying detection rules in priority order
 * Each event can only match one pattern
 */
export function computeErrorPatterns(events: SessionEvent[]): EnhancedErrorPattern[] {
  const patterns: EnhancedErrorPattern[] = [];
  const usedEventIndices = new Set<number>();

  // Filter to error events (substitution, omission, mispronunciation) and self-corrections
  const errorEvents = events.filter(e =>
    ["substitution", "omission", "mispronunciation"].includes(e.event_type)
  );
  const selfCorrectionEvents = events.filter(e => e.event_type === "self_correction");

  // ============================================
  // Pattern 1: Multisyllabic words (3+ syllables)
  // ============================================
  const multisyllabicEvents: { event: SessionEvent; index: number }[] = [];

  for (let i = 0; i < errorEvents.length; i++) {
    const event = errorEvents[i];
    if (countSyllables(event.expected_word) >= 3) {
      multisyllabicEvents.push({ event, index: i });
    }
  }

  if (multisyllabicEvents.length >= 2) {
    const matchedWords = [...new Set(multisyllabicEvents.map(e => e.event.expected_word.toLowerCase()))];
    patterns.push({
      id: "multisyllabic",
      label: "Multisyllabic words (3+ syllables)",
      description: "Showed difficulty with longer, less-frequent vocabulary.",
      matched_words: matchedWords,
      event_count: multisyllabicEvents.length
    });
    multisyllabicEvents.forEach(e => usedEventIndices.add(e.index));
  }

  // ============================================
  // Pattern 2: Suffix-based groupings
  // ============================================
  if (patterns.length < 3) {
    const suffixGroups = new Map<string, { event: SessionEvent; index: number }[]>();

    for (let i = 0; i < errorEvents.length; i++) {
      if (usedEventIndices.has(i)) continue;

      const event = errorEvents[i];
      const suffix = getSuffix(event.expected_word);
      if (suffix) {
        if (!suffixGroups.has(suffix)) {
          suffixGroups.set(suffix, []);
        }
        suffixGroups.get(suffix)!.push({ event, index: i });
      }
    }

    // Find suffixes with 2+ events
    for (const [suffix, suffixEvents] of suffixGroups) {
      if (patterns.length >= 3) break;
      if (suffixEvents.length >= 2) {
        const matchedWords = [...new Set(suffixEvents.map(e => e.event.expected_word.toLowerCase()))];
        patterns.push({
          id: `suffix${suffix}`,
          label: `${suffix} words`,
          description: `Struggled with words ending in "${suffix}".`,
          matched_words: matchedWords,
          event_count: suffixEvents.length
        });
        suffixEvents.forEach(e => usedEventIndices.add(e.index));
      }
    }
  }

  // ============================================
  // Pattern 3: Function words
  // ============================================
  if (patterns.length < 3) {
    const functionWordEvents: { event: SessionEvent; index: number }[] = [];

    for (let i = 0; i < errorEvents.length; i++) {
      if (usedEventIndices.has(i)) continue;

      const event = errorEvents[i];
      if (FUNCTION_WORDS.has(event.expected_word.toLowerCase())) {
        functionWordEvents.push({ event, index: i });
      }
    }

    if (functionWordEvents.length >= 3) {
      const matchedWords = [...new Set(functionWordEvents.map(e => e.event.expected_word.toLowerCase()))];
      patterns.push({
        id: "function-words",
        label: "Function words",
        description: "Errors on common grammatical words (the, a, of, etc.).",
        matched_words: matchedWords,
        event_count: functionWordEvents.length
      });
      functionWordEvents.forEach(e => usedEventIndices.add(e.index));
    }
  }

  // ============================================
  // Pattern 4: Sight words (Dolch)
  // ============================================
  if (patterns.length < 3) {
    const sightWordEvents: { event: SessionEvent; index: number }[] = [];

    for (let i = 0; i < errorEvents.length; i++) {
      if (usedEventIndices.has(i)) continue;

      const event = errorEvents[i];
      // Only count Dolch words that aren't also function words (to avoid overlap)
      const word = event.expected_word.toLowerCase();
      if (DOLCH_WORDS.has(word) && !FUNCTION_WORDS.has(word)) {
        sightWordEvents.push({ event, index: i });
      }
    }

    if (sightWordEvents.length >= 3) {
      const matchedWords = [...new Set(sightWordEvents.map(e => e.event.expected_word.toLowerCase()))];
      patterns.push({
        id: "sight-words",
        label: "High-frequency sight words",
        description: "Missed common words that should be recognized instantly.",
        matched_words: matchedWords,
        event_count: sightWordEvents.length
      });
      sightWordEvents.forEach(e => usedEventIndices.add(e.index));
    }
  }

  // ============================================
  // Pattern 5: Self-corrections
  // ============================================
  if (patterns.length < 3 && selfCorrectionEvents.length >= 4) {
    const matchedWords = [...new Set(selfCorrectionEvents.map(e => e.expected_word.toLowerCase()))];
    patterns.push({
      id: "self-corrections",
      label: "Frequent self-corrections",
      description: "Showed effortful reading with multiple self-corrections.",
      matched_words: matchedWords,
      event_count: selfCorrectionEvents.length
    });
  }

  return patterns.slice(0, 3);
}

/**
 * Convert enhanced patterns to the simpler legacy format for backwards compatibility
 */
export function toLegacyPatterns(patterns: EnhancedErrorPattern[]): { pattern: string; count: number; total: number }[] {
  return patterns.map(p => ({
    pattern: p.label,
    count: p.event_count,
    total: p.matched_words.length
  }));
}
