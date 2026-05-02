# FluencyScope — Week 4 Build Prompt

You are a coding agent with terminal and filesystem access. Weeks 1–3 have shipped: a polished student flow, real audio capture with IndexedDB resilience, the four-layer scoring pipeline, multi-tenant Supabase persistence, and a basic teacher dashboard that currently shows almost nothing useful.

Week 4 is the dashboard's design moment. The goal: **a list of completed readings that feels like Linear, not a gradebook.** Massive whitespace, hierarchy through type rather than chrome, inline expansion instead of modals, real-time updates that arrive like ambient information rather than alerts.

Work autonomously. Stop only on genuine blockers.

---

## Prerequisites — confirm before starting

- The user is signed in as a teacher and can navigate to `/dashboard` without redirect
- At least one assessment exists with a working share token
- At least 2-3 completed sessions exist with `status='complete'` and `scored_at` timestamps
- If any of these aren't true, **stop and report** — the agent needs real data to design against. Ask the user to record 3 readings on different student names before continuing.

---

## What you are building

By end of week, the teacher signs in and sees a dashboard that:

1. Lists every completed reading from their school, sorted newest first
2. Each row shows: student name, class label, time, and a tiny inline waveform fingerprint
3. Clicking a row expands the report inline (Linear-style) — no new page, no modal
4. Filtering by class label feels weightless, not like a filter bar
5. New readings appear in real-time as students submit them — quietly, no banners
6. The assessment creation flow gets proper design polish (Week 3 left it utilitarian)

There is **no analytics, no longitudinal trends, no bulk actions, no admin view, no export.** Those are V2+. This week is exactly the eight items in the Week 4 checklist.

---

## Tasks

### 1. Pre-compute waveform peaks in the scoring pipeline

The dashboard's tiny inline waveforms should not require downloading audio files. Modify the scoring pipeline to extract peak data once during scoring and store it on the session.

In `lib/scoring/waveform.ts`, write a function `extractPeaks(audioBuffer: Buffer, peakCount: number = 200): number[]` that:

- Decodes the audio (use `web-audio-api` or `audio-decode` from npm — install whichever works in a Node serverless environment)
- Bins the samples into `peakCount` buckets
- For each bucket, computes the max absolute amplitude
- Normalizes to [0, 1]
- Returns the array

Wire it into `runScoringPipeline` after Layer 1 (Deepgram has already received the audio buffer; reuse it). Store the result at `scores_json.waveform_peaks`.

Backfill existing sessions: write a one-shot script `scripts/backfill-waveforms.ts` that iterates over all sessions with `status='complete'` and `scores_json.waveform_peaks IS NULL`, fetches the audio from storage, computes peaks, and updates the row. Run it once to populate existing sessions.

### 2. Build the dashboard list

Replace the current `app/dashboard/page.tsx` with a properly designed list view.

**Page structure:**

- Background: `paper`. No sidebar, no top nav bar, no logo.
- Top of viewport: a single line showing the teacher's school name in 14px stone, all lowercase, slightly loose letter-spacing — e.g., `bay ridge middle school`. That's the only chrome on the page.
- Below it: the dashboard headline. Source Serif 4 32px weight 600: **"Readings"** (just that word, no period).
- Below the headline, a class label filter (see step 4 below).
- Below the filter: the list itself.
- Page padding: 64px top/bottom, 96px left/right on desktop. Max width 880px, centered.

**The list itself:**

A vertical stack of rows. **No table headers, no dividers between rows, no zebra striping, no checkboxes, no chevrons.** Each row is just type and one tiny visual element, separated by generous whitespace.

Each row layout (use CSS Grid):

```
[student name in 18px ink weight 500]   [waveform 80px]   [time 14px stone]
[class label · passage title in 14px stone]
```

Concretely:
- Row padding: 24px top/bottom, 0 horizontal
- Hover state: background fades to `mist` over 120ms ease-out — the entire row, not just the text
- Click target: the entire row
- Cursor: pointer
- The student name is real (`first_name + " " + last_name` from the students table)
- The class label comes from the assessment, the passage title from the passage
- Time format: contextual — "2:14 PM today", "yesterday 9:32 AM", "Monday 3:18 PM", "Apr 12 11:05 AM" depending on recency. Use a small helper in `lib/format/time.ts`.

**The tiny inline waveform:**

A new component `<MiniWaveform peaks={number[]} className?: string />`:
- Renders an inline SVG, 80px wide, 24px tall
- Each peak becomes a vertical bar centered on the midline
- Bar width: 1px, gap: 1px (so ~40 visible bars from 200 peaks — sub-sample)
- Bar color: `stone` at 50% opacity — barely visible, a fingerprint not a chart
- On row hover, the waveform fades to full opacity stone
- No animation, no gradient, no border — flat and quiet

