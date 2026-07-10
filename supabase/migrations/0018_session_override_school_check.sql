-- Multi-tenancy fix for apply_session_override (field-level overrides, 0008)
--
-- The 0008 version verified the caller is a teacher but never checked that
-- the target session belongs to the caller's school. Because the function is
-- SECURITY DEFINER it bypasses the school-scoped RLS policies on
-- session_overrides and sessions, so any authenticated teacher could rewrite
-- WCPM/prosody/summary on another school's session given its UUID. Its 0014
-- sibling (apply_event_override) already does this check — bring this
-- function up to the same standard, pin search_path, and tighten grants.

create or replace function apply_session_override(
  p_session_id uuid,
  p_field_name text,
  p_original_value jsonb,
  p_new_value jsonb,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_teacher_id uuid;
  v_teacher_school_id uuid;
  v_session_school_id uuid;
  v_override_id uuid;
  v_current_scores jsonb;
  v_field_path text[];
begin
  -- Get the calling teacher's ID and school
  select id, school_id into v_teacher_id, v_teacher_school_id
  from teachers
  where auth_provider_id = auth.uid();

  if v_teacher_id is null then
    raise exception 'Teacher not found for current user';
  end if;

  -- Validate session belongs to teacher's school (multi-tenancy check)
  select a.school_id into v_session_school_id
  from sessions s
  join assessments a on s.assessment_id = a.id
  where s.id = p_session_id;

  if v_session_school_id is null then
    raise exception 'Session not found';
  end if;

  if v_session_school_id != v_teacher_school_id then
    raise exception 'Access denied: session belongs to a different school';
  end if;

  -- Get current scores_json
  select scores_json into v_current_scores
  from sessions
  where id = p_session_id;

  if v_current_scores is null then
    raise exception 'Session scores not found';
  end if;

  -- Insert the override record
  insert into session_overrides (
    session_id,
    teacher_id,
    field_name,
    original_value,
    new_value,
    reason
  ) values (
    p_session_id,
    v_teacher_id,
    p_field_name,
    p_original_value,
    p_new_value,
    p_reason
  )
  returning id into v_override_id;

  -- Update scores_json based on field_name
  -- Handle nested paths like 'prosody.expression'
  v_field_path := string_to_array(p_field_name, '.');

  if array_length(v_field_path, 1) = 1 then
    -- Simple field like 'wcpm' or 'summary'
    if p_field_name = 'wcpm' then
      v_current_scores := jsonb_set(
        v_current_scores,
        '{metrics,wcpm}',
        p_new_value
      );
    elsif p_field_name = 'accuracy_percent' then
      v_current_scores := jsonb_set(
        v_current_scores,
        '{metrics,accuracy_percent}',
        p_new_value
      );
    elsif p_field_name = 'summary' then
      v_current_scores := jsonb_set(
        v_current_scores,
        '{summary}',
        p_new_value
      );
    else
      -- Generic top-level field
      v_current_scores := jsonb_set(
        v_current_scores,
        array[p_field_name],
        p_new_value
      );
    end if;
  elsif v_field_path[1] = 'prosody' then
    -- Prosody subfields like 'prosody.expression' or 'prosody.level'
    v_current_scores := jsonb_set(
      v_current_scores,
      array['prosody', v_field_path[2]],
      p_new_value
    );
  end if;

  -- Update the session with new scores and mark as edited
  update sessions
  set
    scores_json = v_current_scores,
    teacher_review_status = 'edited'
  where id = p_session_id;

  return v_override_id;
end;
$$;

-- Teacher-facing: callable by authenticated (self-checks school via
-- auth.uid()), never by anonymous students.
revoke execute on function apply_session_override(uuid, text, jsonb, jsonb, text) from public;
revoke execute on function apply_session_override(uuid, text, jsonb, jsonb, text) from anon;
grant execute on function apply_session_override(uuid, text, jsonb, jsonb, text) to authenticated;
