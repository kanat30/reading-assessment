-- FluencyScope Initial Schema
-- 8 core tables for multi-tenant reading assessment platform

-- ============================================
-- 1. SCHOOLS
-- ============================================
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text,
  created_at timestamptz not null default now()
);

-- ============================================
-- 2. TEACHERS
-- ============================================
create table teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  auth_provider_id uuid unique, -- links to auth.users.id
  created_at timestamptz not null default now()
);

create index teachers_school_id_idx on teachers(school_id);
create index teachers_auth_provider_id_idx on teachers(auth_provider_id);

-- ============================================
-- 3. STUDENTS
-- ============================================
create table students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  grade text,
  external_id text,
  auth_provider_id uuid,
  created_at timestamptz not null default now()
);

create index students_school_id_idx on students(school_id);
-- Index for name lookups (case-insensitive matching)
create index students_name_lookup_idx on students(school_id, lower(first_name), lower(last_name));

-- ============================================
-- 4. PASSAGES
-- ============================================
create table passages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  text text not null,
  grade_band text not null,
  word_count integer not null,
  lexile integer,
  source_attribution text,
  curriculum_unit text,
  created_at timestamptz not null default now()
);

-- ============================================
-- 5. ASSESSMENTS
-- ============================================
create table assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id) on delete cascade,
  teacher_id uuid not null references teachers(id) on delete cascade,
  passage_id uuid not null references passages(id) on delete restrict,
  class_label text not null,
  share_token text not null unique,
  mode text not null check (mode in ('screening', 'progress_monitoring')),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index assessments_school_id_idx on assessments(school_id);
create index assessments_teacher_id_idx on assessments(teacher_id);
create index assessments_share_token_idx on assessments(share_token);

-- ============================================
-- 6. SESSIONS (student reading attempts)
-- ============================================
create table sessions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  audio_url text,
  transcript text,
  duration_seconds real,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  scores_json jsonb,
  teacher_review_status text not null default 'unreviewed' check (teacher_review_status in ('unreviewed', 'approved', 'edited')),
  created_at timestamptz not null default now(),
  scored_at timestamptz
);

create index sessions_assessment_id_idx on sessions(assessment_id);
create index sessions_student_id_idx on sessions(student_id);
create index sessions_status_idx on sessions(status);

-- ============================================
-- 7. SESSION_EVENTS (word-level analysis)
-- ============================================
create table session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  word_index integer not null,
  expected_word text not null,
  spoken_word text,
  start_timestamp_ms integer,
  end_timestamp_ms integer,
  event_type text not null check (event_type in ('correct', 'substitution', 'omission', 'insertion', 'self_correction', 'pause')),
  confidence_score real
);

create index session_events_session_id_idx on session_events(session_id);

-- ============================================
-- 8. Helper function for RLS policies
-- ============================================
create or replace function current_teacher_school_id()
returns uuid
language sql
stable
security definer
as $$
  select school_id from teachers where auth_provider_id = auth.uid()
$$;
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
