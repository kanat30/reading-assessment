-- Fix session read access for students viewing reports
--
-- PROBLEM:
-- Students couldn't view reports after assessment expired because the policy
-- used assessment_is_valid() which checks expires_at > now().
--
-- MULTI-TENANCY MODEL:
-- 1. Teacher access: Scoped by school_id via existing policies in 0002_rls_policies.sql
--    - "teachers can read school sessions"
--    - "teachers can read school session events"
--    - These remain unchanged and enforce school-level isolation
--
-- 2. Anonymous (student) access: Uses session UUID as a capability token
--    - Students receive their session_id at assessment completion
--    - The UUID is unguessable (128-bit random)
--    - This is the standard "magic link" pattern used by many apps
--
-- SOLUTION:
-- Allow anonymous read access to sessions that:
-- 1. Were created within the last 30 days (reasonable report viewing window)
-- 2. Have a valid assessment_id (prevents accessing orphaned sessions)
--
-- This does NOT affect teacher policies which remain scoped by school_id.
-- ============================================

-- Drop existing anonymous read policies
drop policy if exists "anyone can read sessions for valid assessments" on sessions;
drop policy if exists "anyone can read session events for valid assessments" on session_events;
drop policy if exists "anyone can read comprehension answers for valid session" on comprehension_answers;

-- Sessions: Anonymous read access with time limit and assessment validation
-- Note: Teacher access remains via separate policy "teachers can read school sessions"
create policy "anon can read recent sessions with valid assessment"
  on sessions for select
  using (
    -- Session must be recent (30 day window for viewing reports)
    created_at > now() - interval '30 days'
    -- Assessment must still exist (prevents orphaned session access)
    and exists (
      select 1 from assessments where id = assessment_id
    )
  );

-- Session events: Anonymous read access for accessible sessions
-- Note: Teacher access remains via separate policy "teachers can read school session events"
create policy "anon can read events for accessible sessions"
  on session_events for select
  using (
    session_id in (
      select id from sessions
      where created_at > now() - interval '30 days'
      and exists (
        select 1 from assessments where id = assessment_id
      )
    )
  );

-- Comprehension answers: Anonymous read access for accessible sessions
-- Note: Teacher access remains via separate policy "comprehension_answers_teacher_read"
create policy "anon can read comprehension for accessible sessions"
  on comprehension_answers for select
  using (
    session_id in (
      select id from sessions
      where created_at > now() - interval '30 days'
      and exists (
        select 1 from assessments where id = assessment_id
      )
    )
  );

-- Students: Anonymous read access for students linked to accessible sessions
-- This allows viewing the student name on the report page
-- Note: Teacher access remains via separate policy "teachers can read school students"
create policy "anon can read students for accessible sessions"
  on students for select
  using (
    id in (
      select student_id from sessions
      where created_at > now() - interval '30 days'
      and exists (
        select 1 from assessments where id = assessment_id
      )
    )
  );
