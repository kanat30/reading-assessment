-- Add status column for three-tier comprehension grading
-- Status: "correct", "partial", "incorrect"

alter table comprehension_answers
  add column if not exists status text;

-- Add check constraint for valid status values
alter table comprehension_answers
  add constraint comprehension_answers_status_check
  check (status is null or status in ('correct', 'partial', 'incorrect'));

-- Backfill existing records based on is_correct
update comprehension_answers
set status = case
  when is_correct = true then 'correct'
  when is_correct = false then 'incorrect'
  else null
end
where status is null;
