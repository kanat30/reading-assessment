-- Allow the explicit 'ungraded' comprehension status (DECISIONS 2026-07-26).
--
-- When AI grading fails, answers are now stored as 'ungraded' instead of
-- 'incorrect' — an AI outage must read as "needs manual review", never as a
-- student who failed comprehension. The 0013 CHECK constraint predates this
-- state; replace it.
--
-- Catalog-driven (0020 convention): the existing status CHECK is discovered
-- from pg_constraint at apply time rather than dropped by an assumed name, so
-- the migration works against the database as it actually is (renamed or
-- system-named constraints included) and cannot silently leave a stale
-- constraint behind. RLS/tenancy on comprehension_answers is untouched and
-- re-asserted below.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.comprehension_answers'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE comprehension_answers DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'Dropped prior status CHECK constraint: %', c.conname;
  END LOOP;
END $$;

alter table comprehension_answers
  add constraint comprehension_answers_status_check
  check (status is null or status in ('correct', 'partial', 'incorrect', 'ungraded'));

-- ── Self-verification against the live catalog ─────────────────────────────
DO $$
DECLARE
  v_def    text;
  v_rls    boolean;
  v_count  int;
BEGIN
  -- (1) Exactly one status CHECK remains, and it admits all four states.
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.comprehension_answers'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF v_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Aborting: expected exactly 1 status CHECK on comprehension_answers, found %', v_count;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.comprehension_answers'::regclass
    AND conname = 'comprehension_answers_status_check';
  IF v_def IS NULL
     OR v_def NOT ILIKE '%correct%'
     OR v_def NOT ILIKE '%partial%'
     OR v_def NOT ILIKE '%incorrect%'
     OR v_def NOT ILIKE '%ungraded%' THEN
    RAISE EXCEPTION 'Aborting: rebuilt status CHECK is missing a required state (got: %)', v_def;
  END IF;

  -- (2) RLS stays enabled; the teacher read path must still be school-scoped
  --     and no anon read policy may have crept back (0020 removed them).
  SELECT relrowsecurity INTO v_rls FROM pg_class
  WHERE oid = 'public.comprehension_answers'::regclass;
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'Aborting: row-level security is not enabled on public.comprehension_answers';
  END IF;

  -- UNCONDITIONAL (no "test schema" skip): zero policies is indistinguishable
  -- from a drop; the harness (supabase/tests/_override_setup.sql) stands up
  -- the real 0004/0020-shaped policies, and production must have them.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'comprehension_answers'
      AND cmd = 'SELECT'
      AND COALESCE(qual, '') ILIKE '%current_teacher_school_id%'
  ) THEN
    RAISE EXCEPTION 'Aborting: comprehension_answers lost its school-scoped teacher SELECT policy';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'comprehension_answers'
      AND cmd = 'SELECT'
      AND (roles::text ILIKE '%anon%'
        OR COALESCE(NULLIF(regexp_replace(COALESCE(qual, ''), '[\s()]', '', 'g'), ''), 'true') = 'true')
  ) THEN
    RAISE EXCEPTION 'Aborting: an anonymous/open SELECT policy is back on comprehension_answers (0020 regression)';
  END IF;
  RAISE NOTICE 'Verified: status CHECK rebuilt with ungraded; RLS on; teacher-only school-scoped read intact.';
END $$;
