import { test } from "node:test";
import assert from "node:assert/strict";
import { getLastReachedIndex, calculateMetrics } from "./metrics";
import { SessionEvent, EventType } from "./types";

// The score-time engine and the SQL override-recompute (recalculate_session_metrics,
// tested in supabase/tests/recompute_metrics.test.sql) MUST agree on the same read —
// a divergence is exactly the class of bug migration 0017 fixed. The baseline fixture
// below is the same 10-word read as SQL scenario S1, and asserts the same numbers
// (correct=5, total=7, wcpm=5, acc=71). Those shared expected values ARE the parity
// contract: change the counting on either side and one suite breaks.

function ev(
  word_index: number,
  event_type: EventType,
  spoken_word: string | null
): SessionEvent {
  return {
    word_index,
    expected_word: `w${word_index}`,
    spoken_word,
    start_timestamp_ms: spoken_word === null ? null : word_index * 100,
    end_timestamp_ms: spoken_word === null ? null : word_index * 100 + 50,
    event_type,
    confidence_score: null,
  };
}

// Same read as SQL S1: voiced 0-4 and 6; 5 is a mid-passage skip; 7-9 never reached.
const BASE: SessionEvent[] = [
  ev(0, "correct", "the"),
  ev(1, "correct", "quick"),
  ev(2, "substitution", "braun"),
  ev(3, "correct", "fox"),
  ev(4, "self_correction", "jumps"),
  ev(5, "omission", null),
  ev(6, "correct", "dog"),
  ev(7, "omission", null),
  ev(8, "omission", null),
  ev(9, "omission", null),
];

test("getLastReachedIndex: cutoff is the last voiced word, not the passage end", () => {
  assert.equal(getLastReachedIndex(BASE), 6);
});

test("getLastReachedIndex: a small mid-passage skip stays inside the read", () => {
  // gap of 2 (< NOT_REACHED_GAP_THRESHOLD) then keeps reading -> real skip, last voiced = 8
  const events = [
    ev(0, "correct", "a"),
    ev(1, "correct", "b"),
    ev(2, "omission", null),
    ev(3, "omission", null),
    ev(4, "correct", "e"),
    ev(5, "correct", "f"),
    ev(6, "correct", "g"),
    ev(7, "correct", "h"),
    ev(8, "correct", "i"),
  ];
  assert.equal(getLastReachedIndex(events), 8);
});

test("getLastReachedIndex: large silent gap + sparse stray tail cuts at the leading read", () => {
  // Student really stopped at index 3; the aligner mis-attached one stray match at 20.
  const events = [
    ev(0, "correct", "a"),
    ev(1, "correct", "b"),
    ev(2, "correct", "c"),
    ev(3, "correct", "d"),
    ev(20, "correct", "stray"), // gap of 16 >= 12, only 1 word after -> stray tail
  ];
  assert.equal(getLastReachedIndex(events), 3);
});

test("getLastReachedIndex: large gap but substantial continued reading is a real skip", () => {
  // gap of 14 then FOUR more voiced words (> NOT_REACHED_TAIL_TOLERANCE) -> not a stray tail
  const events = [
    ev(0, "correct", "a"),
    ev(1, "correct", "b"),
    ev(16, "correct", "c"),
    ev(17, "correct", "d"),
    ev(18, "correct", "e"),
    ev(19, "correct", "f"),
  ];
  assert.equal(getLastReachedIndex(events), 19);
});

test("getLastReachedIndex: nothing voiced returns -1", () => {
  assert.equal(getLastReachedIndex([ev(0, "omission", null), ev(1, "omission", null)]), -1);
});

test("calculateMetrics: baseline parity with SQL recompute S1", () => {
  const m = calculateMetrics(BASE, 60);
  assert.equal(m.correct_words, 5);
  assert.equal(m.total_words_attempted, 7); // 7-9 excluded as not-reached
  assert.equal(m.wcpm, 5);
  assert.equal(m.accuracy_percent, 71);
});

test("calculateMetrics: WCPM is a rate — a 30s sample doubles it (parity with SQL S9)", () => {
  const m = calculateMetrics(BASE, 30);
  assert.equal(m.wcpm, 10);
  assert.equal(m.accuracy_percent, 71); // accuracy is duration-independent
});

test("calculateMetrics: self_correction counts as correct (Hasbrouck-Tindal)", () => {
  const events = [ev(0, "correct", "a"), ev(1, "self_correction", "b"), ev(2, "substitution", "x")];
  const m = calculateMetrics(events, 60);
  assert.equal(m.correct_words, 2); // correct + self_correction
  assert.equal(m.total_words_attempted, 3);
});

test("calculateMetrics: insertions are never counted as attempted words", () => {
  const events = [ev(0, "correct", "a"), ev(1, "insertion", "extra"), ev(2, "correct", "c")];
  const m = calculateMetrics(events, 60);
  assert.equal(m.total_words_attempted, 2);
  assert.equal(m.correct_words, 2);
});

test("calculateMetrics: nothing attempted returns zeros, not NaN", () => {
  const m = calculateMetrics([ev(0, "omission", null)], 60);
  assert.equal(m.wcpm, 0);
  assert.equal(m.accuracy_percent, 0);
  assert.equal(m.correct_words, 0);
  assert.equal(m.total_words_attempted, 0);
});
