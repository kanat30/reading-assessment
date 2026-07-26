-- Test suite for recalculate_session_metrics (the word-level override recompute).
--
-- This is the trust linchpin of FluencyScope: when a teacher approves/rejects/flags
-- an AI-flagged word, this function recomputes WCPM, accuracy, and correct/total from
-- the events + overrides, and the report's benchmark band is re-derived from the new
-- WCPM. Every past bug here (migrations 0017, 0019) silently mis-scored a student the
-- moment a teacher touched a correction — the exact flow meant to build trust.
--
-- The suite runs the REAL function loaded from migration 0019, not a re-implementation.
-- Fixtures use duration_seconds = 60 so WCPM == correct_words (readability); one
-- scenario overrides the duration to prove the rate math.
--
-- Scope: this covers the arithmetic core (recalculate_session_metrics). The tenancy /
-- school-check that wraps it (apply_event_override, auth.uid()) is a separate concern
-- covered by the migration's own self-verification, not this suite.
--
-- Run via: npm run test:recompute  (scripts/test-recompute.sh spins up a throwaway PG).

\set ON_ERROR_STOP on

-- ── helpers ──────────────────────────────────────────────────────────────────

-- Seed the standard 10-word fixture. The student voiced words 0-4 and 6; word 5 is
-- a genuine mid-passage skip (omission, not voiced); words 7-9 were never reached
-- (the 60s sample ran out). So the reached cutoff is index 6.
--   baseline correct = {0,1,3,4,6} = 5   (2 is a substitution, 5 an omission)
--   baseline total   = indices 0..6      = 7   (7,8,9 excluded as not-reached)
CREATE OR REPLACE FUNCTION _seed_base(p_session uuid, p_duration real) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO sessions(id, duration_seconds, scores_json, teacher_review_status)
    VALUES (p_session, p_duration,
            '{"metrics":{"wcpm":0,"accuracy_percent":0,"correct_words":0,"total_words_attempted":0}}'::jsonb,
            'unreviewed');
  INSERT INTO session_events(session_id, word_index, event_type, spoken_word) VALUES
    (p_session, 0, 'correct',         'the'),
    (p_session, 1, 'correct',         'quick'),
    (p_session, 2, 'substitution',    'braun'),   -- AI-flagged error, voiced
    (p_session, 3, 'correct',         'fox'),
    (p_session, 4, 'self_correction', 'jumps'),   -- counts as correct (Hasbrouck-Tindal)
    (p_session, 5, 'omission',        NULL),       -- mid-passage skip, before cutoff
    (p_session, 6, 'correct',         'dog'),      -- last voiced word -> reached cutoff
    (p_session, 7, 'omission',        NULL),       -- not reached
    (p_session, 8, 'omission',        NULL),       -- not reached
    (p_session, 9, 'omission',        NULL);       -- not reached
END $$;

