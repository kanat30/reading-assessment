-- Exclude never-reached words from the override metric recompute.
--
-- FluencyScope reads are a fixed 60-second timed sample, so a student usually
-- stops partway through the passage. The words after the last one they reached
-- were never attempted — in ORF scoring they are "not reached", NOT errors, and
-- must be excluded from accuracy/WCPM (mirrors lib/scoring/metrics.ts, which
-- already scores only up to getLastReachedIndex()).
--
-- Bug this fixes: recalculate_session_metrics (0014/0017) counted EVERY non-insertion
-- event as a word "attempted". At initial scoring the JS engine excluded the unread
-- tail, so accuracy looked right — but the moment a teacher applied any word-level
-- override, this function recomputed the denominator over the WHOLE passage
-- (e.g. 300 words) instead of the ~120 actually read, silently collapsing accuracy
-- (120/300 = 40% where the true figure was ~96%). WCPM was unaffected (it depends on
-- correct words / duration, not the denominator), but the accuracy drop alone is a
-- trust-breaking regression triggered by the very override flow meant to build trust.
--
-- Fix: derive the reached cutoff as the highest word_index that was voiced
-- (spoken_word IS NOT NULL — the same signal lib/scoring/metrics.getLastReachedIndex
-- uses; verified equivalent to start_timestamp_ms IS NOT NULL across all live events)
-- and count only words at or before it. A mid-passage skip (an omission with voiced
-- words after it) stays counted; only the trailing run of never-voiced words is dropped.

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
BEGIN
  -- Get session duration
  SELECT duration_seconds, scores_json
  INTO v_duration_seconds, v_current_scores
  FROM sessions
  WHERE id = p_session_id;

  IF v_current_scores IS NULL THEN
    RAISE EXCEPTION 'Session scores not found';
  END IF;

  -- Reached cutoff: the last word the student actually voiced. Words after this
  -- were never reached in the timed sample. COALESCE to -1 so a session with no
  -- voiced words scores 0 attempted rather than counting the whole passage.
  SELECT COALESCE(MAX(word_index), -1)
  INTO v_last_reached
  FROM session_events
  WHERE session_id = p_session_id
    AND event_type != 'insertion'
    AND spoken_word IS NOT NULL;

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

-- CREATE OR REPLACE preserves the ACL, but re-assert the internal-only grants
-- from 0017 to keep this function locked down if it is ever created fresh.
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION recalculate_session_metrics(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION recalculate_session_metrics(UUID) TO service_role;

-- Repair any session whose scores were already recomputed under the old
-- full-passage denominator (i.e. sessions that have at least one override).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT session_id FROM session_event_overrides LOOP
    PERFORM recalculate_session_metrics(r.session_id);
  END LOOP;
END $$;
