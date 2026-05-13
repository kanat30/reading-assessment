-- Add support for numbered students (privacy-compliant identification)
-- Students identify by number ("Student 1", "Student 2") instead of real names

ALTER TABLE assessments
  ADD COLUMN use_numbered_students boolean NOT NULL DEFAULT false,
  ADD COLUMN expected_student_count integer CHECK (expected_student_count IS NULL OR expected_student_count > 0);

-- Add index for querying numbered student assessments
CREATE INDEX assessments_numbered_students_idx ON assessments(use_numbered_students) WHERE use_numbered_students = true;

COMMENT ON COLUMN assessments.use_numbered_students IS 'When true, students select from a dropdown (Student 1, Student 2, etc.) instead of entering their name';
COMMENT ON COLUMN assessments.expected_student_count IS 'Number of students expected for numbered student assessments (e.g., 20 for a class of 20)';
