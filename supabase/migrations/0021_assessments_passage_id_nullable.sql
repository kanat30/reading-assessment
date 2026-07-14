-- Make assessments.passage_id nullable for the passage-library flow, and add a
-- data-integrity CHECK so every assessment still references a passage source.
--
-- Background: passage_id was declared NOT NULL in 0001 back when every assessment
-- pointed at a single row in the `passages` table. Migration 0016 introduced the
-- passage library (reading_level + passage_ids[] + assessment_period), where an
-- assessment references 1-3 library passage IDs (e.g. 'L4-A-mars') and has NO row
-- in `passages`. The dashboard's library create path (app/dashboard/client.tsx)
-- inserts passage_id = NULL, which violated the old NOT NULL constraint and made
-- every library assessment creation fail with a 400 ("null value in column
-- passage_id ... violates not-null constraint").
--
-- Verified against the live DB before writing this migration (2026-07-13):
--   * PostgREST OpenAPI / information_schema: passage_id is currently NOT NULL.
--   * All 15 existing assessment rows have a non-null passage_id, so the CHECK
--     added below already holds for every existing row (no backfill needed).
--
-- Multi-tenancy / RLS: unaffected. Tenant isolation on assessments is enforced by
-- the school_id policies from 0002 ("teachers can insert/update/delete school
-- assessments" USING / WITH CHECK school_id = current_teacher_school_id()); none of
-- those policies reference passage_id, and this migration does not touch RLS. The
-- FK passage_id -> passages(id) ON DELETE RESTRICT is preserved (a NULL FK value is
-- simply not enforced), so legacy single-passage assessments keep referential
-- integrity.
--
-- Idempotent: safe to re-run. DROP NOT NULL is a no-op once nullable; the CHECK is
-- only added if a constraint of the same name does not already exist.

-- 1. Relax the legacy NOT NULL so library assessments (passage_id = NULL) can insert.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessments'
      AND column_name = 'passage_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE assessments ALTER COLUMN passage_id DROP NOT NULL;
  END IF;
END $$;

-- 2. Replace the lost NOT NULL guarantee with a stricter, format-agnostic invariant:
--    every assessment must carry EITHER a legacy passage_id OR at least one library
--    passage id. cardinality() is used because passage_ids defaults to '{}' (an empty
--    array, whose array_length is NULL, not 0).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assessments_has_passage_source'
      AND conrelid = 'public.assessments'::regclass
  ) THEN
    ALTER TABLE assessments
      ADD CONSTRAINT assessments_has_passage_source
      CHECK (passage_id IS NOT NULL OR cardinality(passage_ids) > 0);
  END IF;
END $$;

COMMENT ON COLUMN assessments.passage_id IS 'Legacy single-passage reference into the passages table. NULL for passage-library assessments, which use passage_ids[] + reading_level instead (see migration 0016). The assessments_has_passage_source CHECK guarantees at least one of passage_id / passage_ids is present.';
