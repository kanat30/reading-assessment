# FluencyScope — Week 3 Build Prompt

You are a coding agent with terminal and filesystem access. Weeks 1 and 2 have shipped: a polished student flow with resilient audio capture, a Deepgram + Claude scoring pipeline, and a beautiful report view at `./fluencyscope`. Score results currently live in an in-memory `Map` and audio in `/tmp/`. None of it survives a server restart.

Week 3 is the foundation week. By end of week, the app is multi-tenant from day one with real teacher accounts, real assessments, real persistence — and the schema does not change again from V1 → V5.

Work autonomously. Stop only on genuine blockers.

---

## Prerequisites — confirm before starting

The user has created a Supabase project and placed these in `fluencyscope/.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The Deepgram and Anthropic keys from Week 1 should still be present. If `.env.local` is missing the Supabase variables, **stop and report back**.

---

## What you are building

The architecture from ARCHITECTURE.md sections 5 and 6 becomes real:

- 8 Postgres tables with row-level security scoped by `school_id`
- Supabase Auth with email/password for teachers
- A teacher signup flow that creates the school, the teacher, and lands them on a "create your first assessment" empty state
- Assessment creation: pick passage → pick mode → set class label → generate share token → copy URL
- The student flow now writes to real tables (`sessions`, `session_events`)
- The scoring pipeline reads passages from the DB and writes results back
- Audio storage moves from `/tmp/` to Supabase Storage with proper RLS
- Background scoring is triggered by an upload webhook, not synchronously in the request handler

There is **no teacher dashboard yet** — that's Week 4. After this week, the teacher signs up, creates an assessment, copies the link, watches a student read it, and has to hit `/report/[id]` directly via URL to see the result. That's fine. We're not building UX this week; we're building bones.

---

## Tasks

### 1. Install dependencies

```bash
cd fluencyscope
npm install @supabase/supabase-js @supabase/ssr
```

### 2. Set up the Supabase client

Create three client helpers per Supabase's SSR conventions:

- `lib/supabase/browser.ts` — for client components (uses anon key)
- `lib/supabase/server.ts` — for server components and route handlers (uses anon key with cookie session)
- `lib/supabase/admin.ts` — for the scoring pipeline only (uses service role key, bypasses RLS)

Follow the patterns from Supabase's official Next.js docs. The middleware piece is critical — create `middleware.ts` at the project root that refreshes the auth session on every request.

### 3. Write the migrations

Create `supabase/migrations/0001_initial_schema.sql` with all 8 tables exactly per ARCHITECTURE.md section 5. Verbatim columns and types — do not invent fields. Quick reference:

- `schools` (id, name, district, created_at)
- `teachers` (id, school_id, email, full_name, auth_provider_id, created_at)
- `students` (id, school_id, first_name, last_name, grade nullable, external_id nullable, auth_provider_id nullable, created_at)
- `passages` (id, title, text, grade_band, word_count, lexile nullable, source_attribution, curriculum_unit nullable, created_at)
- `assessments` (id, school_id, teacher_id, passage_id, class_label, share_token, mode, expires_at nullable, created_at)
- `sessions` (id, assessment_id, student_id, audio_url, transcript, duration_seconds, status, scores_json, teacher_review_status, created_at, scored_at)
- `session_events` (id, session_id, word_index, expected_word, spoken_word, start_timestamp_ms, end_timestamp_ms, event_type, confidence_score)

All `id` columns are `uuid` with default `gen_random_uuid()`. Timestamps are `timestamptz` defaulting to `now()`. `share_token` on assessments has a UNIQUE constraint and an index. `session_events.session_id` has an index. `assessments.school_id` and `sessions.assessment_id` have indexes for the dashboard queries we'll write in Week 4.

For the enum-like columns:
- `sessions.status` text with check constraint: `('pending', 'processing', 'complete', 'failed')`
- `sessions.teacher_review_status` text with check: `('unreviewed', 'approved', 'edited')`
- `assessments.mode` text with check: `('screening', 'progress_monitoring')`
- `session_events.event_type` text with check: `('correct', 'substitution', 'omission', 'insertion', 'self_correction', 'pause')`

Apply the migration:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

If `npx supabase link` requires login or a project ref the user hasn't provided, **stop and report**. The user's Supabase project is created — they can paste the project ref when asked.

### 4. RLS policies

Create `supabase/migrations/0002_rls_policies.sql`. Enable RLS on every table. Then:

**`schools`** — teachers can only read their own school:
```sql
create policy "teachers can read own school"
  on schools for select
  using (id in (select school_id from teachers where auth_provider_id = auth.uid()));
```

**`teachers`** — teachers can read/update their own row, read others in their school:
```sql
create policy "teachers can read self and same-school colleagues"
  on teachers for select
  using (school_id in (select school_id from teachers where auth_provider_id = auth.uid()));

