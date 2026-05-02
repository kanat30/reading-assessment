-- Session Overrides Audit Log
-- Tracks teacher corrections to session scores with full audit trail

-- ============================================
-- 1. OVERRIDES TABLE
-- ============================================
create table session_overrides (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  teacher_id uuid not null references teachers(id),
  field_name text not null,           -- e.g., 'wcpm', 'accuracy_percent', 'prosody.expression'
  original_value jsonb not null,
  new_value jsonb not null,
  reason text,                         -- optional teacher note
  created_at timestamptz default now()
);

create index session_overrides_session_id_idx on session_overrides(session_id);

-- ============================================
-- 2. ROW LEVEL SECURITY
-- ============================================
alter table session_overrides enable row level security;

create policy "teachers can read overrides for sessions in their school"
  on session_overrides for select
  using (
    session_id in (
      select s.id from sessions s
      join assessments a on s.assessment_id = a.id
      where a.school_id = current_teacher_school_id()
    )
  );

create policy "teachers can insert overrides for sessions in their school"
  on session_overrides for insert
  with check (
    teacher_id = (select id from teachers where auth_provider_id = auth.uid())
    and session_id in (
      select s.id from sessions s
      join assessments a on s.assessment_id = a.id
      where a.school_id = current_teacher_school_id()
    )
  );

-- ============================================
-- 3. ATOMIC OVERRIDE FUNCTION
-- Wraps override insert + session update in single transaction
-- ============================================
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
as $$
declare
  v_teacher_id uuid;
  v_override_id uuid;
  v_current_scores jsonb;
  v_field_path text[];
begin
  -- Get the calling teacher's ID
  select id into v_teacher_id
  from teachers
  where auth_provider_id = auth.uid();

  if v_teacher_id is null then
    raise exception 'Teacher not found for current user';
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