-- Call recalculate_session_metrics and assert its four returned metrics.
CREATE OR REPLACE FUNCTION _assert(
  p_session uuid, p_label text,
  p_wcpm int, p_acc int, p_correct int, p_total int
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := recalculate_session_metrics(p_session);
  IF (r->>'wcpm')::int                  IS DISTINCT FROM p_wcpm
  OR (r->>'accuracy_percent')::int      IS DISTINCT FROM p_acc
  OR (r->>'correct_words')::int         IS DISTINCT FROM p_correct
  OR (r->>'total_words_attempted')::int IS DISTINCT FROM p_total THEN
    RAISE EXCEPTION E'FAIL [%]\n     got  wcpm=%  acc=%  correct=%  total=%\n     want wcpm=%  acc=%  correct=%  total=%',
      p_label,
      r->>'wcpm', r->>'accuracy_percent', r->>'correct_words', r->>'total_words_attempted',
      p_wcpm, p_acc, p_correct, p_total;
  END IF;
  RAISE NOTICE 'PASS [%]  wcpm=% acc=% correct=% total=%', p_label, p_wcpm, p_acc, p_correct, p_total;
END $$;

-- ── scenarios ────────────────────────────────────────────────────────────────
-- Each scenario uses its own session UUID so they are fully independent.

-- S1  Baseline, no overrides. Guards the 0019 not-reached cutoff: without it total
--     would be 10 and accuracy 5/10 = 50%. Asserting total=7 / acc=71 locks the cutoff.
SELECT _seed_base('00000000-0000-0000-0000-000000000001', 60);
SELECT _assert('00000000-0000-0000-0000-000000000001', 'S1 baseline / cutoff',
               5, 71, 5, 7);

-- S2  Reject an AI-flagged error (teacher: "index 2 was actually fine"). It flips to
--     correct. Guards the "error + reject -> correct" branch.
SELECT _seed_base('00000000-0000-0000-0000-000000000002', 60);
INSERT INTO session_event_overrides(session_id, word_index, action) VALUES
  ('00000000-0000-0000-0000-000000000002', 2, 'reject');
SELECT _assert('00000000-0000-0000-0000-000000000002', 'S2 reject error -> correct',
               6, 86, 6, 7);

-- S3  flag_error reclassifying the mid-passage omission (index 5) AS a self_correction.
--     Guards the "flag_error + new_event_type=self_correction -> correct" branch.
SELECT _seed_base('00000000-0000-0000-0000-000000000003', 60);
INSERT INTO session_event_overrides(session_id, word_index, action, new_event_type) VALUES
  ('00000000-0000-0000-0000-000000000003', 5, 'flag_error', 'self_correction');
SELECT _assert('00000000-0000-0000-0000-000000000003', 'S3 flag_error -> self_correction',
               6, 86, 6, 7);

-- S4  flag_error demoting a previously-correct word (index 0) to a real error
--     (substitution). A flag_error whose new type is NOT self_correction must drop the
--     word from the correct count. Guards against flag_error being treated as approve.
SELECT _seed_base('00000000-0000-0000-0000-000000000004', 60);
INSERT INTO session_event_overrides(session_id, word_index, action, new_event_type) VALUES
  ('00000000-0000-0000-0000-000000000004', 0, 'flag_error', 'substitution');
SELECT _assert('00000000-0000-0000-0000-000000000004', 'S4 flag_error correct -> error',
               4, 57, 4, 7);

-- S5  approve is a no-op (teacher confirms the AI). Approving the error at index 2
--     keeps it an error; the count must not change from baseline.
SELECT _seed_base('00000000-0000-0000-0000-000000000005', 60);
INSERT INTO session_event_overrides(session_id, word_index, action) VALUES
  ('00000000-0000-0000-0000-000000000005', 2, 'approve');
SELECT _assert('00000000-0000-0000-0000-000000000005', 'S5 approve error = no-op',
               5, 71, 5, 7);

-- S6  Latest-override-wins. Two overrides on the same word (reject, then a later
--     approve). The function must take the most recent (approve) -> index 2 stays an
--     error -> correct=5. If it took the older reject, correct would be 6. Guards the
--     0017 "most recent override per word" fix (and the per-teacher double-count bug).
SELECT _seed_base('00000000-0000-0000-0000-000000000006', 60);
INSERT INTO session_event_overrides(session_id, word_index, action, created_at) VALUES
  ('00000000-0000-0000-0000-000000000006', 2, 'reject',  now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000006', 2, 'approve', now());
SELECT _assert('00000000-0000-0000-0000-000000000006', 'S6 latest override wins',
               5, 71, 5, 7);

-- S7  Override on a never-reached word (index 8) is ignored — the cutoff dominates, so
--     a teacher cannot resurrect a not-reached word into the denominator. Unchanged.
SELECT _seed_base('00000000-0000-0000-0000-000000000007', 60);
INSERT INTO session_event_overrides(session_id, word_index, action) VALUES
  ('00000000-0000-0000-0000-000000000007', 8, 'reject');
SELECT _assert('00000000-0000-0000-0000-000000000007', 'S7 override past cutoff ignored',
               5, 71, 5, 7);

-- S8  Nothing voiced at all (every word an omission). Reached cutoff = -1, so total=0
--     and the divide-by-zero guards return zeros rather than NaN or the whole passage.
INSERT INTO sessions(id, duration_seconds, scores_json, teacher_review_status)
  VALUES ('00000000-0000-0000-0000-000000000008', 60, '{"metrics":{}}'::jsonb, 'unreviewed');
INSERT INTO session_events(session_id, word_index, event_type, spoken_word) VALUES
  ('00000000-0000-0000-0000-000000000008', 0, 'omission', NULL),
  ('00000000-0000-0000-0000-000000000008', 1, 'omission', NULL),
  ('00000000-0000-0000-0000-000000000008', 2, 'omission', NULL);
SELECT _assert('00000000-0000-0000-0000-000000000008', 'S8 nothing voiced -> zeros',
               0, 0, 0, 0);

-- S9  Rate math: same fixture but a 30s sample. correct=5 over 0.5 min -> WCPM 10.
--     Accuracy is duration-independent (still 71%). Proves WCPM is a real rate, not a
--     raw count that only looked right because S1 used exactly 60s.
SELECT _seed_base('00000000-0000-0000-0000-000000000009', 30);
SELECT _assert('00000000-0000-0000-0000-000000000009', 'S9 30s sample doubles WCPM',
               10, 71, 5, 7);

-- ── gap/tail cutoff parity with the score-time engine (migration 0022) ─────────
-- These mirror the getLastReachedIndex cases in lib/scoring/metrics.test.ts. Before
-- 0022 the SQL recompute used MAX(voiced) and would have counted the stray tail.

-- S10  Stray post-stop match: student really stopped at index 3, but a single voiced
--      word landed at index 20 (gap 16 >= 12, tail 1 <= 3). The cutoff must be 3, so the
--      stray word is excluded: total=4, correct=4. Under the old MAX cutoff this was
--      total=5 / wcpm=5. Asserting 4 proves the gap/tail trim.
INSERT INTO sessions(id, duration_seconds, scores_json, teacher_review_status)
  VALUES ('00000000-0000-0000-0000-000000000010', 60, '{"metrics":{}}'::jsonb, 'unreviewed');
INSERT INTO session_events(session_id, word_index, event_type, spoken_word) VALUES
  ('00000000-0000-0000-0000-000000000010', 0,  'correct', 'a'),
  ('00000000-0000-0000-0000-000000000010', 1,  'correct', 'b'),
  ('00000000-0000-0000-0000-000000000010', 2,  'correct', 'c'),
  ('00000000-0000-0000-0000-000000000010', 3,  'correct', 'd'),
  ('00000000-0000-0000-0000-000000000010', 20, 'correct', 'stray');
SELECT _assert('00000000-0000-0000-0000-000000000010', 'S10 stray tail trimmed (cutoff=3)',
               4, 100, 4, 4);

-- S11  Genuine mid-passage skip: a large gap (indices 2..15 omitted, gap 14 >= 12) but
--      then FOUR more voiced words (tail 4 > 3) — a real skip the student read past, NOT
--      a stray tail. Cutoff stays 19; the skipped omissions still count against accuracy.
--      total = 0,1 + omissions 2..15 + 16..19 = 20; correct = 6; acc = 30%.
INSERT INTO sessions(id, duration_seconds, scores_json, teacher_review_status)
  VALUES ('00000000-0000-0000-0000-000000000011', 60, '{"metrics":{}}'::jsonb, 'unreviewed');
INSERT INTO session_events(session_id, word_index, event_type, spoken_word) VALUES
  ('00000000-0000-0000-0000-000000000011', 0, 'correct', 'a'),
  ('00000000-0000-0000-0000-000000000011', 1, 'correct', 'b'),
  ('00000000-0000-0000-0000-000000000011', 16, 'correct', 'c'),
  ('00000000-0000-0000-0000-000000000011', 17, 'correct', 'd'),
  ('00000000-0000-0000-0000-000000000011', 18, 'correct', 'e'),
  ('00000000-0000-0000-0000-000000000011', 19, 'correct', 'f');
INSERT INTO session_events(session_id, word_index, event_type, spoken_word)
  SELECT '00000000-0000-0000-0000-000000000011', g, 'omission', NULL
  FROM generate_series(2, 15) AS g;
SELECT _assert('00000000-0000-0000-0000-000000000011', 'S11 real skip kept (cutoff=19)',
               6, 30, 6, 20);

DO $$ BEGIN RAISE NOTICE E'\n  All recompute scenarios passed.'; END $$;
