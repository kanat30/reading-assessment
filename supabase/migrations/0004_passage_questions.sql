-- Add passage_questions table for comprehension assessment

-- ============================================
-- PASSAGE_QUESTIONS
-- ============================================
create table passage_questions (
  id uuid primary key default gen_random_uuid(),
  passage_id uuid not null references passages(id) on delete cascade,
  question text not null,
  question_type text not null check (question_type in ('literal', 'inferential')),
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index passage_questions_passage_id_idx on passage_questions(passage_id);

-- ============================================
-- COMPREHENSION_ANSWERS
-- Stores student responses to comprehension questions
-- ============================================
create table comprehension_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  question_id uuid not null references passage_questions(id) on delete cascade,
  student_answer text not null,
  is_correct boolean,
  feedback text,
  created_at timestamptz not null default now(),

  unique(session_id, question_id)
);

create index comprehension_answers_session_id_idx on comprehension_answers(session_id);

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS
alter table passage_questions enable row level security;
alter table comprehension_answers enable row level security;

-- passage_questions: Public read (anyone can see questions for passages)
create policy "passage_questions_public_read"
  on passage_questions for select
  using (true);

-- comprehension_answers: Teachers can read answers for their school's sessions
create policy "comprehension_answers_teacher_read"
  on comprehension_answers for select
  using (
    exists (
      select 1 from sessions s
      join assessments a on s.assessment_id = a.id
      where s.id = comprehension_answers.session_id
      and a.school_id = current_teacher_school_id()
    )
  );

-- comprehension_answers: Anyone can insert (students submitting answers)
create policy "comprehension_answers_public_insert"
  on comprehension_answers for insert
  with check (true);

-- comprehension_answers: Service role can update (for grading)
-- Note: Service role bypasses RLS, so this is just documentation
