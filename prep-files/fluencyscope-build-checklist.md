# FluencyScope Build Checklist

> 6-week sprint to a working V1 with one pilot school. Demo-down build order: ship the magic moment first (a student reads, AI scores, teacher sees a beautiful report), build the foundation under it. Open this file every Monday.

---

## Week 1 — The reading-to-report magic moment (standalone)

**Goal:** A student reads a passage aloud in the browser, ~30 seconds later a beautiful report renders. No login. No DB. No teacher dashboard. Demoable by Friday.

- [ ] Initialize Next.js 15 project (App Router, TypeScript, Tailwind)
- [ ] Install shadcn/ui, set up base components (Button, Card, Input)
- [ ] Choose font pairing (Inter/Geist for UI, Source Serif/Tiempos for passages)
- [ ] Set design tokens per DESIGN.md (ink, paper, mist, stone, accent)
- [ ] Hard-code one grade-6 passage from Achieve the Core packet
- [ ] Build student reading screen (passage + Start Reading button)
- [ ] Wire MediaRecorder API to capture audio in browser
- [ ] Wire Deepgram API call with word-level timestamps
- [ ] Build the alignment algorithm (diff transcript vs. expected passage)
- [ ] Compute WCPM + accuracy from alignment output
- [ ] Wire Claude API to generate 2-sentence teacher summary from structured data
- [ ] Build report view (WCPM headline, accuracy, errors highlighted in transcript)
- [ ] Deploy to Vercel under temporary URL

**Friday gut-check:** Read a passage yourself. Does the report make YOU gasp? If not, polish until it does.

---

## Week 2 — The full student flow + audio playback (standalone)

**Goal:** Polish the student experience to feel like Apple Books, not edtech. Add audio playback with timestamped error markers.

- [ ] Student landing page (`/read/[token]`) — name input, no auth
- [ ] Smooth page transitions between landing → pre-reading → reading → done (Framer Motion)
- [ ] Recording state: pulsing dot, no giant red circle
- [ ] "Done" screen — soft animation, "Nice work," no scores
- [ ] Waveform visualization in report (WaveSurfer.js or similar)
- [ ] Error markers as accent dots on waveform — tap to scrub to that timestamp
- [ ] Synced transcript below waveform — tap word to scrub
- [ ] Soft tick sound when recording starts, gentle chime on submit
- [ ] Full Chromebook viewport testing (real device, not just DevTools)
- [ ] Microphone permission flow tested cold
- [ ] Configure MediaRecorder with Opus codec at ~24 kbps mono
- [ ] Buffer audio chunks to IndexedDB as student reads (survive mid-reading WiFi drop)
- [ ] Upload audio with retry + exponential backoff (3 retries before giving up)
- [ ] If upload fails: persist blob in IndexedDB, show "We'll save when you're back online"

**Friday gut-check:** Sit a real 12-year-old in front of it. Watch their face. If they look anxious or confused, iterate.

---

## Week 3 — Schema + auth + persistence

**Goal:** Wire weeks 1–2 to a real database. Real teacher accounts, real assessments, multi-tenant from day one.

- [ ] Set up Supabase project
- [ ] Write all migrations (8 core tables — see ARCHITECTURE.md section 5)
- [ ] Set up RLS policies for every table (school_id scoping)
- [ ] Configure Supabase Auth (email/password for V1)
- [ ] Teacher signup → create school → create first assessment flow
- [ ] Seed `passages` table with 10 grade-6 passages from Achieve the Core
- [ ] Wire Week 1 reading flow to write `sessions` + `session_events` rows
- [ ] Wire Week 1 scoring pipeline to read passages from DB, write scores back
- [ ] Background job: when audio uploads, trigger scoring pipeline (Supabase Edge Function or Vercel cron)
- [ ] Audio storage in Supabase Storage with RLS
- [ ] Generate URL-safe `share_token` for each assessment

---

## Week 4 — Teacher dashboard

**Goal:** A list of completed readings that feels like Linear, not a gradebook.

- [ ] Dashboard page: vertical list of completed sessions (no tables)
- [ ] Each row: student name, time, class label, tiny inline waveform
- [ ] Sort by most recent first; filter by class label
- [ ] Click row → expand inline (Linear-style), no modal
- [ ] Empty state: serif type, "No readings yet," with Create assessment button
- [ ] Assessment creation flow: pick passage → pick mode (screening/PM) → set class label → generate link
- [ ] Copy-link button with success toast
- [ ] Notification when new readings come in (subtle, non-intrusive)

---

## Week 5 — The report view

**Goal:** This is the screen that sells the product. NYT-article quality.

