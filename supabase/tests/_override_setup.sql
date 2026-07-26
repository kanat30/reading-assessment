-- Minimal-but-faithful schema for the apply_session_override / migrations
-- 0023-0025 harness. The suite loads the REAL migration files verbatim (no
-- re-implementation), so this file must stand up exactly what those
-- migrations and their self-verification blocks touch:
--
--   * Supabase roles (anon / authenticated / service_role)
--   * an auth.uid() stub driven by the 'test.uid' GUC, so each scenario can
--     impersonate a different teacher
--   * the real current_teacher_school_id() helper (0001) over a real
--     teachers table
--   * assessments / sessions / session_overrides / comprehension_answers
--     with RLS ENABLED and the production policies they carry on live
--     (0002 assessments incl. the open student-flow SELECT; 0008
--     session_overrides; 0004 comprehension_answers teacher read), so the
--     migrations' catalog-driven tenancy checks run their FULL path — the
--     same assertions a real `db push` executes.
--
-- Runs against a throwaway cluster created by scripts/test-migrations.sh —
-- never a real database.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- auth.uid() stub: each test scenario sets `SET test.uid = '<uuid>'`.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('test.uid', true), '')::uuid
$$;

-- ── tables (columns limited to what the functions/migrations touch) ────────

CREATE TABLE teachers (
  id               uuid PRIMARY KEY,
  school_id        uuid NOT NULL,
  auth_provider_id uuid
);

CREATE TABLE assessments (
  id        uuid PRIMARY KEY,
  school_id uuid NOT NULL
);

CREATE TABLE sessions (
  id                    uuid PRIMARY KEY,
  assessment_id         uuid NOT NULL REFERENCES assessments(id),
  scores_json           jsonb,
  teacher_review_status text NOT NULL DEFAULT 'unreviewed'
);

CREATE TABLE session_overrides (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid NOT NULL REFERENCES sessions(id),
  teacher_id     uuid NOT NULL REFERENCES teachers(id),
  field_name     text NOT NULL,
  original_value jsonb,
  new_value      jsonb,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- comprehension_answers as it exists pre-0025: status CHECK from 0013 with
-- the three original states, so 0025's catalog-driven discovery/drop path is
-- exercised for real.
CREATE TABLE comprehension_answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES sessions(id),
  question_id uuid NOT NULL,
  is_correct  boolean,
  status      text,
  CONSTRAINT comprehension_answers_status_check
    CHECK (status IS NULL OR status IN ('correct', 'partial', 'incorrect'))
);

-- Real helper from 0001 (SECURITY DEFINER, reads teachers by auth.uid()).
CREATE OR REPLACE FUNCTION current_teacher_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT school_id FROM teachers WHERE auth_provider_id = auth.uid()
$$;

-- ── RLS + the production policies the migrations' guards assert ────────────

ALTER TABLE teachers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_overrides     ENABLE ROW LEVEL SECURITY;
ALTER TABLE comprehension_answers ENABLE ROW LEVEL SECURITY;

-- assessments (0002): open student-flow read + school-scoped writes.
CREATE POLICY "anyone can read assessments" ON assessments
  FOR SELECT USING (true);
CREATE POLICY "teachers can insert school assessments" ON assessments
  FOR INSERT WITH CHECK (school_id = current_teacher_school_id());
CREATE POLICY "teachers can update school assessments" ON assessments
  FOR UPDATE USING (school_id = current_teacher_school_id());
CREATE POLICY "teachers can delete school assessments" ON assessments
  FOR DELETE USING (school_id = current_teacher_school_id());

-- session_overrides (0008): school-scoped read + insert.
CREATE POLICY "teachers can read overrides for sessions in their school" ON session_overrides
  FOR SELECT USING (
    session_id IN (
      SELECT s.id FROM sessions s
      JOIN assessments a ON s.assessment_id = a.id
      WHERE a.school_id = current_teacher_school_id()
    )
  );
CREATE POLICY "teachers can insert overrides for sessions in their school" ON session_overrides
  FOR INSERT WITH CHECK (
    teacher_id = (SELECT id FROM teachers WHERE auth_provider_id = auth.uid())
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN assessments a ON s.assessment_id = a.id
      WHERE a.school_id = current_teacher_school_id()
    )
  );

-- comprehension_answers (0004, post-0020: teacher-only read).
CREATE POLICY "comprehension_answers_teacher_read" ON comprehension_answers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      JOIN assessments a ON s.assessment_id = a.id
      WHERE s.id = comprehension_answers.session_id
      AND a.school_id = current_teacher_school_id()
    )
  );
