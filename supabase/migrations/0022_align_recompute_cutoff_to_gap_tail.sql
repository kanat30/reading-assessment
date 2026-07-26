-- Align the override recompute's reached-cutoff to the score-time engine.
--
-- Background: recalculate_session_metrics (0019) derives the "reached cutoff" as the
-- MAX voiced word_index. The score-time engine lib/scoring/metrics.ts::getLastReachedIndex
-- does more: after a large silent gap (NOT_REACHED_GAP_THRESHOLD never-voiced words)
-- followed by only a sparse tail (<= NOT_REACHED_TAIL_TOLERANCE voiced words), it treats
-- that tail as a stray post-stop alignment match and cuts at the end of the leading
-- contiguous read (see DECISIONS 2026-07-14 "A repeated word at the stop point...").
--
-- Consequence of the mismatch: a stray-tail read scored correctly at score time, but the
-- moment a teacher applied ANY word-level override, this function recomputed over the
-- WHOLE read up to the stray match — re-inflating total_words_attempted (and thus
-- dropping accuracy) and counting a few stray words into WCPM. That is a narrower
-- instance of the exact regression 0019 was written to kill, triggered by the very
-- override flow meant to build trust. Surfaced by the recompute test suite's SQL<->TS
-- parity contract (DECISIONS 2026-07-24).
--
-- Fix: port getLastReachedIndex's gap/tail rule into the function verbatim. The two
-- thresholds below MUST stay in sync with lib/scoring/metrics.ts (there is no way to
-- share the constant across plpgsql and TS). Normal reads are unaffected (no qualifying
-- gap -> still the last voiced word); only stray-tail reads change, matching score time.
--
-- Multi-tenancy: recalculate_session_metrics is a SECURITY DEFINER helper that bypasses
-- RLS, so it is only safe while no client role can call it directly and its sole caller
-- (apply_event_override) still enforces the caller's school. This migration re-asserts
-- the internal-only grants AND self-verifies both invariants against the live catalog at
-- apply time (see the DO block after the grants), aborting the whole migration atomically
-- if the tenancy guard has regressed — it never weakens RLS or tenant isolation.

