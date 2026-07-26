-- Minimal schema + Supabase-compat role shim for the recompute test harness.
--
-- The suite loads the REAL recalculate_session_metrics function verbatim from
-- supabase/migrations/0019_exclude_unreached_from_recompute.sql (no re-implementation,
-- so the test can never drift from production). That migration REVOKE/GRANTs the
-- function to Supabase's anon / authenticated / service_role roles and reads three
-- tables. This file provides just enough for the real migration to load and run:
-- the roles, and the columns the function actually touches.
--
-- This runs against a throwaway cluster created by scripts/test-recompute.sh — it
-- never touches a real database.

-- Supabase roles referenced by the migration's grants.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END $$;

-- Minimal tables. Column names/types match 0001/0014 for the fields the function
-- reads; everything the function does not reference is omitted on purpose.
CREATE TABLE sessions (
  id                    uuid PRIMARY KEY,
  duration_seconds      real,
  scores_json           jsonb,
  teacher_review_status text NOT NULL DEFAULT 'unreviewed'
);

CREATE TABLE session_events (
  id           bigserial PRIMARY KEY,
  session_id   uuid NOT NULL,
  word_index   integer NOT NULL,
  event_type   text NOT NULL,
  spoken_word  text
);

CREATE TABLE session_event_overrides (
  id           bigserial PRIMARY KEY,
  session_id   uuid NOT NULL,
  word_index   integer NOT NULL,
  action       text NOT NULL,
  new_event_type text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
