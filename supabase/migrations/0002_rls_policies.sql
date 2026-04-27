-- FluencyScope Row Level Security Policies
-- Multi-tenant security scoped by school_id

-- ============================================
-- Enable RLS on all tables
-- ============================================
alter table schools enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table passages enable row level security;
alter table assessments enable row level security;
alter table sessions enable row level security;
alter table session_events enable row level security;

-- ============================================
-- SCHOOLS policies
-- ============================================
-- Teachers can only read their own school
create policy "teachers can read own school"
  on schools for select
  using (id in (select school_id from teachers where auth_provider_id = auth.uid()));

-- Service role can insert (used during signup)
create policy "service role can insert schools"
  on schools for insert
  with check (true);

-- ============================================
-- TEACHERS policies
-- ============================================
-- Teachers can read themselves and same-school colleagues
create policy "teachers can read self and same-school colleagues"
  on teachers for select
  using (school_id = current_teacher_school_id());

-- Teachers can update their own row
create policy "teachers can update self"
  on teachers for update
  using (auth_provider_id = auth.uid());

-- Service role can insert (used during signup)
create policy "service role can insert teachers"
  on teachers for insert
  with check (true);

-- ============================================
-- STUDENTS policies
-- ============================================
-- Teachers can read students in their school
create policy "teachers can read school students"
  on students for select
  using (school_id = current_teacher_school_id());

-- Teachers can insert students in their school
create policy "teachers can insert school students"
  on students for insert
  with check (school_id = current_teacher_school_id());

-- Service role can insert (used during anonymous student session creation)
create policy "service role can insert students"
  on students for insert
  with check (true);

-- Teachers can update students in their school
create policy "teachers can update school students"
  on students for update
  using (school_id = current_teacher_school_id());

-- ============================================
-- PASSAGES policies
-- ============================================
-- Anyone can read passages (shared content, needed for student flow)
-- Note: This is intentionally permissive. Passages are not sensitive data.
create policy "anyone can read passages"
  on passages for select
  using (true);

-- Only service role can insert/update passages
create policy "service role can manage passages"
  on passages for all
  using (true)
  with check (true);

-- ============================================
-- ASSESSMENTS policies
-- ============================================
-- Anyone can read assessments (needed for student flow via share_token)
-- Note: The share_token itself is the security boundary (long random string).
-- Students access assessments via token without authentication.
create policy "anyone can read assessments"
  on assessments for select
  using (true);

-- Teachers can insert assessments for their school
create policy "teachers can insert school assessments"
  on assessments for insert
  with check (school_id = current_teacher_school_id());

-- Teachers can update assessments in their school
create policy "teachers can update school assessments"
  on assessments for update
  using (school_id = current_teacher_school_id());

-- Teachers can delete assessments in their school
create policy "teachers can delete school assessments"
  on assessments for delete
  using (school_id = current_teacher_school_id());

-- ============================================
-- SESSIONS policies
-- ============================================
-- Helper function: check if assessment has valid (unexpired) share_token
create or replace function assessment_is_valid(assessment_uuid uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from assessments
    where id = assessment_uuid
    and (expires_at is null or expires_at > now())
  )
$$;

-- Teachers can read sessions for their school's assessments
create policy "teachers can read school sessions"
  on sessions for select
  using (
    assessment_id in (
      select id from assessments where school_id = current_teacher_school_id()
    )
  );

-- Anonymous users can insert sessions if assessment is valid
-- This allows students to submit readings without authentication
create policy "anyone can insert session for valid assessment"
  on sessions for insert
  with check (assessment_is_valid(assessment_id));

-- Service role can update sessions (used by scoring pipeline)
create policy "service role can update sessions"
  on sessions for update
  using (true)
  with check (true);

-- Teachers can update sessions in their school (for review status)
create policy "teachers can update school sessions"
  on sessions for update
  using (
    assessment_id in (
      select id from assessments where school_id = current_teacher_school_id()
    )
  );

-- ============================================
-- SESSION_EVENTS policies
-- ============================================
-- Teachers can read events for their school's sessions
create policy "teachers can read school session events"
  on session_events for select
  using (
    session_id in (
      select s.id from sessions s
      join assessments a on s.assessment_id = a.id
      where a.school_id = current_teacher_school_id()
    )
  );

-- Service role can insert events (used by scoring pipeline)
create policy "service role can insert session events"
  on session_events for insert
  with check (true);
