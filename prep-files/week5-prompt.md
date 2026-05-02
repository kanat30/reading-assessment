# FluencyScope — Week 5 Build Prompt

You are a coding agent with terminal and filesystem access. Weeks 1–4 have shipped: a polished student flow with resilient audio capture, the four-layer scoring pipeline, multi-tenant Supabase persistence, and a Linear-style teacher dashboard with inline-expanding reports. The `<SessionReport>` component renders inside dashboard rows and at the standalone `/report/[id]` URL.

Week 5 is the report's design moment. From the checklist: *"This is the screen that sells the product. NYT-article quality."* The report already works. This week makes it sing.

Work autonomously. Stop only on genuine blockers.

---

## What's already built vs. what this week adds

**Already built (Week 4):** WCPM headline, percentile bar, prosody gauges, waveform with error dots, synced transcript with click-to-scrub, AI summary paragraph, audio playback. These all *work*. The job this week is to **raise the bar on each of them** — visual refinement, micro-interactions, edge cases — not to rebuild from scratch.

**New this week:**
- A real teacher override flow with audit logging (currently only a placeholder button exists)
- Top-3 error pattern computation surfaced in the report
- Print-friendly view for parent conferences

---

## Tasks

### 1. Schema addition — overrides audit log

The current schema has `sessions.teacher_review_status` as a flag, but no record of *what changed* or *what the value was before*. Parent conferences and teacher accountability both require this trail.

Create `supabase/migrations/0003_overrides.sql`:

```sql
create table session_overrides (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  teacher_id uuid not null references teachers(id),
  field_name text not null,           -- e.g., 'wcpm', 'accuracy_percent', 'prosody.expression'
  original_value jsonb not null,
  new_value jsonb not null,
  reason text,                         -- optional teacher note
  created_at timestamptz default now()
);

create index session_overrides_session_id_idx on session_overrides(session_id);

alter table session_overrides enable row level security;

create policy "teachers can read overrides for sessions in their school"
  on session_overrides for select
  using (
    session_id in (
      select s.id from sessions s
      join assessments a on s.assessment_id = a.id
      where a.school_id = current_teacher_school_id()
    )
  );

create policy "teachers can insert overrides for sessions in their school"
  on session_overrides for insert
  with check (
    teacher_id = (select id from teachers where auth_provider_id = auth.uid())
    and session_id in (
      select s.id from sessions s
      join assessments a on s.assessment_id = a.id
      where a.school_id = current_teacher_school_id()
    )
  );
```

Apply with `npx supabase db push`.

When an override is written, ALSO update `sessions.teacher_review_status` to `'edited'` and update `sessions.scores_json` with the new value so the dashboard mini-display stays consistent. Wrap both writes in a single transaction (use a Postgres function `apply_session_override(...)` or a server action that does both writes atomically).

### 2. Top-3 error patterns

The checklist says: *"Top 3 error patterns (multisyllabic, function words, etc.) computed from session_events."*

Create `lib/scoring/patterns.ts` with a function `computeErrorPatterns(events: SessionEvent[]): ErrorPattern[]` that returns up to 3 patterns, each with a label and the events that match it.

Pattern detection rules (apply in order, each event can only match one pattern):

1. **Multisyllabic (3+ syllables)** — words with 3+ syllables that were substituted or omitted. Use a simple heuristic: count vowel groups, treat consecutive vowels as one group, subtract 1 if the word ends in silent 'e'. Threshold: 3+ syllable count, 2+ events.
2. **Suffix-based** — group substituted/omitted words by their suffix (`-tion`, `-sion`, `-ous`, `-ular`, `-ment`, `-ity`, `-able`, `-ible`). If 2+ events share a suffix, that's a pattern.
3. **Function words** — substituted/omitted instances of: `the, a, an, of, to, in, is, was, were, are, be, by, for, with, on, at, as, that, this`. Threshold: 3+ events.
4. **Sight words (Dolch)** — high-frequency words that should be recognized instantly. Use the Dolch list intersected with the passage. Threshold: 3+ events.
5. **Self-corrections** — if 4+ self-corrections, that's its own pattern (signals effortful reading even when accurate).

