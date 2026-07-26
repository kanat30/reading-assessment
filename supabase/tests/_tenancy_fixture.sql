-- Stands up the minimal "full tenancy stack" the 0022 self-verification checks for, so
-- the harness can exercise the complete verification path (not just the helper-lockdown
-- skip) and prove it ABORTS on a regression. This is a stub of the real tenancy stack:
-- a SECURITY DEFINER apply_event_override whose body carries the per-school guard text
-- ("different school", as in migration 0014/0018), plus RLS enabled on the three tables
-- the recompute touches. Superuser bypasses RLS, so enabling it here does not affect the
-- test's own writes — it only flips relrowsecurity, which is what 0022 asserts.

CREATE OR REPLACE FUNCTION apply_event_override() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Multi-tenancy: a session that belongs to a different school is rejected here
  -- before recalculate_session_metrics is ever called.
  RAISE EXCEPTION 'Access denied: session belongs to a different school';
END $$;

ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_event_overrides ENABLE ROW LEVEL SECURITY;