create policy "teachers can update self"
  on teachers for update
  using (auth_provider_id = auth.uid());
```

**`students`, `assessments`, `sessions`, `session_events`** — scoped by `school_id` (sessions and session_events join up through assessments). Use a SQL helper function `current_teacher_school_id()` to keep policies readable.

**`passages`** — readable by all authenticated users (it's shared content), no school scoping:
```sql
create policy "all authenticated users can read passages"
  on passages for select
  using (auth.role() = 'authenticated');
```

**Service role bypass** — the scoring pipeline uses the service role key and bypasses RLS naturally. No policies needed for that path.

**Public read for the student link flow** — students don't authenticate. The `/read/[token]` route needs to read the assessment and passage *without auth*. Add a policy on `assessments`:

```sql
create policy "anyone can read assessment by share_token"
  on assessments for select
  using (true);
```

This is intentionally permissive — `share_token` itself is the security boundary (long random string, hard to guess). Document this in a comment in the migration. Tighten in Week 4 if needed.

Same for the passage referenced by the assessment — already covered by the "all authenticated users" policy, but for unauth student access we need:

```sql
create policy "anyone can read passages"
  on passages for select
  using (true);
```

Replace the auth-only policy with this one.

For `sessions` writes (the student submits a reading): allow anonymous insert if the assessment_id has a valid (unexpired) share_token. Use a Postgres function for the check.

Apply: `npx supabase db push`.

### 5. Configure Supabase Auth

In the Supabase dashboard (the user will need to do this manually if the agent can't access it):
- Email provider: enabled
- Confirm email: **disabled for V1** (frictionless dev/pilot signup; turn on for V2)
- Email templates: leave defaults

In code, create `app/auth/signup/page.tsx` and `app/auth/login/page.tsx`:

**Signup form.** Fields: full name, school name, email, password. On submit:
1. Call `supabase.auth.signUp({ email, password })`
2. With the returned `user.id`, insert a row into `schools` (using service role via a server action — the RLS won't allow a fresh user to insert)
3. Insert a row into `teachers` with the new school_id, email, full_name, and `auth_provider_id = user.id`
4. Redirect to `/dashboard` (which is empty for now — just shows "No assessments yet")

**Login form.** Email + password. On success, redirect to `/dashboard`.

Both forms use the design system from Part 1: Source Serif 4 for the headline ("Welcome back" / "Get started"), Inter input fields, single-action layout with massive whitespace, accent button. No "Forgot password" link in V1 — Supabase handles that via deep link, document for Week 4.

### 6. Seed the passages

Create `supabase/seed.ts` (a Node script, not SQL). It:

1. Reads 10 grade-6 passages from `lib/passages.ts` (currently has 1 — expand this file to include 10 passages from the Achieve the Core Grade 6-8 Fluency Packet, all public domain, attribution preserved)
2. Uses the service role client to upsert each into the `passages` table
3. Runs idempotently — safe to run multiple times

Run with: `npx tsx supabase/seed.ts`

For the additional 9 passages: include a mix of fiction and nonfiction, ranging 100-200 words each. Real passages from the Achieve the Core packet include excerpts from *The Adventures of Tom Sawyer*, *The Time Machine*, *Narrative of the Life of Frederick Douglass*, the Declaration of Independence, and several nonfiction articles. Use those if you can find them, or use other public-domain texts (Project Gutenberg) of similar reading level if not.

### 7. Assessment creation flow

Create `app/dashboard/page.tsx` (server component, requires auth — redirect to `/auth/login` if no session).

The empty state per DESIGN.md section 4.5: a single line of serif type center-screen, *"No readings yet."*, and a small button: *"Create assessment"*.

Clicking the button opens a slide-in panel (not a modal — DESIGN.md says no modals) from the right with three steps:

1. **Pick passage.** A vertical list of passages with title and word count. Click to select.
2. **Pick mode.** Two cards: "Screening" (3× per year benchmark) and "Progress monitoring" (weekly probes).
3. **Class label.** Single text input: "Period 3 ELA — Ms. Eileen". Free text.

After step 3, a "Generate link" button. On click:
- Generate a `share_token` — use `nanoid` with 16 characters, URL-safe alphabet
- Insert an `assessments` row
- Show the share URL in a large card with a "Copy link" button. The URL is `https://<host>/read/${share_token}`
- After copying, brief success toast ("Copied!"), then close the panel

The dashboard now shows the created assessment as a single row (this is week 4 territory but a tiny one-row list is fine for now to confirm the assessment exists). No design polish required.

### 8. Wire student flow to real data

Update `app/read/[token]/page.tsx`:

