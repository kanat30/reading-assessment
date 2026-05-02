# FluencyScope — Week 1 Build Prompt (Part 2 of 2)

You are a coding agent with terminal and filesystem access. Part 1 has shipped: a Next.js app exists at `./fluencyscope` with the design tokens, fonts, and three static student routes (`/read`, `/read/recording`, `/read/done`). You are now executing items 7–13 of the Week 1 checklist: real audio recording, the AI scoring pipeline (Deepgram → alignment → Claude), and the report view that makes someone gasp.

Work autonomously. Do not stop between steps. Only halt for genuine blockers.

---

## Prerequisites — confirm before starting

The user has placed two API keys in `fluencyscope/.env.local`:

```
DEEPGRAM_API_KEY=...
ANTHROPIC_API_KEY=...
```

If `.env.local` does not exist, create it with placeholders and **do not proceed** — instead, report back asking the user to populate it.

---

## What you are building

A complete reading-to-report magic moment. A demo user clicks through the existing static flow, records real audio while reading, and ~30 seconds later sees a beautiful report with:

- WCPM (words correct per minute) as a giant headline number
- Accuracy %
- Errors highlighted inline in the transcript
- A 2-3 sentence Claude-generated teacher summary
- Audio playback (basic — fancy waveform comes in Week 2)

No database yet. No teacher dashboard yet. Score results live in an in-memory `Map` on the server keyed by a UUID, looked up by the report page. This is throwaway plumbing that gets replaced by Supabase in Week 3 — do not over-engineer it.

---

## Tasks

### 1. Install dependencies

```bash
cd fluencyscope
npm install @deepgram/sdk @anthropic-ai/sdk uuid
npm install --save-dev @types/uuid
```

### 2. Wire MediaRecorder into the recording screen

Convert `app/read/recording/page.tsx` to a client component. On mount:

- Request microphone permission via `navigator.mediaDevices.getUserMedia({ audio: true })`. If denied, show a calm error state in serif type: *"We need your microphone to hear you read. Please allow access and refresh."*
- Once granted, instantiate `MediaRecorder` with `mimeType: 'audio/webm;codecs=opus'`. (Opus codec config tuning to 24 kbps mono is a Week 2 task — for now defaults are fine.)
- Start recording immediately when the component mounts. The student should never click a second "start recording" button — they already clicked "Start reading" on the previous screen.
- Track recording start time with `Date.now()` for duration calculation.

The pulsing dot UI from Part 1 stays exactly as-is. The "Tap when you're done" affordance now actually stops the recorder.

When the user taps to stop:
- Stop the MediaRecorder, collect the audio blob from `dataavailable`
- Compute `duration_seconds = (Date.now() - startTime) / 1000`
- Show a transient inline state: a slightly slower-pulsing dot in stone color with text *"Scoring your reading..."* in 14px stone italic. Do NOT navigate away yet.
- POST the audio blob + passage_id + duration to `/api/score` as `multipart/form-data`
- On success, the response includes `{ session_id }` — navigate to `/report/[session_id]`
- On failure, show an error state with a "Try again" button that re-records.

### 3. Build the scoring API route

Create `app/api/score/route.ts` as a POST handler. It accepts multipart form data with fields:
- `audio` (Blob)
- `passage_id` (string)
- `duration_seconds` (number)

The route does four things in sequence (the four-layer pipeline from ARCHITECTURE.md section 6.3):

**Layer 1 — Deepgram ASR.** Use `@deepgram/sdk` to transcribe with word-level timestamps. Settings:

```ts
const { result } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
  model: "nova-3",
  language: "en",
  smart_format: false,
  punctuate: false,
  utterances: false,
});
```

Extract the words array: `result.results.channels[0].alternatives[0].words`. Each word has `word`, `start`, `end`, `confidence`.

**Layer 2 — Alignment & error classification.** Implement in `lib/scoring/alignment.ts`. The job: align the spoken words against the expected passage words and classify each event.

Use Needleman-Wunsch sequence alignment (or a simpler dynamic-programming edit-distance approach). Inputs are two arrays of normalized words (lowercase, strip punctuation). Output is an array of events, one per *expected* word, with shape:

