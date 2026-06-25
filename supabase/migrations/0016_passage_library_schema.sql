-- Passage Library Schema Migration
-- Adds reading level selection, multi-passage support, and benchmark period tracking
-- Follows multi-tenancy patterns from existing migrations

-- ============================================
-- 1. ADD COLUMNS TO ASSESSMENTS TABLE
-- ============================================

-- Reading level (3-7) for passage selection routing
-- Using DO block for idempotent column additions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessments' AND column_name = 'reading_level'
  ) THEN
    ALTER TABLE assessments
    ADD COLUMN reading_level INTEGER CHECK (reading_level BETWEEN 3 AND 7);
  END IF;
END $$;

-- Array of passage IDs from the library (e.g., ['L4-A-mars', 'L4-B-bridge', 'L4-C-wolves'])
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessments' AND column_name = 'passage_ids'
  ) THEN
    ALTER TABLE assessments
    ADD COLUMN passage_ids TEXT[] NOT NULL DEFAULT '{}';
  END IF;
END $$;

-- Assessment period for benchmark comparison (auto-detected from date)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessments' AND column_name = 'assessment_period'
  ) THEN
    ALTER TABLE assessments
    ADD COLUMN assessment_period TEXT CHECK (assessment_period IN ('BOY', 'MOY', 'EOY'));
  END IF;
END $$;

-- ============================================
-- 2. ADD COLUMNS TO SESSIONS TABLE
-- ============================================

-- Index of which passage in the sequence (0, 1, or 2)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'passage_index'
  ) THEN
    ALTER TABLE sessions
    ADD COLUMN passage_index INTEGER DEFAULT 0;
  END IF;
END $$;

-- The specific passage ID for this session (e.g., 'L4-A-mars')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'passage_id'
  ) THEN
    ALTER TABLE sessions
    ADD COLUMN passage_id TEXT;
  END IF;
END $$;

-- ============================================
-- 3. CREATE INDEX FOR EFFICIENT QUERIES
-- ============================================

-- Index for querying sessions by assessment and passage order
CREATE INDEX IF NOT EXISTS idx_sessions_assessment_passage
ON sessions(assessment_id, passage_index);

-- ============================================
-- 4. CREATE MEDIAN WCPM FUNCTION (Multi-tenant aware)
-- ============================================

-- Calculate median WCPM from all sessions in an assessment
-- Includes multi-tenancy check: only returns data for teacher's school
-- Extracts wcpm from scores_json.metrics.wcpm
CREATE OR REPLACE FUNCTION calculate_median_wcpm(p_assessment_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_school_id UUID;
  v_assessment_school_id UUID;
  v_median NUMERIC;
BEGIN
  -- Get the calling teacher's school (if authenticated)
  -- For service role or anon access, school check is skipped
  SELECT school_id INTO v_teacher_school_id
  FROM teachers
  WHERE auth_provider_id = auth.uid();

  -- Get the assessment's school
  SELECT school_id INTO v_assessment_school_id
  FROM assessments
  WHERE id = p_assessment_id;

  IF v_assessment_school_id IS NULL THEN
    RETURN NULL; -- Assessment not found
  END IF;

  -- Multi-tenancy check: if teacher is authenticated, verify school access
  -- Service role (v_teacher_school_id IS NULL when no auth) can access all
  IF v_teacher_school_id IS NOT NULL AND v_teacher_school_id != v_assessment_school_id THEN
    RAISE EXCEPTION 'Access denied: assessment belongs to a different school';
  END IF;

  -- Calculate median WCPM
  SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY (scores_json->'metrics'->>'wcpm')::numeric
  )
  INTO v_median
  FROM sessions
  WHERE assessment_id = p_assessment_id
    AND status = 'complete'
    AND scores_json IS NOT NULL
    AND scores_json->'metrics'->>'wcpm' IS NOT NULL;

  RETURN v_median;
END;
$$;

-- ============================================
-- 5. HELPER FUNCTION: Get all WCPM scores for an assessment
-- ============================================

-- Returns array of WCPM scores for median-of-3 calculations
-- Respects multi-tenancy
CREATE OR REPLACE FUNCTION get_assessment_wcpm_scores(p_assessment_id UUID)
RETURNS NUMERIC[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_school_id UUID;
  v_assessment_school_id UUID;
  v_scores NUMERIC[];
BEGIN
  -- Get the calling teacher's school
  SELECT school_id INTO v_teacher_school_id
  FROM teachers
  WHERE auth_provider_id = auth.uid();

  -- Get the assessment's school
  SELECT school_id INTO v_assessment_school_id
  FROM assessments
  WHERE id = p_assessment_id;

  IF v_assessment_school_id IS NULL THEN
    RETURN ARRAY[]::NUMERIC[]; -- Assessment not found
  END IF;

  -- Multi-tenancy check
  IF v_teacher_school_id IS NOT NULL AND v_teacher_school_id != v_assessment_school_id THEN
    RAISE EXCEPTION 'Access denied: assessment belongs to a different school';
  END IF;

  -- Get all WCPM scores ordered by passage_index
  SELECT ARRAY_AGG(wcpm ORDER BY passage_index)
  INTO v_scores
  FROM (
    SELECT
      passage_index,
      (scores_json->'metrics'->>'wcpm')::numeric AS wcpm
    FROM sessions
    WHERE assessment_id = p_assessment_id
      AND status = 'complete'
      AND scores_json IS NOT NULL
      AND scores_json->'metrics'->>'wcpm' IS NOT NULL
  ) sub;

  RETURN COALESCE(v_scores, ARRAY[]::NUMERIC[]);
END;
$$;

-- ============================================
-- 6. COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON COLUMN assessments.reading_level IS 'Reading level 3-7 (not grade) for passage difficulty routing. Level 4 is core use case for struggling middle schoolers.';
COMMENT ON COLUMN assessments.passage_ids IS 'Array of passage IDs from lib/passages/library.ts (1 or 3 passages for median-of-3 protocol)';
COMMENT ON COLUMN assessments.assessment_period IS 'BOY (Sep-Nov), MOY (Nov-Feb), EOY (Mar-Aug) for Hasbrouck-Tindal benchmark comparison';
COMMENT ON COLUMN sessions.passage_index IS 'Index 0-2 indicating which passage in a multi-passage assessment';
COMMENT ON COLUMN sessions.passage_id IS 'Passage ID from library (e.g., L4-A-mars) for this reading session';
COMMENT ON FUNCTION calculate_median_wcpm(UUID) IS 'Calculate median WCPM for an assessment. Multi-tenant: validates school access.';
COMMENT ON FUNCTION get_assessment_wcpm_scores(UUID) IS 'Get all WCPM scores for an assessment as array. Multi-tenant: validates school access.';
