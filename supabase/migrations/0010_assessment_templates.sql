-- Assessment templates for reusable passage + questions combinations
-- Teachers can save templates and quickly create assessments from them

CREATE TABLE IF NOT EXISTS assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name text NOT NULL,
  passage_id uuid NOT NULL REFERENCES passages(id) ON DELETE RESTRICT,
  questions jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS assessment_templates_school_id_idx ON assessment_templates(school_id);
CREATE INDEX IF NOT EXISTS assessment_templates_teacher_id_idx ON assessment_templates(teacher_id);

-- Enable Row Level Security
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then recreate
DROP POLICY IF EXISTS "teachers can read school templates" ON assessment_templates;
DROP POLICY IF EXISTS "teachers can insert templates" ON assessment_templates;
DROP POLICY IF EXISTS "teachers can delete own templates" ON assessment_templates;

-- Teachers can read all templates in their school
CREATE POLICY "teachers can read school templates"
  ON assessment_templates FOR SELECT
  USING (school_id IN (SELECT school_id FROM teachers WHERE auth_provider_id = auth.uid()));

-- Teachers can create templates in their school
CREATE POLICY "teachers can insert templates"
  ON assessment_templates FOR INSERT
  WITH CHECK (school_id IN (SELECT school_id FROM teachers WHERE auth_provider_id = auth.uid()));

-- Teachers can only delete their own templates
CREATE POLICY "teachers can delete own templates"
  ON assessment_templates FOR DELETE
  USING (teacher_id IN (SELECT id FROM teachers WHERE auth_provider_id = auth.uid()));

COMMENT ON TABLE assessment_templates IS 'Reusable templates containing passage + comprehension questions for quick assessment creation';
