-- Add expected_answer column to comprehension_answers table
-- This stores the correct answer or relevant passage excerpt for teacher reference
--
-- MULTI-TENANCY / RLS NOTES:
-- This migration only adds a column. PostgreSQL RLS policies are row-based,
-- so the existing policies automatically cover this new column:
--
-- 1. "comprehension_answers_teacher_read" (0004): Teachers read their school's answers
--    → expected_answer readable by teachers within their school
--
-- 2. "anon can read comprehension for accessible sessions" (0012): Students read recent sessions
--    → expected_answer readable by students viewing their own report
--
-- 3. "comprehension_answers_public_insert" (0004): Students can insert answers
--    → expected_answer will be NULL on initial insert (grading adds it later)
--
-- 4. Updates are performed via service role (admin client) in /api/comprehension
--    which bypasses RLS - this is intentional for server-side grading operations.
--
-- No new RLS policies are required.
-- ============================================

-- Add column only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'comprehension_answers'
    AND column_name = 'expected_answer'
  ) THEN
    ALTER TABLE comprehension_answers ADD COLUMN expected_answer TEXT;
    COMMENT ON COLUMN comprehension_answers.expected_answer IS
      'The correct answer or relevant passage excerpt, extracted by AI during grading';
  END IF;
END
$$;
