-- Make the teacher report provably teacher-only by removing anonymous read
-- access to student data, WITHOUT weakening multi-tenancy.
--
-- Background: 0006, then 0012, granted broad read access on sessions,
-- session_events, comprehension_answers, and students for any session created
-- within a 30-day window, to power a student-facing "view report" link. Those
-- policies have NO school scoping, so they exposed the full report — WCPM, the
-- At/Below/Well-Below benchmark band, the synced transcript (session_events),
-- prosody, the AI summary, and the student's NAME (students) — to anyone
-- holding a session UUID, for 30 days. Verified against the live DB on
-- 2026-07-13 (anon role via PostgREST): anon could read 3/34 sessions,
-- 895/2626 session_events, and 1/24 students. Inconsistent with the biometric
-- gating on /api/audio/[id] (DECISIONS 2026-07-10) and with the product
-- decision that students do not view reports.
--
-- The only legitimate anonymous consumer was the comprehension page's passage
-- lookup, now served by the bounded GET /api/comprehension route (admin client,
-- assessment share_token + a 2-hour window). Student session INSERT (0002) and
-- the service-role scoring/comprehension pipelines are unaffected.
--
-- This migration is CATALOG-DRIVEN: rather than dropping policies by hard-coded
-- name (which would silently no-op if the live names differ), it reads
-- pg_policies at apply time and drops every PERMISSIVE SELECT policy on these
-- tables that is granted to anon/public and is NOT scoped to the caller's
-- school (i.e. does not reference current_teacher_school_id()). It then asserts
-- the multi-tenant end-state: every table must retain a school-scoped SELECT
-- policy (or it aborts rather than lock teachers out), and no non-school-scoped
-- anon/public read policy may remain (or it aborts rather than leave the hole).
--
-- Preserved by design: the school-scoped "teachers can read school ..." SELECT
-- policies (0002) and comprehension_answers_teacher_read (0004); the anonymous
-- student INSERT policies (cmd = INSERT, not SELECT); service-role/update
-- policies. Admin (is_admin()) policies exist only on schools/teachers, not on
-- these tables, so none are affected.

do $$
declare
  target_tables constant text[] := array[
    'sessions', 'session_events', 'comprehension_answers', 'students'
  ];
  r        record;
  t        text;
  dropped  int := 0;
  kept     int;
begin
  -- 1) Drop non-school-scoped anon/public SELECT policies (the student
  --    capability policies from 0006/0012), discovered from the live catalog.
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any(target_tables)
      and permissive = 'PERMISSIVE'
      and cmd = 'SELECT'
      and ('public' = any(roles) or 'anon' = any(roles))
      and coalesce(qual, '') not ilike '%current_teacher_school_id%'
  loop
    raise notice 'Dropping non-school-scoped SELECT policy "%" on %.%',
      r.policyname, r.schemaname, r.tablename;
    execute format('drop policy if exists %I on %I.%I',
      r.policyname, r.schemaname, r.tablename);
    dropped := dropped + 1;
  end loop;
  raise notice 'Non-school-scoped SELECT policies dropped: %', dropped;

  -- 2) Multi-tenancy guard: each table MUST still have a school-scoped SELECT
  --    policy so authenticated teachers keep report access. Abort otherwise.
  foreach t in array target_tables loop
    select count(*) into kept
    from pg_policies
    where schemaname = 'public'
      and tablename = t
      and cmd in ('SELECT', 'ALL')
      and coalesce(qual, '') ilike '%current_teacher_school_id%';
    if kept = 0 then
      raise exception
        'Aborting: no school-scoped SELECT policy remains on public.% — teachers would lose access', t;
    end if;
  end loop;

  -- 3) Closure guard: no non-school-scoped anon/public read access may remain,
  --    via a SELECT *or* an ALL policy (ALL policies are not auto-dropped above
  --    because they also govern writes — surface them for manual review).
  select count(*) into kept
  from pg_policies
  where schemaname = 'public'
    and tablename = any(target_tables)
    and permissive = 'PERMISSIVE'
    and cmd in ('SELECT', 'ALL')
    and ('public' = any(roles) or 'anon' = any(roles))
    and coalesce(qual, '') not ilike '%current_teacher_school_id%';
  if kept <> 0 then
    raise exception
      'Aborting: % non-school-scoped anon/public read policy(ies) still present on student-data tables (review ALL-command policies manually)', kept;
  end if;

  raise notice 'Report access is now teacher-only across %', target_tables;
end $$;
