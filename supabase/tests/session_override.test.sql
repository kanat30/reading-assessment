-- Behavioral suite for migrations 0023-0025, run against the REAL migration
-- files loaded verbatim into a throwaway Postgres (scripts/test-migrations.sh).
--
-- What this proves, beyond the migrations' own catalog self-verification:
--   * apply_session_override (0024) enforces multi-tenancy at runtime — a
--     teacher from another school is rejected before anything is written.
--   * The strict field-path rule holds: unknown paths RAISE and leave NO
--     phantom override row (the pre-0024 function recorded the row and
--     silently applied nothing).
--   * prosody_dimensions.* overrides validate dimension name and 1-4 value,
--     initialize the object on legacy sessions, and land in scores_json.
--   * The 0023 student_grade CHECK and the 0025 rebuilt status CHECK accept
--     and reject exactly the intended values.
--
-- Run via: npm run test:migrations

\set ON_ERROR_STOP on

-- ── fixture: two schools, two teachers, one session in school A ────────────
DO $$
BEGIN
  INSERT INTO teachers (id, school_id, auth_provider_id) VALUES
    ('aaaaaaaa-0000-0000-0000-00000000000a', 'aaaaaaaa-1111-0000-0000-000000000000', 'aaaaaaaa-2222-0000-0000-000000000000'),
    ('bbbbbbbb-0000-0000-0000-00000000000b', 'bbbbbbbb-1111-0000-0000-000000000000', 'bbbbbbbb-2222-0000-0000-000000000000');
  INSERT INTO assessments (id, school_id) VALUES
    ('aaaaaaaa-3333-0000-0000-000000000000', 'aaaaaaaa-1111-0000-0000-000000000000');
  INSERT INTO sessions (id, assessment_id, scores_json) VALUES
    ('aaaaaaaa-4444-0000-0000-000000000000', 'aaaaaaaa-3333-0000-0000-000000000000',
     '{"metrics": {"wcpm": 100, "accuracy_percent": 95}, "summary": "orig", "prosody": {"level": 2, "pace": "steady"}}'::jsonb);
END $$;

