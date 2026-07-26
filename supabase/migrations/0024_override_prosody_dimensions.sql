-- Make per-dimension prosody overrides real (DECISIONS 2026-07-26, D2).
--
-- Prosody dimension scores now live in scores_json.prosody_dimensions
-- ({pace, smoothness, phrasing, expression}), computed deterministically at
-- score time; Expression is teacher-rated (null until set). The 0018 version
-- of apply_session_override only knew the old 'prosody.<field>' path — which
-- overwrote the AI observation's descriptive strings and was rendered nowhere
-- (the audit's "display-dead override"). This version:
--
--   1. Adds the 'prosody_dimensions.<dim>' path: validates the dimension name
--      and the 1-4 value, and initializes the object if absent (legacy
--      sessions scored before dimensions existed).
--   2. Rejects unrecognized field paths instead of silently recording an
--      override row without applying it — an override that doesn't change the
--      report must be an error, not a no-op.
--
-- Body otherwise identical to 0018 (school check, SECURITY DEFINER hygiene,
-- grants). Committed migrations are never edited; this supersedes 0018's
-- function in place.

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
  v_dimension text;
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

  -- Validate + apply the field path BEFORE recording the override, so an
  -- unsupported path errors out instead of leaving a phantom override row.
  v_field_path := string_to_array(p_field_name, '.');

  if array_length(v_field_path, 1) = 1 then
    if p_field_name = 'wcpm' then
      v_current_scores := jsonb_set(v_current_scores, '{metrics,wcpm}', p_new_value);
    elsif p_field_name = 'accuracy_percent' then
      v_current_scores := jsonb_set(v_current_scores, '{metrics,accuracy_percent}', p_new_value);
    elsif p_field_name = 'summary' then
      v_current_scores := jsonb_set(v_current_scores, '{summary}', p_new_value);
    else
      raise exception 'Unsupported override field: %', p_field_name;
    end if;
  elsif array_length(v_field_path, 1) = 2 and v_field_path[1] = 'prosody_dimensions' then
    -- Per-dimension prosody override (the D2 flow). Expression is the
    -- teacher-rated dimension; the other three correct the deterministic rules.
    v_dimension := v_field_path[2];
    if v_dimension not in ('expression', 'pace', 'smoothness', 'phrasing') then
      raise exception 'Unknown prosody dimension: %', v_dimension;
    end if;
    if jsonb_typeof(p_new_value) != 'number'
       or (p_new_value)::text::numeric not in (1, 2, 3, 4) then
      raise exception 'Prosody dimension value must be 1-4';
    end if;
    -- Initialize the dimensions object for sessions scored before it existed.
    if v_current_scores->'prosody_dimensions' is null then
      v_current_scores := jsonb_set(
        v_current_scores,
        '{prosody_dimensions}',
        '{"pace": null, "smoothness": null, "phrasing": null, "expression": null}'::jsonb
      );
    end if;
    v_current_scores := jsonb_set(
      v_current_scores,
      array['prosody_dimensions', v_dimension],
      p_new_value
    );
  elsif v_field_path[1] = 'prosody' then
    -- Legacy path kept so historical override rows replay identically if ever
    -- re-applied; new UI writes prosody_dimensions.* only.
    v_current_scores := jsonb_set(
      v_current_scores,
      array['prosody', v_field_path[2]],
      p_new_value
    );
  else
    raise exception 'Unsupported override field: %', p_field_name;
  end if;

  -- Record the override
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

-- ── Self-verification against the live catalog ─────────────────────────────
-- Mirrors the 0020/0022 convention: assert the tenancy invariants from
-- pg_catalog at apply time and abort (rolling back the CREATE OR REPLACE)
-- if any fail. Behavioral coverage (school rejection, path validation, no
-- phantom override rows) lives in supabase/tests/session_override.test.sql,
-- which loads THIS file verbatim into a throwaway Postgres.
DO $$
DECLARE
  v_secdef  boolean;
  v_cfg     text[];
  v_def     text;
  v_rls     boolean;
  v_count   int;
  t         text;
BEGIN
  -- (1) SECURITY DEFINER with a pinned search_path (definer functions without
  --     one are search-path-hijackable).
  SELECT prosecdef, proconfig INTO v_secdef, v_cfg
  FROM pg_proc
  WHERE oid = 'apply_session_override(uuid, text, jsonb, jsonb, text)'::regprocedure;
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'Aborting: apply_session_override is not SECURITY DEFINER';
  END IF;
  IF v_cfg IS NULL OR NOT (array_to_string(v_cfg, ',') ILIKE '%search_path%') THEN
    RAISE EXCEPTION 'Aborting: apply_session_override has no pinned search_path';
  END IF;

  -- (2) Grants: anon (and PUBLIC, which anon inherits) must NOT execute this
  --     RLS-bypassing function; authenticated MUST (it is the teacher-facing
  --     entry point — losing that grant silently breaks every override).
  IF has_function_privilege('anon', 'apply_session_override(uuid, text, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Aborting: anon can execute apply_session_override (RLS-bypass hole)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'apply_session_override(uuid, text, jsonb, jsonb, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Aborting: authenticated lost EXECUTE on apply_session_override (teacher overrides would 42501)';
  END IF;

  -- (3) The body this migration just installed must carry both guards: the
  --     per-school multi-tenancy check (0018) and the strict field-path
  --     rejection added here. Read back from the catalog, not assumed.
  v_def := pg_get_functiondef('apply_session_override(uuid, text, jsonb, jsonb, text)'::regprocedure);
  IF v_def NOT ILIKE '%different school%' THEN
    RAISE EXCEPTION 'Aborting: apply_session_override lost the per-school multi-tenancy check';
  END IF;
  IF v_def NOT ILIKE '%Unsupported override field%' THEN
    RAISE EXCEPTION 'Aborting: apply_session_override lost the strict field-path rejection';
  END IF;

  -- (4) Tables this definer function reads/writes must keep RLS enabled so
  --     the client (non-definer) paths stay school-scoped. Gated per table on
  --     existence so the hermetic harness's minimal schema still verifies
  --     whatever it stands up.
  FOREACH t IN ARRAY ARRAY['sessions', 'session_overrides', 'assessments', 'teachers'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      SELECT relrowsecurity INTO v_rls FROM pg_class
      WHERE oid = ('public.' || t)::regclass;
      IF NOT COALESCE(v_rls, false) THEN
        RAISE EXCEPTION 'Aborting: row-level security is not enabled on public.%', t;
      END IF;
    END IF;
  END LOOP;

  -- (5) session_overrides must still carry its school-scoped policies (0008).
  --     UNCONDITIONAL when the table exists: "no policies at all" is
  --     indistinguishable from someone having dropped them, so it aborts
  --     rather than being treated as a minimal test schema (this migration
  --     only ever applies to production or to a harness that stands up the
  --     full stack — see supabase/tests/_override_setup.sql).
  IF to_regclass('public.session_overrides') IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_overrides'
      AND (COALESCE(qual, '') ILIKE '%current_teacher_school_id%'
        OR COALESCE(with_check, '') ILIKE '%current_teacher_school_id%');
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Aborting: no school-scoped policy on session_overrides (dropped or never created)';
    END IF;
  END IF;

  RAISE NOTICE 'Tenancy verified: apply_session_override locked down (definer, pinned path, anon revoked), school check + strict paths present, RLS on, session_overrides school-scoped.';
END $$;
