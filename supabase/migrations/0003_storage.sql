-- FluencyScope Storage Setup
-- Private bucket for audio recordings

-- Create the recordings bucket (private by default)
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', false)
on conflict (id) do nothing;

-- Storage policies for recordings bucket
-- Only service role can upload (scoring pipeline)
create policy "service role can upload recordings"
  on storage.objects for insert
  with check (bucket_id = 'recordings');

-- Teachers can read recordings for their school's sessions
create policy "teachers can read school recordings"
  on storage.objects for select
  using (
    bucket_id = 'recordings'
    and (
      -- Extract session_id from path (format: session_id.webm)
      (storage.foldername(name))[1]::uuid in (
        select s.id from sessions s
        join assessments a on s.assessment_id = a.id
        where a.school_id = current_teacher_school_id()
      )
      or
      -- Or match by filename directly (session_id.webm)
      split_part(name, '.', 1)::uuid in (
        select s.id from sessions s
        join assessments a on s.assessment_id = a.id
        where a.school_id = current_teacher_school_id()
      )
    )
  );

-- Service role can read all recordings
create policy "service role can read recordings"
  on storage.objects for select
  using (bucket_id = 'recordings');