Each `ErrorPattern` has shape:

```ts
interface ErrorPattern {
  id: string;                    // 'multisyllabic' | 'suffix-tion' | 'function-words' | etc.
  label: string;                 // human-readable
  description: string;           // one short sentence
  matched_words: string[];       // unique expected words that matched
  event_count: number;
}
```

Compute these once during scoring (Layer 4 of the pipeline) and store at `scores_json.error_patterns`. Pass them to the Claude summary prompt so the summary text references real patterns instead of generic language.

For existing sessions, write `scripts/backfill-patterns.ts` similar to the waveform backfill from Week 4. Run it once.

### 3. Refine the WCPM headline

Currently it's the headline number. Make it actually sing.

- The number itself: **96px Inter, weight 600, color ink, line-height 1.0** — exactly the bottom of the digit must align with the baseline of the "WCPM" label
- The "WCPM" label: 18px stone, weight 500, baseline-aligned with the bottom of the digits, NOT vertical-centered with them
- Adjust horizontal spacing: 12px gap between the number and "WCPM"
- Below the headline (about 12px below): the percentile line in 16px stone, weight 400 — *"25th percentile · grade 6 spring"*

Add a subtle animation when the report first renders: the WCPM number counts up from 0 to its final value over 800ms with an ease-out curve. Use a small custom hook `useCountUp(target: number, durationMs: number)` rather than a library. The animation only plays once per component mount, not on every state change.

If the report is rendered inside an expanding dashboard row, only count up when the row first expands (when the report becomes visible). Use `IntersectionObserver` or a prop from the parent to trigger.

### 4. Refine the percentile bar

Currently it's a horizontal bar with a colored fill. Make it more elegant.

- Bar height: 6px
- Bar background: `mist`
- Bar fill: the percentile-band color (success/warning/alert) at full saturation
- Border-radius: 3px (rounded ends)
- Width: full container, max 600px
- The fill animates from 0 to its final width over 600ms ease-out, starting 200ms after the WCPM number finishes counting up (so they cascade)

Add a subtle indicator at the 50th percentile mark: a 1px tall, 12px wide vertical line in `stone` at 30% opacity, centered on the 50% point. This gives the teacher a visual anchor for "average."

No tooltip on hover. No labels on the bar itself. The percentile number stays in the text below.

### 5. Refine the prosody gauges

Currently rendered as 4 rows with dots. Three improvements:

**Visual consistency.** All four gauge rows have:
- Label width fixed at 180px (so dots align across rows)
- Label in 14px stone, weight 400, lowercase
- Dots: 8px diameter, 6px gap, ink for filled, mist for empty
- 16px row spacing

**Stagger the entrance.** When the report renders, dots fade in left-to-right with a 50ms stagger between dots (not rows). It's a small touch but it makes the gauges feel considered.

**Click to override.** Each dot is clickable. Clicking a dot sets the prosody score to that level (1-4) and opens the override flow (see step 7). The clicked-on score persists; the others empty.

For now, the prosody scores are still rules-based estimates from Week 2. The override flow lets teachers correct them in 1 click — which is core to the calibration story.

### 6. Refine the audio waveform

The big report waveform (WaveSurfer instance from Week 2) needs three refinements:

**Better proportion.** Increase height to 80px (was 64px). It's the visual centerpiece of the audio block; let it have presence.

**Better error dots.** The current dots are accent-colored circles with white stroke. Refinements:
- Substitutions: filled `alert`-color circles, 10px diameter
- Omissions: empty circles (1.5px stroke, no fill) in `alert` color, 10px diameter
- Self-corrections: filled `warning`-color circles, 8px diameter (smaller — less visually loud)
- Hover state on any dot: 1.2x scale + the spoken-word and expected-word appear in a small inline label above the dot in 12px ink, with a `paper`-bg pill

**Playback indicator polish.** The cursor (current playback position) should be 2px wide in `accent`. As audio plays, the played portion of the waveform smoothly transitions from `stone` to `ink` — not the WaveSurfer default which can look choppy.

### 7. Override flow — the actually new thing

Currently a placeholder "Disagree with this score?" button exists in the corner. Build the real flow.

