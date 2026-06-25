# WER Validation Data

This folder contains ground-truth data for validating ASR accuracy.

## Setup

1. **Collect classroom recordings** (5-10 samples recommended)
   - Include diverse voices: AAVE, Spanglish, ELL/newcomer, various fluency levels
   - Use the same audio format the app uses (webm preferred, mp3/wav also work)

2. **Hand-transcribe each recording**
   - Listen carefully and write exactly what the student said
   - Include filler words (um, uh), repetitions, self-corrections
   - This becomes the ground truth for WER calculation

3. **Hand-score WCPM**
   - Count correct words using Hasbrouck-Tindal rules:
     - Self-corrections count as correct
     - Mispronunciations count as errors
     - Omissions count as errors
   - Calculate: (correct words / duration in minutes)

4. **Create samples.json**
   - Copy `samples.template.json` to `samples.json`
   - Fill in the data for each sample

## Running Validation

```bash
npx tsx scripts/validate-wer.ts
```

## Target Threshold

- **±5 WCPM delta** is the target
- This is within normal teacher-to-teacher variation
- If you see >10 WCPM delta consistently, investigate:
  - Audio quality issues
  - Disfluency counting rules
  - Dialect mismatch

## Sample Entry

```json
{
  "id": "sample-001",
  "audio_file": "sample-001.webm",
  "passage_text": "The passage the student was reading...",
  "hand_transcription": "What the teacher heard...",
  "hand_wcpm": 142,
  "duration_seconds": 60,
  "notes": "Grade 7, fluent reader"
}
```

## Fields

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the sample |
| `audio_file` | Filename of audio in this folder |
| `passage_text` | The text the student was supposed to read |
| `hand_transcription` | What the teacher actually heard (ground truth) |
| `hand_wcpm` | Teacher's WCPM count |
| `duration_seconds` | Recording duration |
| `notes` | Speaker demographics, reading level, etc. |

## Gitignore

Audio files and `samples.json` should NOT be committed (student data).
Add to `.gitignore`:
```
validation-data/*.webm
validation-data/*.mp3
validation-data/*.wav
validation-data/samples.json
```
