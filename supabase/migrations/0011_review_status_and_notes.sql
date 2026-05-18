-- Review Status Workflow and Teacher Notes
-- Adds new status workflow and private per-teacher notes for sessions

-- ============================================
-- 1. UPDATE REVIEW STATUS CONSTRAINT
-- ============================================

-- Drop old constraint first (allows any value temporarily)
ALTER TABLE sessions
DROP CONSTRAINT IF EXISTS sessions_teacher_review_status_check;

-- Migrate existing 'unreviewed' to 'new' BEFORE adding new constraint
UPDATE sessions
SET teacher_review_status = 'new'
WHERE teacher_review_status = 'unreviewed';

-- Update default for new sessions
ALTER TABLE sessions
ALTER COLUMN teacher_review_status SET DEFAULT 'new';

-- Add new constraint with expanded statuses (now all data is valid)
ALTER TABLE sessions
ADD CONSTRAINT sessions_teacher_review_status_check
CHECK (teacher_review_status IN ('new', 'reviewed', 'approved', 'flagged', 'edited'));

-- ============================================
-- 2. CREATE SESSION_TEACHER_NOTES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS session_teacher_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, teacher_id)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS session_teacher_notes_session_id_idx ON session_teacher_notes(session_id);
CREATE INDEX IF NOT EXISTS session_teacher_notes_teacher_id_idx ON session_teacher_notes(teacher_id);

-- ============================================
-- 3. ENABLE RLS ON NOTES TABLE
-- ============================================

ALTER TABLE session_teacher_notes ENABLE ROW LEVEL SECURITY;

-- Helper function to get current teacher's ID
CREATE OR REPLACE FUNCTION current_teacher_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM teachers WHERE auth_provider_id = auth.uid()
$$;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "teachers can read own notes" ON session_teacher_notes;
DROP POLICY IF EXISTS "teachers can insert own notes" ON session_teacher_notes;
DROP POLICY IF EXISTS "teachers can update own notes" ON session_teacher_notes;
DROP POLICY IF EXISTS "teachers can delete own notes" ON session_teacher_notes;
DROP POLICY IF EXISTS "service role can manage notes" ON session_teacher_notes;

-- Teachers can only read their own notes
CREATE POLICY "teachers can read own notes"
  ON session_teacher_notes FOR SELECT
  USING (teacher_id = current_teacher_id());

-- Teachers can insert their own notes
CREATE POLICY "teachers can insert own notes"
  ON session_teacher_notes FOR INSERT
  WITH CHECK (teacher_id = current_teacher_id());

-- Teachers can update their own notes
CREATE POLICY "teachers can update own notes"
  ON session_teacher_notes FOR UPDATE
  USING (teacher_id = current_teacher_id());

-- Teachers can delete their own notes
CREATE POLICY "teachers can delete own notes"
  ON session_teacher_notes FOR DELETE
  USING (teacher_id = current_teacher_id());

-- Service role can manage all notes (for cascade deletes)
CREATE POLICY "service role can manage notes"
  ON session_teacher_notes FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================
-- 4. UPDATE TIMESTAMP TRIGGER
-- ============================================

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_session_teacher_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS session_teacher_notes_updated_at ON session_teacher_notes;

-- Create trigger
CREATE TRIGGER session_teacher_notes_updated_at
  BEFORE UPDATE ON session_teacher_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_session_teacher_notes_updated_at();