**Entry points (any of these triggers an override):**
- Clicking the "Disagree with this score?" button (overrides the WCPM)
- Clicking any prosody dot (overrides that prosody dimension)
- Clicking the AI summary paragraph (overrides the summary text)

When triggered, slide a panel up from the bottom of the report (NOT a modal, NOT a popup — slides up over the report content with the rest dimming behind). Panel max-height ~50vh, full width of the report container, paper background, mist top-border, 32px padding.

**Panel content (varies by what's being overridden):**

For **WCPM**:
- Headline in 18px ink: *"What was the correct WCPM?"*
- A single number input field, 96px tall, 56px Inter font (matching the report headline aesthetic), centered. Pre-filled with current WCPM. No spinner buttons.
- Below, in 14px stone: *"Why are you correcting this?"* with a single text field (optional, max 200 chars)
- Two buttons: "Save correction" (accent) and "Cancel" (stone link)

For **prosody**:
- Headline: *"Set [dimension] to:"*
- Four large clickable cards, side-by-side, each with the score (1-4) and a one-line description:
  - 1: *"Word-by-word, choppy, no expression"*
  - 2: *"Hesitant, some phrasing, limited expression"*
  - 3: *"Mostly smooth, appropriate phrasing, some expression"*
  - 4: *"Fluent, expressive, conversational pace"*
  (Use the Rasinski MDFS rubric language for these descriptions — not invented.)
- Optional reason field
- Save / Cancel

For **summary**:
- Headline: *"Edit the summary."*
- A textarea pre-filled with the current AI summary, in serif 18px italic, line-height 1.6, paper bg with subtle mist border, 16px padding, min-height 120px
- A small note in 12px stone: *"Your edit replaces the AI summary on this report. The original is preserved in history."*
- Save / Cancel

**Save behavior:**
- Write a `session_overrides` row with the original and new values
- Update `sessions.scores_json` with the new value
- Update `sessions.teacher_review_status = 'edited'`
- The panel slides down with a 240ms ease-out animation
- The report re-renders with the new value, and that value gets a subtle 1px `accent`-color underline (like a spell-check style) to mark it as teacher-corrected
- A tiny "edited" pill appears next to the field — 10px stone uppercase letter-spacing-loose

**History view:**

If a session has any overrides, the bottom of the report shows a small expandable section: *"Edit history (3)"* in 14px stone link. Clicking expands a list of the overrides — each one a single line: *"WCPM: 87 → 92 · Apr 25 by Ms. Eileen · 'Audio cut off mid-sentence'"*. Compact, clinical, no chrome.

### 8. Print-friendly view

The dashboard's inline-expansion architecture means Cmd+P in the dashboard would print the dashboard chrome plus all visible rows — not what we want.

**Two-part solution:**

**Part A:** Add a small "Print" link in the bottom-right corner of the report (next to the "Disagree with this score?" button), 14px stone. Clicking it opens `/report/[id]/print` in a new tab and triggers `window.print()` after the page loads.

**Part B:** Create `app/report/[id]/print/page.tsx` — a separate server-rendered route that uses a print-only layout:

- No dashboard chrome, no nav, no audio waveform (you can't print audio), no override buttons, no edit history
- The layout is a single-column document optimized for letter-size paper:
  - Top of page: "FluencyScope · Reading Assessment" in 12px stone (functional header — schools need to identify the document)
  - Student name as the document headline
  - Date, class label, passage title in metadata line
  - WCPM, percentile, accuracy block (no animation — static)
  - Static percentile bar
  - Prosody gauges (filled dots only, no empty rings — print-safe)
  - The full transcript with errors highlighted (use bold + underline for errors instead of color, since not all printers do color reliably)
  - The AI summary paragraph in serif italic
  - Top 3 error patterns as a small bulleted list at the bottom
  - Footer: school name, teacher name, generated-at timestamp in 10px stone

- Use `@media print` CSS to:
  - Force `paper` background to white (for ink savings)
  - Make text full ink black (for legibility)
  - Set `@page` margins to 0.75in
  - Hide any remaining UI chrome
  - Prevent page-break-inside on the headline block, prosody block, and summary block

Test by clicking "Print" and using Chrome's print preview. The output should fit cleanly on 1 page for a typical reading; 2 pages max if the transcript is long. Adjust font sizes for print specifically — body text at 11pt, headline number at 36pt (not 96px which is huge in print).

This is the document a teacher hands a parent at conferences. It should look as considered as a doctor's report.

### 9. Polish the AI summary block

Currently the summary is a paragraph in serif italic with a left border. Make it more deliberate:

- Container: 24px padding-left, 2px solid mist left border, 0 padding right/top/bottom
- Text: Source Serif 4, 18px, weight 400, line-height 1.65, color ink (not stone — it's primary content)
- Italic: yes, but only for the body of the summary. If the override flow has replaced the AI text with teacher text, drop the italic — it's no longer a "doctor's note voice," it's a teacher's words.
- Above the summary, a tiny label in 12px stone uppercase letter-spacing-loose: *"summary"* (or *"teacher's note"* if overridden)
- If the summary mentions specific error patterns by name (e.g., "multisyllabic words"), wrap those phrases in a 1px `accent`-colored underline. Clicking the underlined phrase scrolls down to the corresponding error pattern in the patterns block (see next section).

### 10. Display the error patterns

Below the summary, render a new "Error patterns" block:

- Section label: 12px stone uppercase letter-spacing-loose: *"patterns"*
- Up to 3 patterns rendered as stacked rows, 16px gap between
- Each pattern row:
  - Pattern label in 16px ink weight 500: *"Multisyllabic words (3+ syllables)"*
  - One-sentence description in 14px stone: *"Showed difficulty with longer, less-frequent vocabulary."*
  - The matched words as inline pills: small `mist`-bg chips in 13px ink, 4px padding, 4px border-radius, 6px gap
- If zero patterns met threshold, render: *"No notable patterns."* in 14px stone italic — don't omit the block entirely.

### 11. Verification

End-to-end test:

1. Open a report with at least 5+ errors. Verify error patterns block populates.
2. Override the WCPM. Verify the new value appears, has the accent underline, has the "edited" pill, and writes a row to `session_overrides`.
3. Override a prosody dimension by clicking a dot. Verify the override flow opens for that dimension.
4. Override the AI summary text. Verify the italic drops and the label changes to "teacher's note."
5. Expand "Edit history." Verify all overrides appear with timestamps and reasons.
6. Click "Print." Verify the print view opens in a new tab, fits on 1-2 pages, looks professional.
7. Print to PDF and review the output. If anything looks wrong (cut-off content, ink-heavy, awkward page breaks), fix it.
8. Re-test the dashboard inline expansion. Confirm the refined report still renders cleanly inside the row, with the count-up animation, the staggered prosody dots, etc.

If any check fails, fix before stopping.

---

## What you are NOT building this week

- Trend graphs across multiple sessions for the same student (V2 — longitudinal view)
- Comparative class views (V2)
- Audio export / share links to parents (V2)
- Override approval workflows (overrides commit immediately — there's no draft state)
- Multi-teacher override conflict resolution (last write wins for V1; this is a 1-pilot tool)
- ML model retraining from override data (the data is captured for future use; no pipeline yet)

If you find yourself reaching for any of these, stop.

---

## Output

Report back with:
1. Which subsections completed cleanly
2. The print preview rendering — describe what you see (or attach a PDF if possible). Flag anything that doesn't look professional.
3. Any rough edges in the override flow
4. Any blockers

## Quality bar

Two tests:

**The screenshot test.** Take a screenshot of the report (in the dashboard, expanded). Place it next to a screenshot of a long-form New York Times article page. Same fonts, same restraint, same generous whitespace? If the report looks visibly more cluttered, more chrome-y, more "app-y" — keep iterating.

**The conference test.** Print the report. Hand it to someone who's never seen the product. Ask: *"What does this tell you about this student's reading?"* If they can answer accurately in 30 seconds, the report works. If they hesitate or ask "what does this number mean?" — the labels need work.

The single emotional bar: a teacher reads the report and thinks, *"I trust this. I'd show this to a parent."*
