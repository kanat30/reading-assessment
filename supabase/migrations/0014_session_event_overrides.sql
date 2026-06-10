-- Session Event Overrides
-- Allows teachers to override AI word-level detections
-- - Flag missed errors (mark "correct" words as errors)
-- - Approve/Reject AI-detected errors
-- - Track reasons for each override
-- - Auto-recalculate metrics

-- ============================================
-- 1. SESSION_EVENT_OVERRIDES TABLE
-- ============================================
CREATE TABLE session_event_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  word_index INTEGER NOT NULL,
  teacher_id UUID NOT NULL REFERENCES teachers(id),

  -- Action: what the teacher is doing
  action TEXT NOT NULL CHECK (action IN ('flag_error', 'approve', 'reject')),

  -- Snapshot of original AI detection (for audit)
  original_event_type TEXT NOT NULL,
  original_confidence REAL,

  -- Teacher's correction (for flag_error)
  new_event_type TEXT,  -- substitution, omission, mispronunciation, self_correction
  spoken_word_override TEXT,  -- What teacher heard (optional)

  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(session_id, word_index, teacher_id)
);

CREATE INDEX session_event_overrides_session_id_idx ON session_event_overrides(session_id);

-- ============================================
-- 2. ROW LEVEL SECURITY (Multi-tenant)
-- ============================================
ALTER TABLE session_event_overrides ENABLE ROW LEVEL SECURITY;

-- Teachers can READ overrides for any session in their school
CREATE POLICY "teachers can read event overrides for sessions in their school"
  ON session_event_overrides FOR SELECT
  USING (
    session_id IN (
      SELECT s.id FROM sessions s
      JOIN assessments a ON s.assessment_id = a.id
      WHERE a.school_id = current_teacher_school_id()
    )
  );

-- Teachers can INSERT overrides only for sessions in their school
CREATE POLICY "teachers can insert event overrides for sessions in their school"
  ON session_event_overrides FOR INSERT
  WITH CHECK (
    teacher_id = (SELECT id FROM teachers WHERE auth_provider_id = auth.uid())
    AND session_id IN (
      SELECT s.id FROM sessions s
      JOIN assessments a ON s.assessment_id = a.id
      WHERE a.school_id = current_teacher_school_id()
    )
  );

-- Teachers can UPDATE only their own overrides
CREATE POLICY "teachers can update own event overrides"
  ON session_event_overrides FOR UPDATE
  USING (teacher_id = (SELECT id FROM teachers WHERE auth_provider_id = auth.uid()));

-- Teachers can DELETE only their own overrides
CREATE POLICY "teachers can delete own event overrides"
  ON session_event_overrides FOR DELETE
  USING (teacher_id = (SELECT id FROM teachers WHERE auth_provider_id = auth.uid()));