- [ ] Big WCPM headline with grade-band percentile
- [ ] Soft horizontal percentile bar (green/yellow/red) — no axis labels
- [ ] Four MDFS prosody gauges (Expression, Phrasing, Smoothness, Pace) — 1-4 dot indicators
- [ ] Full-width audio waveform with error dots
- [ ] Synced transcript with errors highlighted inline
- [ ] AI-generated 2-3 sentence teacher summary in 18px serif
- [ ] Override button tucked in corner — click any score to edit
- [ ] Override edits write to `teacher_review_status = "edited"` and log original value
- [ ] Top 3 error patterns (multisyllabic, function words, etc.) computed from session_events
- [ ] Print-friendly view for parent conferences

---

## Week 6 — Polish + first pilot

**Goal:** The difference between "nice prototype" and "Eileen wants this in her school next week."

- [ ] Loading states with skeletons (never spinners)
- [ ] Error states with recovery actions ("Microphone blocked? Try this.")
- [ ] Page transitions smooth across every flow
- [ ] Soft animations on score reveal, dot pulses on recording
- [ ] Keyboard shortcuts: Cmd+K command palette (V1: just create assessment + search)
- [ ] PWA manifest + service worker (cache student route + passage assets)
- [ ] Bundle size audit on student route — must be under 200 KB JS
- [ ] Lazy-load waveform, charts, and Framer Motion sequences off the student flow
- [ ] Test full reading flow on a real NYC-spec Chromebook with throttled WiFi
- [ ] Cross-browser test (Chrome focus, Safari/Firefox spot-check)
- [ ] Sit Eileen down with the prototype, watch her use it cold
- [ ] Sit a real 6th grader down, watch them use it cold
- [ ] Iterate based on both reactions
- [ ] Deploy to production URL with custom domain
- [ ] Write 1-page principal-facing memo: what it does, what it costs, ERMA timeline

---

## What to NOT build in any of these weeks

If you find yourself reaching for any of these, stop:

- Comprehension questions · Tutoring or practice mode · Curriculum or instruction · Parent portal · Mobile native apps · K-5 grades · High school grades · Multi-language passages · Roster integration · Google SSO · Clever integration · Gradeloom integration · MTSS documentation generation · Intervention recommendations · Class analytics · Longitudinal trend graphs · Teacher-to-teacher sharing · Admin dashboards · Comment banks · IEP/504 fields · ELL accommodations mode · Custom passage upload by teachers

These are all on the V2-V5 roadmap. None get touched before the first pilot.

---

## Parallel track (start Week 1, finish by Week 12)

ERMA is a 3-month gate. Run it alongside the build, not after.

- [ ] Get a friendly principal (Eileen) to commit to initiating ERMA
- [ ] Draft data processing agreement (FERPA + Ed Law 2-d compliant — same template as Gradeloom)
- [ ] Complete OneTrust vendor questionnaire (8 sections, AI disclosure)
- [ ] Submit OTI Cloud Review request
- [ ] Document AI bias mitigation: dialectal variation as non-error, no PII in training, audio retention 90-day default
- [ ] Begin Google OAuth verification process for V2 Classroom integration

---

## Parallel track #2 — Speech accuracy validation

The product fails if Deepgram can't handle NYC student voices. Validate this early, not late.

- [ ] Week 1: collect 5 self-recordings to baseline Deepgram accuracy
- [ ] Week 2: collect 10 readings from a friendly school (private/charter to skip ERMA gate)
- [ ] Week 3: evaluate WER (Word Error Rate) across speakers — flag if >15%
- [ ] If WER too high: A/B test AssemblyAI and SoapBox Labs as backups
- [ ] Week 4: validate against AAVE, Spanglish, newcomer accents specifically — these must NOT score as errors

---

## The litmus test for every decision

> *"Does this make the student's reading experience calmer, or make the teacher's report faster to act on?"*

If yes, build it. If no, defer. If unsure, ship the simpler version.

---

## Demo script for Eileen (rehearse before Week 6)

Six minutes, four moments:

1. **The link.** "Eileen, here's a link. Imagine you just shared this with Maya in Period 3." (15 seconds)
2. **The student flow.** Open the link, type a name, read the passage live. (90 seconds)
3. **The wait.** "While that's processing, let me show you what you'll see in 30 seconds." (open dashboard, show empty state, show how clean it is) (60 seconds)
4. **The report.** New reading appears. Click in. Show WCPM. Show prosody. Play audio. Click an error dot, jump to that moment. Read the AI summary aloud. (3 minutes)
5. **The close.** "This took 4 minutes of student time and zero of yours. You did 30 of these last quarter, didn't you?" (30 seconds)

If she says "I want this in my school next month," you've won.
