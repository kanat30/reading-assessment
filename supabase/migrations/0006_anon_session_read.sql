-- Allow anonymous users to read sessions for valid assessments
-- This is needed for the student comprehension flow after recording

-- Drop existing policies if they exist (idempotent migration)
drop policy if exists "anyone can read sessions for valid assessments" on sessions;
drop policy if exists "anyone can read session events for valid assessments" on session_events;
drop policy if exists "anyone can read comprehension answers for valid session" on comprehension_answers;

-- Students need to read their session to load comprehension questions
create policy "anyone can read sessions for valid assessments"
  on sessions for select
  using (assessment_is_valid(assessment_id));

-- Students also need to read session_events (for report view if linked from done page)
create policy "anyone can read session events for valid assessments"
  on session_events for select
  using (
    session_id in (
      select s.id from sessions s
      where assessment_is_valid(s.assessment_id)
    )
  );

-- Comprehension answers - allow anonymous read (for viewing reports)
-- Note: Insert policy already exists in 0004_passage_questions.sql
create policy "anyone can read comprehension answers for valid session"
  on comprehension_answers for select
  using (
    session_id in (
      select s.id from sessions s
      where assessment_is_valid(s.assessment_id)
    )
  );