-- ============================================
-- 3. RECALCULATE SESSION METRICS FUNCTION
-- Computes effective event types and updates WCPM/accuracy
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_session_metrics(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Count correct words considering overrides
  -- A word is correct if:
  -- 1. AI says correct AND no override exists
  -- 2. AI says correct AND override action is 'approve'
  -- 3. AI says error AND override action is 'reject'
  -- A word is incorrect if:
  -- 1. AI says error AND no override exists
  -- 2. AI says error AND override action is 'approve'
  -- 3. AI says correct AND override action is 'flag_error'
  SELECT COUNT(*)
  INTO v_correct_words
  FROM session_events se
  LEFT JOIN session_event_overrides seo
    ON se.session_id = seo.session_id
    AND se.word_index = seo.word_index
  WHERE se.session_id = p_session_id
    AND se.event_type != 'insertion'
    AND (
      -- Case 1: AI correct, no override or approved
      (se.event_type = 'correct' AND (seo.id IS NULL OR seo.action = 'approve'))
      OR
      -- Case 2: AI error, override rejects it (teacher says it's correct)
      (se.event_type != 'correct' AND seo.action = 'reject')
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
  v_current_scores := jsonb_set(
    v_current_scores,
    '{metrics,wcpm}',
    to_jsonb(v_wcpm)
  );
  v_current_scores := jsonb_set(
    v_current_scores,
    '{metrics,accuracy_percent}',
    to_jsonb(v_accuracy_percent)
  );
  v_current_scores := jsonb_set(
    v_current_scores,
    '{metrics,correct_words}',
    to_jsonb(v_correct_words)
  );

  -- Update session
  UPDATE sessions
  SET
    scores_json = v_current_scores,
    teacher_review_status = 'edited'
  WHERE id = p_session_id;

  -- Return updated metrics
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
-- 4. APPLY EVENT OVERRIDE FUNCTION
-- Upserts an override and recalculates metrics
-- ============================================
CREATE OR REPLACE FUNCTION apply_event_override(
  p_session_id UUID,
  p_word_index INTEGER,
  p_action TEXT,
  p_original_event_type TEXT,
  p_original_confidence REAL DEFAULT NULL,
  p_new_event_type TEXT DEFAULT NULL,
  p_spoken_word_override TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_teacher_school_id UUID;
  v_session_school_id UUID;
  v_override_id UUID;
  v_metrics JSONB;
BEGIN
  -- Get the calling teacher's ID and school
  SELECT id, school_id INTO v_teacher_id, v_teacher_school_id
  FROM teachers
  WHERE auth_provider_id = auth.uid();

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Teacher not found for current user';
  END IF;

  -- Validate session belongs to teacher's school (multi-tenancy check)
  SELECT a.school_id INTO v_session_school_id
  FROM sessions s
  JOIN assessments a ON s.assessment_id = a.id
  WHERE s.id = p_session_id;

  IF v_session_school_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session_school_id != v_teacher_school_id THEN
    RAISE EXCEPTION 'Access denied: session belongs to a different school';
  END IF;

  -- Validate action
  IF p_action NOT IN ('flag_error', 'approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Upsert the override
  INSERT INTO session_event_overrides (
    session_id,
    word_index,
    teacher_id,
    action,
    original_event_type,
    original_confidence,
    new_event_type,
    spoken_word_override,
    reason
  ) VALUES (
    p_session_id,
    p_word_index,
    v_teacher_id,
    p_action,
    p_original_event_type,
    p_original_confidence,
    p_new_event_type,
    p_spoken_word_override,
    p_reason
  )
  ON CONFLICT (session_id, word_index, teacher_id)
  DO UPDATE SET
    action = EXCLUDED.action,
    original_event_type = EXCLUDED.original_event_type,
    original_confidence = EXCLUDED.original_confidence,
    new_event_type = EXCLUDED.new_event_type,
    spoken_word_override = EXCLUDED.spoken_word_override,
    reason = EXCLUDED.reason,
    created_at = now()
  RETURNING id INTO v_override_id;

  -- Recalculate metrics
  v_metrics := recalculate_session_metrics(p_session_id);

  -- Return result
  RETURN jsonb_build_object(
    'override_id', v_override_id,
    'metrics', v_metrics
  );
END;
$$;

-- ============================================
-- 5. DELETE EVENT OVERRIDE FUNCTION
-- Removes an override and recalculates metrics
-- ============================================
CREATE OR REPLACE FUNCTION delete_event_override(
  p_session_id UUID,
  p_word_index INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_teacher_id UUID;
  v_teacher_school_id UUID;
  v_session_school_id UUID;
  v_metrics JSONB;
BEGIN
  -- Get the calling teacher's ID and school
  SELECT id, school_id INTO v_teacher_id, v_teacher_school_id
  FROM teachers
  WHERE auth_provider_id = auth.uid();

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Teacher not found for current user';
  END IF;

  -- Validate session belongs to teacher's school (multi-tenancy check)
  SELECT a.school_id INTO v_session_school_id
  FROM sessions s
  JOIN assessments a ON s.assessment_id = a.id
  WHERE s.id = p_session_id;

  IF v_session_school_id IS NULL THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session_school_id != v_teacher_school_id THEN
    RAISE EXCEPTION 'Access denied: session belongs to a different school';
  END IF;

  -- Delete the override (only if teacher owns it)
  DELETE FROM session_event_overrides
  WHERE session_id = p_session_id
    AND word_index = p_word_index
    AND teacher_id = v_teacher_id;

  -- Recalculate metrics
  v_metrics := recalculate_session_metrics(p_session_id);

  RETURN jsonb_build_object(
    'metrics', v_metrics
  );
END;
$$;
