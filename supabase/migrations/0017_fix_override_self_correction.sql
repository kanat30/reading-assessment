-- Fix recalculate_session_metrics: scoring correctness + tenancy hardening
--
-- Correctness (vs the 0014 version):
--   1. Only event_type = 'correct' counted as correct. The scoring engine
--      (lib/scoring/metrics.ts) counts 'correct' AND 'self_correction' per
--      Hasbrouck-Tindal, so applying any word-level override silently
--      dropped WCPM/accuracy for students who self-corrected.
--   2. The LEFT JOIN could double-count a word when two teachers had
--      overrides on the same word_index (the UNIQUE constraint is
--      per-teacher). Use the most recent override per word instead.
--   3. A teacher flag_error that reclassifies a word AS a self_correction
--      now counts as correct, consistent with the engine.
--
-- Tenancy / RLS hardening (verified against the live DB on 2026-07-10):
--   4. This function is SECURITY DEFINER and, under Supabase's default
--      function grants, was directly executable via PostgREST by `anon`
--      and `authenticated` — letting any anon-key holder recalculate and
--      READ scores for any session in any school, bypassing RLS. It is an
--      internal helper only ever invoked from apply_event_override /
--      delete_event_override (which enforce the caller's school via
--      auth.uid()). Revoke direct execution from client roles.
--   5. Pin search_path on all three SECURITY DEFINER functions (prevents
--      search-path hijacking; matches the Supabase database linter rule).

CREATE OR REPLACE FUNCTION recalculate_session_metrics(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_words INTEGER;
  v_correct_words INTEGER;
  v_duration_seconds NUMERIC;
  v_wcpm INTEGER;
  v_accuracy_percent NUMERIC;
  v_current_scores JSONB;
  v_result JSONB;
BEGIN
  -- Get session duration
  SELECT duration_seconds, scores_json
  INTO v_duration_seconds, v_current_scores
  FROM sessions
  WHERE id = p_session_id;

  IF v_current_scores IS NULL THEN
    RAISE EXCEPTION 'Session scores not found';
  END IF;

  -- Count total words attempted (all events that are not insertions)
  SELECT COUNT(*)
  INTO v_total_words
  FROM session_events
  WHERE session_id = p_session_id
    AND event_type != 'insertion';

  -- Count correct words considering overrides.
  -- 'correct' and 'self_correction' both count as correct (Hasbrouck-Tindal).
  -- Effective state per word, using the most recent override if several exist:
  --   correct-like + no override or 'approve'            -> correct
  --   error + 'reject' (teacher says AI was wrong)       -> correct
  --   'flag_error' reclassifying as self_correction      -> correct
  --   everything else                                    -> incorrect
  SELECT COUNT(*)
  INTO v_correct_words
  FROM session_events se
  LEFT JOIN LATERAL (
    SELECT o.action, o.new_event_type
    FROM session_event_overrides o
    WHERE o.session_id = se.session_id
      AND o.word_index = se.word_index
    ORDER BY o.created_at DESC
    LIMIT 1
  ) seo ON TRUE
  WHERE se.session_id = p_session_id
    AND se.event_type != 'insertion'
    AND (
      (se.event_type IN ('correct', 'self_correction')
        AND (seo.action IS NULL OR seo.action = 'approve'))
      OR
      (se.event_type NOT IN ('correct', 'self_correction')
        AND seo.action = 'reject')
      OR
      (seo.action = 'flag_error' AND seo.new_event_type = 'self_correction')
    );

  -- Calculate metrics
  IF v_duration_seconds > 0 THEN
    v_wcpm := ROUND((v_correct_words::NUMERIC / (v_duration_seconds / 60.0)));
  ELSE
    v_wcpm := 0;
  END IF;

  IF v_total_words > 0 THEN
    v_accuracy_percent := ROUND((v_correct_words::NUMERIC / v_total_words::NUMERIC) * 100);
  ELSE
    v_accuracy_percent := 0;
  END IF;

  -- Update scores_json
  v_current_scores := jsonb_set(v_current_scores, '{metrics,wcpm}', to_jsonb(v_wcpm));
  v_current_scores := jsonb_set(v_current_scores, '{metrics,accuracy_percent}', to_jsonb(v_accuracy_percent));
  v_current_scores := jsonb_set(v_current_scores, '{metrics,correct_words}', to_jsonb(v_correct_words));

  -- Update session
  UPDATE sessions
  SET
    scores_json = v_current_scores,
    teacher_review_status = 'edited'
  WHERE id = p_session_id;

  v_result := jsonb_build_object(
    'wcpm', v_wcpm,
    'accuracy_percent', v_accuracy_percent,
    'correct_words', v_correct_words,
    'total_words_attempted', v_total_words
  );

  RETURN v_result;
END;
$$;

-- ============================================
-- EXECUTE grants
-- ============================================

-- recalculate_session_metrics is internal-only. The outer SECURITY DEFINER
-- functions call it with their owner's privileges, so revoking client roles
-- does not break the app path (app/api/event-override -> apply_event_override).
-- service_role keeps EXECUTE for trusted maintenance scripts.
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION recalculate_session_metrics(UUID) TO service_role;

-- The teacher-facing functions must stay executable by `authenticated`
-- (the app calls them through the RLS session client and they enforce the
-- caller's school via auth.uid()), but anonymous students have no business
-- calling them at all.
REVOKE EXECUTE ON FUNCTION apply_event_override(UUID, INTEGER, TEXT, TEXT, REAL, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION apply_event_override(UUID, INTEGER, TEXT, TEXT, REAL, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION apply_event_override(UUID, INTEGER, TEXT, TEXT, REAL, TEXT, TEXT, TEXT) TO authenticated;

REVOKE EXECUTE ON FUNCTION delete_event_override(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION delete_event_override(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION delete_event_override(UUID, INTEGER) TO authenticated;

-- Pin search_path on the other two SECURITY DEFINER functions from 0014
-- (bodies unchanged; auth.uid() is schema-qualified so this is safe).
ALTER FUNCTION apply_event_override(UUID, INTEGER, TEXT, TEXT, REAL, TEXT, TEXT, TEXT)
  SET search_path = public, pg_temp;
ALTER FUNCTION delete_event_override(UUID, INTEGER)
  SET search_path = public, pg_temp;

-- ============================================
-- Backfill
-- ============================================

-- Re-run the corrected calculation for every session that has overrides,
-- repairing scores the buggy version already wrote. Runs as the migration
-- role: intentionally cross-tenant, like any schema migration.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT session_id FROM session_event_overrides LOOP
    PERFORM recalculate_session_metrics(r.session_id);
  END LOOP;
END $$;
