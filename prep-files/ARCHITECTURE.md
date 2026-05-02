# Reading Assessment Tool — Architecture

**Working name:** TBD (placeholder: "FluencyScope")
**Owner:** ABCHESS / Kanat
**Status:** V1 — proof of concept
**Last updated:** April 25, 2026

---

## 1. What we're building

A web app for NYC middle school (grades 6–8) teachers to assess oral reading fluency in struggling readers — without the teacher having to sit 1:1 with each student.

A student opens a link on a Chromebook, reads a passage aloud for ~60 seconds, and the app generates a fluency report against established frameworks (Hasbrouck-Tindal ORF norms, Rasinski's Multidimensional Fluency Scale).

**The scalpel principle:** This tool does two jobs exceptionally well — fluency screening and progress monitoring — and deliberately avoids becoming a broad literacy platform. It does NOT do tutoring, comprehension instruction, curriculum, or full MTSS workflows. Those belong to bigger incumbents (iReady, Amira, Lexia).

---

## 2. The two jobs the app does

1. **Screening** — 3× per year benchmark check against grade-level norms
2. **Progress monitoring** — weekly/biweekly short probes for Tier 2/3 students between benchmarks

Same engine, same UX, different cadence. No separate product.

---

## 3. Frameworks the app scores against

| Framework | What it measures | How the app uses it |
|---|---|---|
| **Hasbrouck & Tindal 2017 ORF Norms** | Words Correct Per Minute (WCPM) by grade and season | Quantitative score → percentile band (green/yellow/red) |
| **Rasinski Multidimensional Fluency Scale (MDFS)** | Expression/volume, phrasing, smoothness, pace (each scored 1–4) | Qualitative prosody score from acoustic features |
| **Achieve the Core 6–8 Fluency Packet** | 41 grade-band passages | Free, validated passage library for V1 |
| **NYS Next Gen Standards NY-6/7/8.RF.4** | Grade-band fluency requirements | Standards alignment for reports and (later) Gradeloom |

---

## 4. User experience

### 4.1 Teacher experience (V1)

1. Logs in with email + password
2. Picks a passage from the library (filtered by grade)
3. Clicks "Create assessment" → app generates a unique shareable link
4. Optionally adds a class label (e.g., "Period 3 ELA")
5. Copies link, pastes into Google Classroom / email / wherever
6. Receives notification when readings come in
7. Opens the report dashboard:
   - WCPM with grade-band percentile (green/yellow/red against Hasbrouck-Tindal)
   - Accuracy %
   - Rasinski 4-dimension prosody score
   - Top 3 error patterns (e.g., "struggled with multisyllabic Tier 2 vocab")
   - LLM-generated 2–3 sentence summary
   - Audio playback with synced transcript and tappable error markers
8. Can override any score with one click (overrides logged for future calibration)

### 4.2 Student experience (V1)

1. Clicks the link the teacher shared
2. Lands on a clean screen: "Type your first and last name"
3. Types name, taps "Start"
4. Sees the passage on screen + a big "Start Reading" button
5. Reads aloud while audio records in the browser
6. Taps "Done"
7. Sees "Great job!" — they're finished

No login, no account, no email, no password. The student types their name once. The teacher identifies them in the dashboard by name + class label.

---

## 5. Data model

Multi-tenant from day one. Every record has a `school_id`. Row-level security (RLS) in Supabase enforces tenant isolation. Even though V1 has one school, the schema does not change in V2–V5.

### Core tables

```
schools
  id (uuid)
  name
  district
  created_at

teachers
  id (uuid)
  school_id (fk → schools)
  email
  full_name
  auth_provider_id (null for V1 email/password; populated when SSO is added)
  created_at

students
  id (uuid)
  school_id (fk → schools)
  first_name
  last_name
  grade            (nullable in V1; populated from roster import in V2)
  external_id      (nullable; STARS/Classroom/Clever ID when integrated)
  auth_provider_id (null for V1; populated when student SSO is added in V3)
  created_at

passages
  id (uuid)
  title
  text                  (full passage content)
  grade_band            (e.g., "6-8")
  word_count
  lexile               (nullable)
  source_attribution   (e.g., "Achieve the Core Fluency Packet")
  curriculum_unit      (nullable; e.g., "EL Education G6 Module 2")
  created_at

assessments
  id (uuid)
  school_id (fk → schools)
  teacher_id (fk → teachers)
  passage_id (fk → passages)
  class_label           (free text, e.g., "Period 3 ELA")
  share_token           (URL-safe random string, used in shareable link)
  mode                  ("screening" | "progress_monitoring")
  expires_at            (nullable)
  created_at

sessions
  id (uuid)
  assessment_id (fk → assessments)
  student_id (fk → students)        — created on submission, V1 just from typed name
  audio_url                          (path in Supabase Storage)
  transcript                         (full ASR output)
  duration_seconds
  status                             ("pending" | "processing" | "complete" | "failed")
  scores_json                        (denormalized scores for fast display)
  teacher_review_status              ("unreviewed" | "approved" | "edited")
  created_at
  scored_at

session_events
  id (uuid)
  session_id (fk → sessions)
  word_index                         (position in passage, 0-indexed)
  expected_word
  spoken_word                        (nullable for omissions)
  start_timestamp_ms
  end_timestamp_ms
  event_type                         ("correct" | "substitution" | "omission" | "insertion" | "self_correction" | "pause")
  confidence_score                   (ASR confidence, 0–1)
```

`session_events` is the gold table. One row per word per reading. From it you can derive WCPM, accuracy, prosody features, error patterns, longitudinal trends, and any future feature. Build it right in V1, never refactor it.

### Why this schema survives V1 → V5

- **V1:** Students don't log in. Student records are created when their name is typed. `auth_provider_id` is null.
- **V2:** Teacher imports roster from Google Classroom → students table populates with `external_id` and `grade`. Same schema.
- **V3:** ERMA approved, Google SSO added for teachers and (optionally) students. `auth_provider_id` gets populated. Schema unchanged.
- **V4:** Clever Library integration adds another auth provider. Same schema.
- **V5:** Gradeloom reads `sessions.scores_json` and surfaces it as standards-tagged grades. No schema change.

---

## 6. Technical architecture

### 6.1 Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (React)** as a PWA | Same stack as Gradeloom; PWA handles flaky NYC school WiFi |
| Hosting | **Vercel** | Same as Gradeloom; fast deploys, edge functions |
| Database | **Supabase (Postgres)** | Same as Gradeloom; RLS for multi-tenancy out of the box |
| Storage | **Supabase Storage** | Audio files, encrypted at rest |
| Auth (V1) | **Supabase Auth** (email + password) | Simplest possible for prototype |
| Audio capture | Browser **MediaRecorder API** | Native, no plugins, Chromebook-compatible |
| Speech-to-text | **Deepgram** (or AssemblyAI as fallback) | Word-level timestamps, better kid-voice accuracy than Whisper |
| LLM (summaries) | **Claude API** | For pattern interpretation and teacher-facing summaries only |
| Scoring engine | Custom Node service on Vercel | Deterministic alignment + prosody feature extraction |

### 6.2 High-level architecture diagram

```
[Chromebook Browser]
  └── Next.js PWA (Vercel)
        ├── Teacher login (Supabase Auth)
        ├── Student link landing page (no auth)
        ├── MediaRecorder API → local audio buffer
        └── Upload audio + metadata to Supabase
              ↓
[Supabase]
  ├── Postgres (schools, teachers, students, passages, assessments, sessions, session_events)
  ├── Storage (audio files, encrypted)
  ├── RLS policies (tenant isolation by school_id)
  └── Webhook triggers scoring pipeline on audio upload
              ↓
[Scoring Pipeline — Node service on Vercel]
  ├── Layer 1: Deepgram ASR call → word-timestamped transcript
  ├── Layer 2: Alignment & error detection (deterministic diff algorithm)
  ├── Layer 3: Prosody feature extraction → MDFS scoring
  ├── Layer 4: Claude API → teacher summary + error pattern insights
  └── Write results back to Supabase (session_events, sessions.scores_json)
              ↓
[Teacher Dashboard — same Next.js app]
  ├── Assessment creation + link generation
  ├── Completed sessions list (sorted by name, class, time)
  ├── Individual student reports + audio playback
  └── (V3+) Longitudinal trend view for progress monitoring
```

### 6.3 The AI scoring pipeline — four layers

Each layer does one thing well. Don't conflate them.

| Layer | What it does | Tech | Why this layer |
|---|---|---|---|
| **1. Speech-to-text** | Audio → word-timestamped transcript | Deepgram (third-party) | Word-level timestamps are non-negotiable for everything downstream |
| **2. Alignment & error detection** | Diff transcript vs. expected passage; classify each word event | Deterministic code, no AI | AI here makes things less reliable; this is just careful diff |
| **3. Prosody scoring** | Acoustic features → Rasinski MDFS 4-factor score | Signal processing + small ML model | Rules-based in V1; fine-tuned model later as data accumulates |
| **4. Pattern interpretation** | Structured data → teacher-facing summary | Claude API | LLMs only see structured event data, never raw audio or PII |

### 6.4 AI guardrails (non-negotiable from day one)

- No student audio, transcripts, or PII ever sent to model training. Period.
- Every AI-generated insight is teacher-reviewable and overridable in one click.
- Confidence scores shown for prosody and pattern claims; when the model is unsure, it says so.
- Audio retention policy: 90 days default, configurable per school, deletable on request.
- Bias mitigation: dialectal variation (AAVE, Spanglish code-switching, Caribbean Englishes, newcomer accents) treated as non-error by design.

### 6.5 Chromebook performance & network resilience

NYC school Chromebooks are CPU- and RAM-constrained, and school WiFi drops frequently. The student flow must be fast and survive bad connections. These patterns are non-negotiable.

**Audio capture**
- `MediaRecorder` with Opus codec at ~24 kbps mono. A 90-second reading is ~270 KB — uploads even on degraded WiFi.
- Buffer audio chunks locally in **IndexedDB** as the student reads. If WiFi drops mid-reading, the recording survives.
- No real-time ASR streaming in V1. Capture the full file, upload once, score server-side.

**Frontend performance**
- Ship as a **PWA with a service worker** so the student page loads instantly on repeat visits and works on a degraded connection.
- Bundle size budget: **under 200 KB JS for the student route**. Lazy-load everything else.
- Skip heavy dependencies on the student flow — no waveform rendering, no charts, no heavy Framer Motion sequences during reading. Rich UI lives on the teacher dashboard which runs on better hardware.
- Pre-load the passage text into the page on initial load — never fetch it after the student clicks "Start."

**Network resilience**
- Upload audio as a background task with retry + exponential backoff. Show "Saved!" only after server confirms.
- If upload fails after 3 retries, persist the audio blob in IndexedDB and show "We'll save this when you're back online." Student can walk away; teacher sees the reading whenever connectivity returns.
- Scoring pipeline is async — the student never waits for it. They submit and leave.

**Teacher dashboard**
- Render incrementally. Show the session list as soon as it loads; lazy-load each report's audio + waveform only when the teacher clicks a row.
- Cache scored reports aggressively — they don't change once finalized.

The single biggest win: **local audio buffering in IndexedDB**. One pattern, ~half a day of work, solves the majority of the WiFi-failure failure modes.

---

## 7. Authentication strategy by version

| Version | Teacher auth | Student auth | Rostering source |
|---|---|---|---|
| **V1 (now)** | Email + password (Supabase Auth) | None — typed name on landing page | None — manual |
| **V2** | Email + password | None — typed name; matched against imported roster | Google Classroom API (teacher-side) |
| **V3** | Google SSO (`@schools.nyc.gov`) | Optional Google SSO (`@nycstudents.net`); link flow remains default | Google Classroom API |
| **V4** | Google SSO + Clever Library SSO | Optional Clever SSO; link flow remains default | Google Classroom API + Clever Library |
| **V5** | All of the above + LTI 1.3 | All of the above | + Clever Secure Sync (district-managed) |

**The link-based assessment flow is the primary student experience forever.** SSO is layered on top as an option, never as the only path. This is a competitive advantage — substitute teachers, push-in interventionists, and after-school programs can use the tool without rostered students.

---

## 8. Compliance & deployment by version

| Version | Compliance milestone | What it unlocks |
|---|---|---|
| V1 | None (single private school or pilot tenant) | Concept proof, ~50 readings |
| V2 | ERMA submission initiated by friendly principal | NYC DOE pilot deployment |
| V3 | ERMA approved + Google OAuth verification complete | NYC DOE production: `@schools.nyc.gov` and `@nycstudents.net` users can sign in |
| V4 | Clever Library partner approval | Multi-district expansion outside NYC |
| V5 | Clever Complete + SOC 2 Type II + state-level vendor approvals | District-wide top-down deployments, LTI integration |

---

## 9. Build sequence — V1

1. **Project setup** — Next.js + Supabase + Vercel deploy (1 day)
2. **Auth** — Supabase email/password for teachers (1 day)
3. **Passage library** — seed 10 grade-6 passages from Achieve the Core Fluency Packet (½ day)
4. **Assessment creation flow** — teacher picks passage → generates share token → shareable URL (1 day)
5. **Student landing page** — link → name entry → passage display → "Start Reading" (2 days)
6. **Audio recording** — MediaRecorder API, local buffering, upload to Supabase Storage (2–3 days)
7. **Scoring pipeline — Layer 1** — Deepgram integration, word-timestamped transcript stored in `session_events` (3 days)
8. **Scoring pipeline — Layer 2** — alignment algorithm, error classification, WCPM + accuracy calculation (4 days)
9. **Scoring pipeline — Layer 3** — prosody features → Rasinski MDFS rules-based scorer (5 days)
10. **Scoring pipeline — Layer 4** — Claude API integration for teacher summary + error patterns (2 days)
11. **Teacher dashboard** — completed sessions list + individual report view + audio playback with timestamps (5 days)
12. **Polish, end-to-end testing, deploy to first pilot school** (3 days)

**Total: ~5–6 weeks** for a working V1 with one developer focused on it.

---

## 10. Out of scope for V1 (deliberately)

To keep this a scalpel and not let scope creep murder it:

- ❌ Tutoring / practice mode
- ❌ Comprehension questions
- ❌ Curriculum or instruction
- ❌ Parent portal
- ❌ Mobile app (Chromebook is the device; web works fine)
- ❌ K-5 grades
- ❌ High school grades
- ❌ Multi-language passages
- ❌ Roster integration (V2)
- ❌ SSO of any kind (V3)
- ❌ Clever (V4)
- ❌ Gradeloom integration (V5)
- ❌ MTSS documentation generation
- ❌ Intervention recommendations engine

When customers ask for these, the answer is "yes, on the roadmap" or "no, that's a different tool." Never "yes, let me add it now."

---

## 11. Long-term product family fit

This tool is one of three sibling products under the same NYC edtech portfolio:

- **Observly** — voice-first teacher observation tool (live)
- **Gradeloom** — integrated standards-tagged gradebook (in development)
- **FluencyScope (this tool)** — voice-first student fluency assessment (V1 in build)

Shared infrastructure across all three:
- Vercel + Next.js + Supabase stack
- Audio capture and ASR pipeline (Observly + FluencyScope)
- Multi-tenant school/teacher data model
- ERMA submission family (one approval covers the family architecture)
- Eventually: shared SSO and rostering layer (V3+)

The fluency tool feeds Gradeloom in V5: fluency scores become standards-tagged assessment events under NY-6/7/8.RF.4.

---

## 12. The honest summary in one paragraph

A web app on Chromebooks. Teachers create assessments and share links. Students click, type their name, read aloud for a minute, and submit. AI scores the reading against Hasbrouck-Tindal and Rasinski frameworks and produces a teacher report with audio playback and timestamped error markers. V1 ships in 5–6 weeks with no SSO, no rostering, no compliance overhead. V2–V5 add Google Classroom rostering, ERMA approval, Google SSO, Clever, and Gradeloom integration in that order — without ever changing the database schema or the core student experience. The tool stays a scalpel by deliberately refusing to become a literacy platform, and it wins by being the one thing NYC middle schools can buy that actually measures what NY-6/7/8.RF.4 actually requires.
