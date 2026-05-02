-- Add mispronunciation to the event_type constraint
-- Mispronunciations are words that the ASR recognized correctly but with low confidence (<80%)
-- This indicates potential pronunciation issues even when the word was understood

-- Drop the existing constraint
alter table session_events drop constraint if exists session_events_event_type_check;

-- Add the new constraint with mispronunciation included
alter table session_events add constraint session_events_event_type_check
  check (event_type in ('correct', 'substitution', 'omission', 'insertion', 'self_correction', 'pause', 'mispronunciation'));
