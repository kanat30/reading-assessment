-- Student grade for norm banding (DECISIONS 2026-07-26, D1).
--
-- Policy: passages are routed by reading level, but benchmark banding and
-- percentiles use the STUDENT'S grade + assessment period against the
-- Hasbrouck-Tindal tables (H-T norms are grade norms; expert validators
-- hand-score by student grade). The grade is captured at assessment creation
-- (teacher picks 4-8); sessions scored under assessments without it fall back
-- to estimating a grade from passage level, labeled as such on every surface.
--
-- Nullable: existing assessments predate the field, and the legacy-passage
-- flow may not set it.
--
-- Multi-tenancy / RLS:
--   * assessments already carries school-scoped RLS (0002); a new column
--     inherits the row policies. The self-verification below re-asserts from
--     the LIVE catalog (not from assumptions about migration history) that
--     RLS is still enabled and every write path is still school-scoped, and
--     aborts the migration atomically if not.
--   * Read exposure: 0002's "anyone can read assessments" SELECT policy is
--     `using (true)` (the student flow reads the row by share_token with the
--     anon key), so student_grade — like class_label and reading_level today —
--     is readable through the anon role. It is class-level metadata (a single
--     4-8 integer), not student PII. The verification NOTICEs this exposure so
--     it stays visible at every apply; tightening the anon-read surface itself
--     (moving the student read server-side, as GET /api/comprehension did for
--     sessions in 0020) is tracked separately and NOT silently changed here.

alter table assessments
  add column if not exists student_grade smallint
  constraint assessments_student_grade_range
  check (student_grade is null or student_grade between 4 and 8);

comment on column assessments.student_grade is
  'Grade level of the students being assessed (4-8), chosen by the teacher at creation. Drives Hasbrouck-Tindal norm selection (banding by student grade, not passage level). Null = legacy assessment; norms fall back to passage-level estimation, labeled on reports.';

-- ── Self-verification against the live catalog ─────────────────────────────
-- Runs at apply time inside the migration's transaction: any failure aborts
-- and rolls back the whole migration (column included).
DO $$
DECLARE
  v_type     text;
  v_condef   text;
  v_rls      boolean;
  v_count    int;
  v_policies int;
BEGIN
  -- (1) The column landed with the right type and range constraint.
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.assessments'::regclass
    AND a.attname = 'student_grade' AND NOT a.attisdropped;
  IF v_type IS DISTINCT FROM 'smallint' THEN
    RAISE EXCEPTION 'Aborting: assessments.student_grade missing or wrong type (%)', v_type;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_condef
  FROM pg_constraint
  WHERE conrelid = 'public.assessments'::regclass
    AND conname = 'assessments_student_grade_range';
  IF v_condef IS NULL OR v_condef NOT ILIKE '%student_grade%' THEN
    RAISE EXCEPTION 'Aborting: assessments_student_grade_range CHECK constraint missing';
  END IF;

  -- (2) RLS must still be enabled on assessments.
  SELECT relrowsecurity INTO v_rls FROM pg_class
  WHERE oid = 'public.assessments'::regclass;
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'Aborting: row-level security is not enabled on public.assessments';
  END IF;

  -- (3) Write-path tenancy, read from the live policy catalog. UNCONDITIONAL:
  --     zero policies on assessments is indistinguishable from someone having
  --     dropped them, so it aborts rather than being skipped as a "test
  --     schema" (this migration only applies to production or to the harness
  --     in supabase/tests/_override_setup.sql, which stands up the real
  --     policies). Every INSERT/UPDATE/DELETE policy must be school-scoped:
  --     none may be wide-open (bare 'true'), and at least one must reference
  --     the school helper — a cross-tenant write hole here would let a
  --     teacher stamp another school's assessments with a grade.
  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'assessments'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND COALESCE(NULLIF(regexp_replace(COALESCE(with_check, qual, ''), '[\s()]', '', 'g'), ''), 'true') = 'true';
  IF v_count > 0 THEN
    RAISE EXCEPTION 'Aborting: % wide-open (USING/WITH CHECK true) write policy(ies) on assessments', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'assessments'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND (COALESCE(qual, '') ILIKE '%current_teacher_school_id%'
      OR COALESCE(with_check, '') ILIKE '%current_teacher_school_id%');
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Aborting: no school-scoped write policy found on assessments (current_teacher_school_id)';
  END IF;

  -- (4) Keep the pre-existing anon-read exposure visible at every apply.
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assessments'
      AND cmd = 'SELECT'
      AND COALESCE(NULLIF(regexp_replace(COALESCE(qual, ''), '[\s()]', '', 'g'), ''), 'true') = 'true'
  ) THEN
    RAISE NOTICE 'Note: assessments still has an open SELECT policy (0002, student-flow-by-share_token) — student_grade is anon-readable class metadata under it. Tightening that read surface is tracked separately.';
  END IF;

  RAISE NOTICE 'Tenancy verified: student_grade added; RLS on; assessments write policies are school-scoped.';
END $$;