- Replace the hard-coded "demo" token check with a real DB lookup. Server-side, fetch the assessment by `share_token`. If not found or expired, render the calm 404.
- Fetch the associated passage and pass it to the component (replaces the `PASSAGE` constant import)
- The class label from the assessment is shown in the bottom-left corner instead of the hard-coded one

Update `app/api/score/route.ts`:

- Accept `assessment_token` (the share token) in the request, not just `passage_id`
- Look up the assessment by token to get `assessment_id`, `school_id`, `passage_id`
- Resolve or create a `students` row by `(school_id, first_name, last_name)` — case-insensitive match on the typed name. If match exists, use it. If not, create a new student row. (This is per ARCHITECTURE.md section 7 — "Students don't log in. Student records are created when their name is typed.")
- Insert a `sessions` row with `status='pending'` immediately, before scoring. Return the `session_id` to the client right away — the client can navigate to a "scoring..." state immediately rather than waiting on the full pipeline.
- Run the scoring pipeline (Deepgram → alignment → metrics → Claude) async. When complete, update the session row with `status='complete'`, `scores_json`, `scored_at`, and bulk-insert the `session_events` rows.
- If scoring fails, update `status='failed'` and log the error.

The student doesn't wait for scoring to complete. They submit, see the done screen, and close. The teacher's dashboard (Week 4) will show pending sessions and update when scoring completes.

### 9. Move audio to Supabase Storage

Create a Supabase Storage bucket called `recordings`. Set it to **private** (no public access).

Update the score API route:
- Upload the audio blob to `recordings/${session_id}.webm` using the service role client
- Store the path (not a signed URL — just `${session_id}.webm`) in `sessions.audio_url`
- Delete the `/tmp/` audio file logic — that's gone

Update `app/api/audio/[id]/route.ts`:
- Authenticate the request (must be a teacher in the same school as the session)
- Generate a short-lived signed URL (60 seconds) and redirect to it, OR stream the file through the route handler — your call. The signed URL approach is simpler and offloads bandwidth from the Vercel function.

Add an RLS-equivalent policy on the storage bucket: only service role and authenticated teachers in the matching school can read. Use a Supabase Storage policy.

### 10. Background scoring trigger

The scoring pipeline currently runs synchronously inside the score API route. That's fine for V1 (uploads are small, scoring takes ~10s), but ARCHITECTURE.md section 6.5 says scoring is async — the student should never wait.

Restructure:
- The score API route inserts the session, uploads the audio, sets `status='pending'`, returns `session_id` to the client
- A separate function (call it `runScoringPipeline(sessionId)`) does Deepgram + alignment + Claude + DB writes
- For V1, invoke `runScoringPipeline` via `waitUntil()` from `next/server` so it runs after the response is sent. This gives us async scoring without setting up a separate queue.
- Document that V2 will move this to a proper Supabase Edge Function or a Vercel cron job per ARCHITECTURE.md.

The `/report/[id]` page needs to handle the `status='pending'` case: show a soft "Still scoring..." state in serif type with the recording-screen pulsing dot, polling every 2 seconds for completion. (This is rare in practice — by the time the teacher opens the report, scoring is usually done — but it must not crash.)

### 11. Update the report page

`app/report/[id]/page.tsx` now reads from the DB:
- Fetch the session by id
- Fetch the associated assessment, passage, student
- Fetch the session_events
- All queries respect RLS (teacher must be in the same school)

The header block now shows real data: student name, class label from the assessment, real timestamp.

### 12. Verification

End-to-end test:

1. Sign up as a new teacher. Verify a school + teacher row exist in Supabase.
2. Create an assessment for "Period 3 ELA". Copy the share link.
3. Open the share link in an incognito window. Type a name. Read the passage. Submit.
4. Verify a `sessions` row is created with `status='pending'`, then `status='complete'` after ~10s.
5. Verify the audio is in Supabase Storage at `recordings/${session_id}.webm`, not in `/tmp/`.
6. As the teacher, navigate directly to `/report/${session_id}`. Verify the report renders.
7. Sign out. Try to access the same `/report/${session_id}` URL. Verify it 404s or redirects to login (RLS should block).
8. Sign up as a teacher in a *different* school. Try to access the same report. Verify it 404s (RLS scoping working).

If any check fails, fix before stopping.

---

## Output

Report back with:
1. Tables created and row counts (`schools`, `teachers`, `passages` should all be > 0)
2. End-to-end test results
3. Any RLS gotchas you hit
4. Any blockers (especially around Supabase CLI auth — that's the most likely sticking point)

## Quality bar

The user-facing surfaces should look identical to Week 2 — this is a foundation week, not a UX week. The signup and dashboard pages can be utilitarian by Week 2 standards. Their proper polish is Week 4. But the multi-tenant scoping must be correct: a teacher in school A must never, under any circumstances, see data from school B. RLS is the load-bearing security layer for the rest of the product's life. Get it right.