If a session has no peaks data (legacy or scoring still pending), render a row of low-contrast dashes instead. Don't show a placeholder spinner.

**Empty state (refining Week 3's version):**

If the teacher has zero completed sessions, the entire content area shows centered:
- Source Serif 4 32px italic stone: *"No readings yet."*
- 64px below it, the "Create assessment" button — accent background, paper text, restrained
- Nothing else

### 3. Real-time updates via Supabase Realtime

When a new session flips to `status='complete'` (a student just finished, scoring just finished), the row should appear at the top of the list without the teacher refreshing.

Implementation:

- The dashboard is a client component (`'use client'`)
- On mount, subscribe to Supabase Realtime on the `sessions` table:
  ```ts
  supabase.channel('dashboard-sessions')
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sessions',
      filter: `status=eq.complete`
    }, (payload) => { ... })
    .subscribe()
  ```
- When an update arrives, fetch the full session details (with joined assessment + student + passage data) and prepend to the list state
- Animate the new row in: opacity 0 → 1 over 400ms, height 0 → auto over 300ms, with a 100ms delay so the layout has settled. Use Framer Motion's `AnimatePresence` and `layout` props.
- **No banner, no badge, no "new reading" pill, no sound.** The row just appears. That IS the notification.

Important: the Realtime subscription must respect RLS — the teacher should never receive events for sessions in other schools. Verify this works; Supabase Realtime honors RLS but only when configured correctly.

If Realtime introduces noticeable load or doesn't work reliably in the Vercel environment, fall back to polling every 15 seconds. Document the choice in code with a comment.

### 4. Class label filter — weightless

Per the checklist: filter by class label. Implementation must not feel like a filter bar.

Just below the "Readings" headline, render the distinct class labels as inline text "tabs":

```
all · period 3 ELA · period 5 ELA · 8th grade intervention
```

- 14px stone, separated by middle dots `·` in `mist`
- The active tab is `ink` weight 500 (other tabs stay stone)
- Click a tab → URL updates to `?class=period-3-ela` (use search params, not state) — bookmarkable
- "All" is the default
- 120ms color transition on hover and active change
- No box, no underline, no border

If there are more than 5 class labels, keep all of them on one line and let it wrap naturally. If it's still ugly, only at that point add a "more" affordance — but most teachers will have 3-5 classes, so this won't be a problem.

### 5. Linear-style inline expansion

Clicking a row expands the report below it. The rest of the list pushes down (does not scroll out of view independently). The rest of the list also dims slightly to focus attention on the open row.

Implementation:

- Track `expandedSessionId: string | null` in component state
- Click a row → set the ID; clicking the same row again → null (collapse)
- The expanded content renders directly below the clicked row, in the same scroll context, using Framer Motion's `<motion.div layout>` for smooth height changes
- Other rows fade to 40% opacity over 200ms
- The clicked row's background stays `mist`, slightly more visible than hover
- The expansion animation: height auto from 0, opacity 0 → 1, over 300ms ease-out

**What goes inside the expanded panel:**

The existing report view from Weeks 1-2 — but rendered inline rather than at `/report/[id]`. This means:
- Student name + metadata block (already at the top of the report — keep it, even though it duplicates the row's name; the report should be self-contained for printing/sharing)
- WCPM headline
- Percentile bar
- Accuracy
- Prosody gauges (if implemented in Week 2)
- Audio waveform (the big one, with error dots)
- Synced transcript
- AI summary
- Override button

Refactor the existing `app/report/[id]/page.tsx` content into a reusable client component `<SessionReport sessionId={string} />` that fetches its own data. The standalone `/report/[id]` page becomes a thin wrapper that renders this component (useful for direct links, printing). The dashboard renders the same component inside the expanded row.

The expanded panel padding: 32px top/bottom, 0 horizontal (so it aligns with the row text). Add a subtle 1px `mist` border-top and border-bottom on the expanded panel only — this is the one place a divider earns its keep.

**Close affordance:**

In the top-right corner of the expanded panel, a small "Close" link in 14px stone with a small × character before it. Hover → ink. Clicking it collapses the panel. Pressing Escape also collapses.

When collapsing, scroll the row back into view if it has moved off-screen.

### 6. Assessment creation — proper polish

Week 3 built this as a utilitarian slide-in panel. Make it actually beautiful.

The flow stays the same (pick passage → pick mode → set class label → generate link), but every screen of it gets the same design treatment as the student flow:

**Passage picker:**
- Each passage rendered as a clickable card with: title in 18px ink weight 500, source attribution in 14px stone, word count in 12px stone
- Cards stack vertically with 16px gap, 24px padding, no border, hover state = `mist` background
- The selected passage gets a `accent` color 2px left border, no background change
- A small preview of the first ~100 characters of the passage in serif type below the title — so the teacher can pre-read what they're about to assign

**Mode picker:**
- Two cards side-by-side, equal width
- Each card: mode name in 18px ink weight 500, one-sentence description in 14px stone
- Screening: *"Three-times-yearly benchmark check against grade-level norms."*
- Progress monitoring: *"Weekly or biweekly probes for students receiving Tier 2 or 3 support."*
- Hover and selected states match the passage picker

**Class label input:**
- Single text input, no label above it
- Placeholder in 14px stone: *"e.g., Period 3 ELA"*
- Below the input, list any existing class labels the teacher has used (pulled from past assessments) as clickable chips, so they can reuse instead of retyping. 12px stone chips with `mist` background, hover → accent border.

**The generated link screen:**

After "Generate link" is clicked:

- The full URL displayed in a single line, Inter monospace 16px, in a `mist`-bg box with 16px padding, full width, 8px border-radius
- A "Copy link" button below it — accent bg, paper text
- After copy: the button text smoothly transitions to "Copied!" for 1500ms with a checkmark icon, then back. Do NOT use a toast library — do this with internal component state and a CSS transition. Never show a popup.
- Below the button, in 14px stone: *"Send this to your students. They don't need to log in — they'll just type their name."*
- A small "Done" link tucked in the corner that closes the panel

The slide-in panel itself: width 480px on desktop, full-screen on mobile/tablet portrait. Slides in from the right, 280ms ease-out. Background `paper`, 1px `mist` left border, 64px horizontal padding, 48px top/bottom. Page behind dims to 40% opacity.

### 7. Sort behavior

The list sorts newest first by `scored_at DESC`. No sort UI — there's only one sensible order. Don't add a "sort by" dropdown.

If the teacher applies a class filter, the sort still applies within the filtered set.

If a session is `status='processing'` (still scoring), show it at the top with a slow-pulsing version of the mini waveform (in stone) and "Scoring..." in 12px stone where the time would be. Once it completes, the row updates in place.

### 8. The teacher's first-impression moment

Imagine the teacher signs in for the first time after lunch and 18 students have read their passage during 5th period.

- They land on `/dashboard`
- The page renders fast — the list is already populated
- 18 rows, sorted newest first, no chrome, beautiful type
- They scan the list, see Maya's name, click the row
- The row expands inline, showing Maya's report
- They listen to a 10-second clip, click an error dot, jump to the moment, nod
- They click Maya's row again to collapse it, click Daniel's row, expand
- The whole experience feels like reviewing a stack of New York Times articles, not grading papers

Verify this experience yourself by walking through the dashboard with the test data. If anything feels heavy, slow, or chrome-y, fix it before stopping.

---

## What you are NOT building this week

- Longitudinal trend graphs (V3+)
- Multi-session comparison (V3+)
- Class average analytics (V3+)
- Bulk operations (never)
- Admin views (V5)
- Export to CSV / PDF (V2+)
- Teacher-to-teacher sharing (V2+)
- Manual student creation in the dashboard (students are created via the link flow only)

If you find yourself reaching for any of these, stop.

---

## Verification checklist

1. Dashboard loads with the list visible in under 1 second on a typical connection
2. Empty state renders correctly for a brand-new teacher with zero sessions
3. Clicking a row expands the report inline, with the rest of the list dimming and pushing down — no modal, no navigation
4. Clicking the same row again (or pressing Escape, or clicking Close) collapses it smoothly
5. Class label filter works via URL search params and updates the list without reloading
6. Recording a new reading from a separate window/device causes a new row to appear in real-time on the dashboard, with a soft entrance animation
7. The mini waveform on each row renders from `scores_json.waveform_peaks` — no audio download required
8. Assessment creation flow walks through all four steps without any rough edges, and the copy-link button works
9. The standalone `/report/[id]` page still works for direct links (and for printing)
10. RLS still scopes everything: a teacher in school A sees nothing from school B, even via Realtime

---

## Output

Report back with:
1. Which subsections completed cleanly
2. Whether Realtime worked or you fell back to polling (and why)
3. Performance notes — how long does the dashboard take to render with 50 sessions? 100? Flag any sluggishness.
4. Any rough edges remaining

## Quality bar

Take a screenshot of the dashboard with 5-10 readings populated. Place it next to a screenshot of Linear's issue list. If FluencyScope's dashboard looks visibly worse — more chrome, less restraint, less considered typography — keep iterating. The bar is "indistinguishable from the best consumer software," not "good for edtech."

The single test that matters: would Eileen, the Brooklyn middle school principal, look at this dashboard and think *"this looks like the apps my husband uses for work, not like the gradebook software my school pays for"*? If yes, you've nailed it.
