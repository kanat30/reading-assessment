/**
 * Stop-point / repeated-word alignment regression checks.
 *
 * Guards the two fixes for the "the student stopped on a repeated word and the app
 * teleported the stop point forward" bug:
 *   A) alignment.ts — earliest-match bias so a repeated spoken word attaches to its
 *      earliest passage occurrence (keeps the read contiguous).
 *   B) metrics.ts getLastReachedIndex — a large silent gap followed by only a sparse
 *      tail of voiced words is treated as the real stop, not read-but-omitted.
 *
 * These are the trust-critical scoring paths (WCPM / accuracy / bands), so they get
 * a deterministic check even though the repo has no test runner yet.
 *
 * Usage: npx tsx scripts/validate-stop-point.ts   (exit code 1 on failure)
 */

import { alignWords } from "../lib/scoring/alignment";
import { getLastReachedIndex, calculateMetrics } from "../lib/scoring/metrics";
import { DeepgramWord } from "../lib/scoring/types";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

// Build fake Deepgram words with sequential, non-overlapping timings.
function spoken(words: string[], startAt = 0): DeepgramWord[] {
  return words.map((word, i) => ({
    word,
    start: startAt + i * 0.4,
    end: startAt + i * 0.4 + 0.3,
    confidence: 0.99,
  }));
}

// ── Scenario 1: the reported bug ────────────────────────────────────────────
// Passage repeats "construction". Student reads up to the FIRST one and stops.
// The remainder (a whole "paragraph") is never voiced, then "construction" recurs.
console.log("Scenario 1: student stops on the first of a repeated word");
{
  const passage = [
    "the", "bridge", "was", "planned", "for", "years", "but", "the", "chief",
    "engineer", "died", "from", "an", "accident", "before", "construction", // idx 15 — real stop
    "could", "begin", "the", "town", "waited", "a", "long", "decade", "while",
    "money", "was", "slowly", "raised", "again", "and", "at", "last",
    "construction", // idx 33 — the decoy recurrence
    "of", "the", "span", "finally", "started",
  ];
  const read = passage.slice(0, 16); // through the first "construction"
  const { events } = alignWords(passage, spoken(read));

  const stop = getLastReachedIndex(events);
  check(
    "stop point is the FIRST construction (idx 15), not the decoy (idx 33)",
    stop === 15,
    `got ${stop}`
  );

  const firstConstruction = events.find((e) => e.word_index === 15);
  check(
    "first construction is scored as read (voiced + correct)",
    firstConstruction?.event_type === "correct" && firstConstruction?.spoken_word != null,
    `got ${firstConstruction?.event_type}`
  );

  // 16 words read in a 30s sample → nothing past the stop should count as an error.
  const metrics = calculateMetrics(events, 30);
  check(
    "no not-reached words are counted (attempted === reached count)",
    metrics.total_words_attempted === 16,
    `attempted ${metrics.total_words_attempted}`
  );
  check("accuracy is 100% (clean read of the prefix)", metrics.accuracy_percent === 100,
    `got ${metrics.accuracy_percent}`);
}

// ── Scenario 2: genuine mid-passage skip must STILL count as omissions ───────
// Student skips a line but keeps reading a long contiguous run afterward.
console.log("Scenario 2: genuine skipped line keeps counting (not cut)");
{
  const passage: string[] = [];
  for (let n = 0; n < 60; n++) passage.push(`w${n}`);
  // Read 0..19, skip 20..33 (14 words), resume 34..59 — a substantial continued run.
  const read = [
    ...passage.slice(0, 20),
    ...passage.slice(34, 60),
  ];
  const { events } = alignWords(passage, spoken(read));
  const stop = getLastReachedIndex(events);
  check(
    "stop point is the true end (idx 59) — the skip is not treated as a stop",
    stop === 59,
    `got ${stop}`
  );
  const omissions = events.filter(
    (e) => e.word_index >= 20 && e.word_index <= 33 && e.event_type === "omission"
  ).length;
  check("the skipped line stays counted as omissions", omissions === 14, `got ${omissions}`);
}

// ── Scenario 3: normal timed run-out (no repeats) is unchanged ───────────────
console.log("Scenario 3: plain run-out cuts trailing never-voiced words");
{
  const passage: string[] = [];
  for (let n = 0; n < 50; n++) passage.push(`word${n}`);
  const read = passage.slice(0, 30); // ran out of time at idx 29
  const { events } = alignWords(passage, spoken(read));
  const stop = getLastReachedIndex(events);
  check("stop point is the last voiced word (idx 29)", stop === 29, `got ${stop}`);
}

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All stop-point checks passed.");
