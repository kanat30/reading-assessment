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