```ts
type EventType = "correct" | "substitution" | "omission" | "insertion" | "self_correction";

interface SessionEvent {
  word_index: number;          // position in the expected passage
  expected_word: string;
  spoken_word: string | null;  // null for omissions
  start_timestamp_ms: number | null;
  end_timestamp_ms: number | null;
  event_type: EventType;
  confidence_score: number | null;
}
```

Implement word normalization carefully: lowercase, strip leading/trailing punctuation, but preserve internal apostrophes (so "don't" stays "don't"). For self-correction detection: if a substitution is immediately followed (within 1.5s) by the correct word, classify the first as `self_correction` and the corrected utterance as `correct`. Insertions go in their own list, not the per-expected-word events.

**Layer 3 — WCPM and accuracy.** Compute in `lib/scoring/metrics.ts`:

- `correct_words` = count of events with `event_type === "correct"` OR `event_type === "self_correction"` (self-corrections count as correct per Hasbrouck-Tindal)
- `total_words_attempted` = expected words minus pure omissions at the end of the reading (if the student didn't finish, only count what they reached)
- `wcpm = Math.round((correct_words / duration_seconds) * 60)`
- `accuracy_percent = Math.round((correct_words / total_words_attempted) * 100)`

For the grade-band percentile, hard-code the Hasbrouck-Tindal Grade 6 spring norms: 50th percentile = 150 WCPM, 25th = 122, 10th = 89. Compute `percentile_band`:
- `success` if WCPM ≥ 150
- `warning` if 122 ≤ WCPM < 150
- `alert` if WCPM < 122

Store the actual percentile estimate too: linear interpolation between the closest two norm points, clamped to [1, 99].

**Layer 4 — Claude summary.** In `lib/scoring/summary.ts`. Send Claude a structured prompt with the WCPM, accuracy, percentile, top error patterns (group substitutions by suffix, e.g., "-tion words: 3/4 missed"), and the passage title. Use model `claude-sonnet-4-5`. Ask for exactly 2-3 sentences, doctor's-note tone, no preamble. Example:

```ts
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 200,
  messages: [{
    role: "user",
    content: `You are writing a brief teacher-facing summary of a 6th grader's oral reading fluency assessment. Write exactly 2-3 sentences, in the tone of a doctor's note: clinical, specific, useful. No preamble, no greetings. Mention the WCPM relative to the grade-6 spring benchmark of 150, the accuracy, and one specific pattern in the errors if any stands out. Do not mention the student by name.

Data:
- WCPM: ${wcpm} (benchmark: 150)
- Accuracy: ${accuracy}%
- Percentile: ${percentile}
- Top error patterns: ${JSON.stringify(errorPatterns)}
- Passage: "${passageTitle}"

Write the summary now.`
  }],
});
```

**Storage.** Maintain a module-level `Map<string, ScoredSession>` in `lib/scoring/store.ts`. Generate a UUID, write the result, return `{ session_id: uuid }`. **Important:** Next.js may HMR / hot-reload this map away in dev — that's fine for V1 demo. In production this gets replaced by Supabase in Week 3.

### 4. Build the report view

Create `app/report/[id]/page.tsx`. Server component that reads the session from the in-memory store; if not found, render a 404-style "Reading not found" message in serif type.

The layout, top to bottom on a `paper` background, max-width 720px centered, generous vertical rhythm:

**Header block.**
- 14px stone, slightly loose letter-spacing: `april 25 · 2:14 pm` (use the actual session timestamp)
- Below it, in Source Serif 4 32px weight 600: the passage title
- Below that, 14px stone: `Reading assessment`

**The headline number.** This is THE number. Make it huge.

- The WCPM in 96px Inter weight 600 (the `display` token from Part 1, but bumped up). Single line. Color: `ink`.
- Directly to the right of it, baseline-aligned bottom, in 18px stone: `WCPM`
- Below the number, in 16px stone: `${percentileEstimate}th percentile · grade 6 spring`

**The percentile bar.** A single horizontal bar, 6px tall, full container width, `mist` background, with a colored fill (success/warning/alert per band) ending at the percentile point. No axis labels, no numbers, no ticks. Just a bar. 8px border-radius.

**Accuracy.** Below the percentile bar, in 16px ink: `${accuracy}% accuracy` followed by a subtle dot separator and `${correct_words} of ${total_words} words correct` in stone. One line.

**The transcript.** Set in Source Serif 4 24px line-height 1.6, just like the original passage. Render every word in `ink`, EXCEPT:
- Words with `event_type === "substitution"` or `"omission"`: render in `alert` color with a subtle dotted underline (CSS `border-bottom: 1px dotted`)
- Words with `event_type === "self_correction"`: render in `warning` color, no underline
- Hover state on error words: show the `spoken_word` in a small tooltip-style inline pill (use a simple title attribute for V1; proper tooltips come later)

Generous padding above and below this block (at least 64px).

**The summary.** A single paragraph in Source Serif 4 18px weight 400 line-height 1.6, italic, color ink. The paragraph is wrapped in a left border: 2px solid mist, padding-left 24px. This is the "doctor's note" treatment.

**Audio playback.** Below the summary, a basic `<audio controls>` element, full width. Real waveform with error dots is Week 2. For now, a clean default audio element is fine — but style it minimally if Chrome's default UI is ugly.

**Below the fold.** A small footer, 12px stone:
`Scored in ${scoringDurationSeconds}s · Confidence: ${avgConfidence}%`

This footer is for you (the developer) more than the teacher — useful for debugging.

### 5. Wire audio storage

The audio blob needs to be persisted somewhere the report page can serve it. For V1 demo:
- Save the audio blob to a file in `/tmp/fluencyscope-audio/${session_id}.webm` on the server when the score endpoint runs
- Add a separate route `app/api/audio/[id]/route.ts` that streams the file back with `Content-Type: audio/webm`
- The report page references this URL in its `<audio>` element

Yes, this is throwaway. Yes, it doesn't survive serverless cold starts. That's fine — Week 3 replaces it with Supabase Storage. Document this with a comment at the top of the audio route.

### 6. Done screen → report navigation

Update `app/read/done/page.tsx`. Read the `session_id` from URL search params (e.g., `/read/done?s=abc-123`). Below the existing "Nice work" text, add a small link in 14px stone with low opacity: *"View report →"*. The link goes to `/report/[id]`.

This link is for the demo only and should look deliberately like a backstage door. In production this won't exist — students never see their own reports. Add a `// TODO: remove in Week 3` comment.

When the recording screen successfully scores a reading, navigate to `/read/done?s=${session_id}` instead of `/read/done`.

### 7. End-to-end test

Run `npm run dev`. From an incognito window:
- Navigate to `/`
- Type a name (the input from Part 1 still works)
- Read the passage out loud while recording
- Tap the dot to stop
- Wait for scoring (~5-15 seconds for a 60-second reading)
- Click "View report →" on the done screen
- Verify the report renders with a real WCPM number, real accuracy, real Claude summary, and the audio plays back

If the WCPM seems wildly off (e.g., 0 or 500+), debug the alignment algorithm before stopping. The number must be in a believable range (50-300 WCPM) for the demo to work.

### 8. Deploy to Vercel (best-effort)

Try to deploy:
```bash
npx vercel --yes
```

If the user is not logged in to Vercel CLI, the command will fail with an auth prompt. In that case, **stop and report back** — do not attempt to log in on their behalf. The user will deploy manually.

If deploy succeeds, set the environment variables on Vercel:
```bash
npx vercel env add DEEPGRAM_API_KEY production
npx vercel env add ANTHROPIC_API_KEY production
```

Again, if these prompt for input, halt and report.

---

## Output

Report back with:
1. End-to-end test results (your own WCPM if you tested, or "user must test" if you couldn't)
2. Any deviations from this spec
3. Any genuine blockers
4. The dev server URL and (if deployed) the production URL

## Quality bar

The Friday gut-check from the checklist: *"Read a passage yourself. Does the report make YOU gasp?"* If the layout is generic, if the WCPM number isn't huge enough, if the percentile bar looks like a generic progress bar, iterate. The static screens looked beautiful after Part 1; the report needs to clear the same bar.
