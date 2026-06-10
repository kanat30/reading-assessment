# FluencyScope

A web app for middle-school teachers to assess oral reading fluency without sitting 1:1 with each student.

A teacher picks a passage and generates a shareable link. A student opens the link on a Chromebook, types their name, reads the passage aloud for ~60 seconds while the browser records audio, and submits. The app transcribes the audio, aligns it against the expected text, scores fluency, and produces a teacher report with audio playback, a synced transcript, timestamped error markers, and an LLM-written summary.

It scores against established frameworks:

- **Hasbrouck & Tindal ORF norms** — Words Correct Per Minute (WCPM) → grade-band percentile (above / approaching / below).
- **NAEP / Rasinski-style prosody** — a 1–4 multidimensional fluency level (expression, phrasing, pace).
- **Comprehension** — short literal/inferential questions, auto-graded with partial credit.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19, as a PWA (Serwist service worker) |
| Hosting | Vercel |
| Database / Auth / Storage | Supabase (Postgres + RLS, Supabase Auth, Supabase Storage) |
| Audio capture | Browser `MediaRecorder` API, buffered locally before upload |
| Speech-to-text | Deepgram (`nova-3` model), word-level timestamps |
| LLM | Claude API (`@anthropic-ai/sdk`) — summaries, comprehension grading, question generation |
| Styling | Tailwind CSS v4, shadcn/Base UI components, Framer Motion |
| Waveform | wavesurfer.js |

The scoring engine (alignment, metrics, prosody, error patterns) is **deterministic code**, not AI. The LLM only ever sees structured event data and text — never raw audio.

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (run the migrations in `supabase/migrations/`)
- Deepgram and Anthropic API keys

### Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=        # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=       # Supabase service role key (server-only)
SUPABASE_ACCESS_TOKEN=           # Supabase CLI token (for migrations/scripts)
DEEPGRAM_API_KEY=                # Deepgram ASR
ANTHROPIC_API_KEY=               # Claude API
```

### Run

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm run start    # serve production build
npm run lint     # eslint
```

## Project structure

```
app/
  api/                 Route handlers (scoring, comprehension, overrides, notes, templates, audio)
  auth/                Login / signup (Supabase Auth)
  dashboard/           Teacher dashboard — assessments & sessions list
  admin/               Admin console + analytics
  read/[token]/        Student flow: name entry → recording → comprehension → done
  report/[id]/         Teacher report view (+ print view)
  sw.ts                Serwist service worker (PWA)
lib/
  scoring/             Deterministic engine: alignment, metrics, prosody, patterns, summary, comprehension
  supabase/            Browser / server / admin Supabase clients
  analytics/           Dashboard analytics queries & recommendations
  audio/               Audio buffer, upload, sound effects
components/            Report UI, transcript, waveform, override popovers, etc.
hooks/                 useWaveSurfer, useCountUp, useIntersectionObserver, useReducedMotion
supabase/migrations/   Ordered SQL migrations (schema + RLS)
scripts/               One-off maintenance scripts (run with tsx)
prep-files/            Background planning docs (architecture, design, build checklist)
```

## The scoring pipeline

When a student submits, `POST /api/score` runs server-side (async — the student never waits):

1. **ASR** — Deepgram transcribes the audio with word-level timestamps.
2. **Alignment** — diff the transcript against the expected passage; classify each word as correct, substitution, omission, insertion, self-correction, or mispronunciation.
3. **Metrics** — WCPM, accuracy %, percentile band.
4. **Prosody** — acoustic/timing features → a 1–4 fluency level.
5. **Error patterns** — group errors (e.g. multisyllabic words, suffixes, function words).
6. **Summary** — Claude writes a short teacher-facing summary from the structured data.

Results are written back to `sessions` and `session_events`. Teachers can override any AI decision (word-level events, comprehension grades, prosody) from the report; overrides are stored separately and metrics recompute.

## Data model

Multi-tenant by `school_id` with Supabase Row-Level Security. Core tables: `schools`, `teachers`, `students`, `passages`, `assessments`, `sessions`, `session_events`, plus `session_event_overrides`, `passage_questions`, `assessment_templates`, and session notes/review state. See `supabase/migrations/` for the authoritative schema; `prep-files/ARCHITECTURE.md` has design rationale.

## Deployment

Deployed on Vercel. Push to the default branch deploys; set the environment variables above in the Vercel project settings.