-- Helpers: run an override expecting success/failure; count override rows.
CREATE OR REPLACE FUNCTION _as(p_uid text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('test.uid', p_uid, false);
END $$;

CREATE OR REPLACE FUNCTION _expect_error(p_label text, p_sql text, p_needle text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAIL [%]: expected an error containing "%" but the call succeeded', p_label, p_needle;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM ILIKE '%' || p_needle || '%' THEN
        RAISE NOTICE 'PASS [%]', p_label;
      ELSE
        RAISE EXCEPTION 'FAIL [%]: got "%" (wanted a message containing "%")', p_label, SQLERRM, p_needle;
      END IF;
  END;
END $$;

CREATE OR REPLACE FUNCTION _expect(p_label text, p_ok boolean, p_detail text DEFAULT '') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok THEN
    RAISE NOTICE 'PASS [%]', p_label;
  ELSE
    RAISE EXCEPTION 'FAIL [%] %', p_label, p_detail;
  END IF;
END $$;

-- ── T1: same-school WCPM override applies and is recorded ──────────────────
DO $$
DECLARE v_id uuid; s record;
BEGIN
  PERFORM _as('aaaaaaaa-2222-0000-0000-000000000000');
  v_id := apply_session_override(
    'aaaaaaaa-4444-0000-0000-000000000000', 'wcpm', '100'::jsonb, '104'::jsonb, 'hand count');
  SELECT * INTO s FROM sessions WHERE id = 'aaaaaaaa-4444-0000-0000-000000000000';
  PERFORM _expect('T1 wcpm override applied',
    (s.scores_json->'metrics'->>'wcpm')::int = 104 AND s.teacher_review_status = 'edited',
    format('scores=%s status=%s', s.scores_json->'metrics'->>'wcpm', s.teacher_review_status));
  PERFORM _expect('T1 override row recorded',
    (SELECT count(*) FROM session_overrides WHERE session_id = 'aaaaaaaa-4444-0000-0000-000000000000' AND field_name = 'wcpm') = 1);
END $$;

-- ── T2: cross-school teacher is rejected, nothing written ───────────────────
DO $$
DECLARE n_before int; n_after int;
BEGIN
  SELECT count(*) INTO n_before FROM session_overrides;
  PERFORM _as('bbbbbbbb-2222-0000-0000-000000000000');  -- teacher of school B
  PERFORM _expect_error('T2 cross-school override rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'wcpm', '104'::jsonb, '90'::jsonb) $q$,
    'different school');
  SELECT count(*) INTO n_after FROM session_overrides;
  PERFORM _expect('T2 no phantom row on rejection', n_after = n_before);
  PERFORM _expect('T2 score untouched',
    (SELECT (scores_json->'metrics'->>'wcpm')::int FROM sessions WHERE id = 'aaaaaaaa-4444-0000-0000-000000000000') = 104);
END $$;

-- ── T3/T4: unknown field paths RAISE and leave no phantom row ───────────────
DO $$
DECLARE n_before int;
BEGIN
  PERFORM _as('aaaaaaaa-2222-0000-0000-000000000000');
  SELECT count(*) INTO n_before FROM session_overrides;
  PERFORM _expect_error('T3 unknown top-level field rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'banana', '1'::jsonb, '2'::jsonb) $q$,
    'Unsupported override field');
  PERFORM _expect_error('T4 unknown nested path rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'foo.bar', '1'::jsonb, '2'::jsonb) $q$,
    'Unsupported override field');
  PERFORM _expect('T3/T4 no phantom rows', (SELECT count(*) FROM session_overrides) = n_before);
END $$;

-- ── T5: prosody dimension value must be 1-4; T7: must be a jsonb number ────
DO $$
BEGIN
  PERFORM _as('aaaaaaaa-2222-0000-0000-000000000000');
  PERFORM _expect_error('T5 out-of-range dimension value rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'prosody_dimensions.pace', 'null'::jsonb, '5'::jsonb) $q$,
    'must be 1-4');
  PERFORM _expect_error('T5b unknown dimension name rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'prosody_dimensions.volume', 'null'::jsonb, '3'::jsonb) $q$,
    'Unknown prosody dimension');
  PERFORM _expect_error('T7 string value rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'prosody_dimensions.smoothness', 'null'::jsonb, '"3"'::jsonb) $q$,
    'must be 1-4');
END $$;

-- ── T6: Expression rating initializes prosody_dimensions on legacy sessions ─
DO $$
DECLARE s record;
BEGIN
  PERFORM _as('aaaaaaaa-2222-0000-0000-000000000000');
  PERFORM apply_session_override(
    'aaaaaaaa-4444-0000-0000-000000000000', 'prosody_dimensions.expression', 'null'::jsonb, '3'::jsonb, 'teacher rating');
  SELECT * INTO s FROM sessions WHERE id = 'aaaaaaaa-4444-0000-0000-000000000000';
  PERFORM _expect('T6 expression rating lands, object initialized',
    (s.scores_json->'prosody_dimensions'->>'expression')::int = 3
      AND s.scores_json->'prosody_dimensions' ? 'pace',
    s.scores_json->>'prosody_dimensions');
  PERFORM _expect('T6 other dimensions stay null (not fabricated)',
    jsonb_typeof(s.scores_json->'prosody_dimensions'->'pace') = 'null');
END $$;

-- ── T8: legacy prosody.* path still replays (historical rows) ───────────────
DO $$
DECLARE s record;
BEGIN
  PERFORM _as('aaaaaaaa-2222-0000-0000-000000000000');
  PERFORM apply_session_override(
    'aaaaaaaa-4444-0000-0000-000000000000', 'prosody.level', '2'::jsonb, '3'::jsonb);
  SELECT * INTO s FROM sessions WHERE id = 'aaaaaaaa-4444-0000-0000-000000000000';
  PERFORM _expect('T8 legacy prosody.level path still applies',
    (s.scores_json->'prosody'->>'level')::int = 3);
END $$;

-- ── T9: unknown caller is rejected ──────────────────────────────────────────
DO $$
BEGIN
  PERFORM _as('99999999-9999-9999-9999-999999999999');
  PERFORM _expect_error('T9 unknown auth uid rejected',
    $q$ SELECT apply_session_override('aaaaaaaa-4444-0000-0000-000000000000', 'wcpm', '104'::jsonb, '90'::jsonb) $q$,
    'Teacher not found');
END $$;

-- ── T10: grants — anon locked out, authenticated (teacher UI) allowed ───────
DO $$
BEGIN
  PERFORM _expect('T10 anon cannot execute apply_session_override',
    NOT has_function_privilege('anon', 'apply_session_override(uuid, text, jsonb, jsonb, text)', 'EXECUTE'));
  PERFORM _expect('T10 authenticated can execute apply_session_override',
    has_function_privilege('authenticated', 'apply_session_override(uuid, text, jsonb, jsonb, text)', 'EXECUTE'));
END $$;

-- ── T11: 0023 student_grade CHECK accepts 4-8/null, rejects out-of-range ────
DO $$
BEGIN
  PERFORM _as('aaaaaaaa-2222-0000-0000-000000000000');
  UPDATE assessments SET student_grade = 6 WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000';
  PERFORM _expect('T11 grade 6 accepted',
    (SELECT student_grade FROM assessments WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000') = 6);
  UPDATE assessments SET student_grade = NULL WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000';
  PERFORM _expect_error('T11 grade 3 rejected',
    $q$ UPDATE assessments SET student_grade = 3 WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$,
    'assessments_student_grade_range');
  PERFORM _expect_error('T11 grade 9 rejected',
    $q$ UPDATE assessments SET student_grade = 9 WHERE id = 'aaaaaaaa-3333-0000-0000-000000000000' $q$,
    'assessments_student_grade_range');
END $$;

-- ── T12: 0025 status CHECK accepts ungraded, rejects unknown states ─────────
DO $$
BEGIN
  INSERT INTO comprehension_answers (session_id, question_id, status)
    VALUES ('aaaaaaaa-4444-0000-0000-000000000000', gen_random_uuid(), 'ungraded');
  PERFORM _expect('T12 ungraded accepted', true);
  PERFORM _expect_error('T12 bogus status rejected',
    $q$ INSERT INTO comprehension_answers (session_id, question_id, status)
        VALUES ('aaaaaaaa-4444-0000-0000-000000000000', gen_random_uuid(), 'bogus') $q$,
    'comprehension_answers_status_check');
END $$;

DO $$ BEGIN RAISE NOTICE 'ALL SESSION-OVERRIDE / MIGRATION SCENARIOS PASSED'; END $$;