CREATE OR REPLACE FUNCTION recalculate_session_metrics(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_words INTEGER;
  v_correct_words INTEGER;
  v_last_reached INTEGER;
  v_duration_seconds NUMERIC;
  v_wcpm INTEGER;
  v_accuracy_percent NUMERIC;
  v_current_scores JSONB;
  v_result JSONB;
  v_voiced INTEGER[];
  v_n INTEGER;
  v_i INTEGER;
  v_gap INTEGER;
  -- Keep in sync with lib/scoring/metrics.ts (getLastReachedIndex).
  c_gap_threshold  CONSTANT INTEGER := 12;  -- NOT_REACHED_GAP_THRESHOLD
  c_tail_tolerance CONSTANT INTEGER := 3;   -- NOT_REACHED_TAIL_TOLERANCE
BEGIN
  -- Get session duration
  SELECT duration_seconds, scores_json
  INTO v_duration_seconds, v_current_scores
  FROM sessions
  WHERE id = p_session_id;

  IF v_current_scores IS NULL THEN
    RAISE EXCEPTION 'Session scores not found';
  END IF;

  -- Ordered list of the word indices the student actually voiced (the reached words).
  SELECT array_agg(word_index ORDER BY word_index)
  INTO v_voiced
  FROM session_events
  WHERE session_id = p_session_id
    AND event_type != 'insertion'
    AND spoken_word IS NOT NULL;

  v_n := COALESCE(array_length(v_voiced, 1), 0);

  -- Reached cutoff, mirroring getLastReachedIndex():
  --   * nothing voiced            -> -1 (0 attempted, rather than the whole passage)
  --   * default                   -> the last voiced word
  --   * a large silent gap (>= c_gap_threshold never-voiced words) followed by only a
  --     sparse tail (<= c_tail_tolerance voiced words) -> cut at the leading read; the
  --     tail is a stray post-stop alignment match. A big gap the student then reads
  --     substantially past is a genuine skip and is left intact (still counts as errors).
  IF v_n = 0 THEN
    v_last_reached := -1;
  ELSE
    v_last_reached := v_voiced[v_n];
    FOR v_i IN 1 .. (v_n - 1) LOOP
      v_gap := v_voiced[v_i + 1] - v_voiced[v_i] - 1;
      IF v_gap >= c_gap_threshold AND (v_n - v_i) <= c_tail_tolerance THEN
        v_last_reached := v_voiced[v_i];
        EXIT;  -- first qualifying gap wins, as in the TS loop
      END IF;
    END LOOP;
  END IF;

  -- Count total words attempted (non-insertion events up to the reached cutoff)
  SELECT COUNT(*)
  INTO v_total_words
  FROM session_events
  WHERE session_id = p_session_id
    AND event_type != 'insertion'
    AND word_index <= v_last_reached;

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
    AND se.word_index <= v_last_reached
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
  v_current_scores := jsonb_set(v_current_scores, '{metrics,total_words_attempted}', to_jsonb(v_total_words));

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

-- CREATE OR REPLACE preserves the ACL, but re-assert the internal-only grants from
-- 0017/0019 so the function stays locked down if it is ever created fresh.
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION recalculate_session_metrics(UUID) TO service_role;

-- ============================================
-- Multi-tenancy / RLS self-verification (runs against the ACTUAL database at apply
-- time; aborts the whole migration atomically if any invariant is violated, rather
-- than silently shipping a tenancy regression). Mirrors the catalog-driven style of
-- 0020. recalculate_session_metrics is a SECURITY DEFINER helper that bypasses RLS,
-- so it is ONLY safe as long as (a) no client role can call it directly and (b) its
-- sole caller, apply_event_override, still enforces the caller's school. We assert
-- both against the live catalog.
-- ============================================
DO $$
DECLARE
  v_has_wrapper boolean;
  v_secdef      boolean;
  v_cfg         text[];
  t             text;
  v_rls         boolean;
BEGIN
  -- (1) The recompute helper must be SECURITY DEFINER with a pinned search_path
  --     (prevents search-path hijack of a definer function). Always checked.
  SELECT prosecdef, proconfig INTO v_secdef, v_cfg
  FROM pg_proc WHERE oid = 'recalculate_session_metrics(uuid)'::regprocedure;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'Aborting: recalculate_session_metrics is not SECURITY DEFINER';
  END IF;
  IF v_cfg IS NULL OR NOT (array_to_string(v_cfg, ',') ILIKE '%search_path%') THEN
    RAISE EXCEPTION 'Aborting: recalculate_session_metrics has no pinned search_path';
  END IF;

  -- (2) No client role may execute the definer helper directly (that would bypass the
  --     school check in apply_event_override). anon inherits PUBLIC, so checking anon
  --     + authenticated also catches an accidental GRANT ... TO PUBLIC. Always checked.
  IF has_function_privilege('anon', 'recalculate_session_metrics(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Aborting: anon can execute recalculate_session_metrics (RLS-bypass hole)';
  END IF;
  IF has_function_privilege('authenticated', 'recalculate_session_metrics(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Aborting: authenticated can execute recalculate_session_metrics directly (bypasses the per-school check)';
  END IF;

  -- The remaining invariants only exist once the full tenancy stack is present. Gate
  -- them on the wrapper's existence so the hermetic arithmetic harness (which loads
  -- only this function) is unaffected, while a real apply gets the complete check.
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'apply_event_override'
  ) INTO v_has_wrapper;

  IF v_has_wrapper THEN
    -- (3) The sole caller must still be a SECURITY DEFINER function that enforces the
    --     caller's school (the "belongs to a different school" guard from 0014/0018).
    SELECT prosecdef INTO v_secdef
    FROM pg_proc WHERE proname = 'apply_event_override' LIMIT 1;
    IF NOT v_secdef THEN
      RAISE EXCEPTION 'Aborting: apply_event_override is not SECURITY DEFINER';
    END IF;
    IF pg_get_functiondef('apply_event_override'::regproc) NOT ILIKE '%different school%' THEN
      RAISE EXCEPTION 'Aborting: apply_event_override no longer enforces the per-school multi-tenancy check';
    END IF;

    -- (4) RLS must be enabled on every table this function reads/writes, so the
    --     non-definer (client) code path stays school-scoped.
    FOREACH t IN ARRAY ARRAY['sessions', 'session_events', 'session_event_overrides'] LOOP
      SELECT relrowsecurity INTO v_rls FROM pg_class
      WHERE oid = ('public.' || t)::regclass;
      IF NOT COALESCE(v_rls, false) THEN
        RAISE EXCEPTION 'Aborting: row-level security is not enabled on public.%', t;
      END IF;
    END LOOP;

    RAISE NOTICE 'Tenancy verified: recompute helper is internal-only, apply_event_override enforces school, RLS on all 3 tables.';
  ELSE
    RAISE NOTICE 'Wrapper apply_event_override absent (minimal/test schema) — verified helper lockdown only.';
  END IF;
END $$;

-- Repair any session whose scores were recomputed under the old MAX-voiced cutoff
-- (i.e. sessions with at least one override). A stray-tail read among them now recomputes
-- to the correct, tighter denominator; normal reads are unchanged.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT session_id FROM session_event_overrides LOOP
    PERFORM recalculate_session_metrics(r.session_id);
  END LOOP;
END $$;
