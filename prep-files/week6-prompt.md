# FluencyScope — Week 6 Build Prompt

You are a coding agent with terminal and filesystem access. Weeks 1–5 have shipped: a polished student flow with resilient audio capture, the four-layer scoring pipeline, multi-tenant Supabase persistence, a Linear-style teacher dashboard, and a beautiful report view with override flow and print support.

Week 6 is the polish-and-pilot week. The goal: *"the difference between 'nice prototype' and 'Eileen wants this in her school next week.'"*

Of the 15 items on the Week 6 checklist, **five are human-only tasks** (Chromebook test, cross-browser test, watching Eileen use it, watching a 6th grader use it, and iterating based on their reactions). You will not attempt those. They are tagged HUMAN below — flag them in your output but skip them.

Work autonomously on everything else. Stop only on genuine blockers.

---

## What you are building this week

1. **Loading states** — skeletons everywhere, never spinners
2. **Error states** — calm recovery flows for every failure mode
3. **Transition polish** — sweep the whole app for jank
4. **Score-reveal animations** — the report's count-up + cascade refined
5. **Cmd+K command palette** — keyboard-first feel for power users
6. **PWA + service worker** — installable, works offline-ish, caches the student flow
7. **Bundle size audit** — student route under 200 KB JS, hard
8. **Lazy-loading sweep** — anything heavy off the student flow
9. **Production deploy + custom domain prep**

Five things you are NOT doing this week (HUMAN tasks):
- Testing on a real NYC-spec Chromebook with throttled WiFi
- Cross-browser spot-check on Safari + Firefox
- Sitting Eileen down with the prototype
- Sitting a real 6th grader down with the prototype
- Iterating based on their reactions

---

## Tasks

### 1. Loading states — skeletons everywhere

Audit every route for loading states. Replace any spinner with a skeleton that matches the final layout's structure.

**Dashboard load.** When the dashboard is fetching the session list, render skeleton rows matching the actual row layout: a 18px×140px shimmer block for the name, a 24px×80px block for the waveform, a 14px×64px block for the time, and a 14px×220px block for the metadata line. Show 6 skeleton rows. Use a subtle shimmer animation: a `mist` → `paper` → `mist` linear gradient, sliding left-to-right, 1.4s per cycle, ease-in-out.

**Report load (inside expanded row).** Skeleton the headline (96px×180px block), the percentile bar (6px full-width block), the four prosody rows (4 staggered blocks), and three lines of transcript skeleton. The audio waveform area shows a 80px-tall stone-tinted block (no shimmer — just a flat placeholder).

**Standalone /report/[id] load.** Same skeleton layout as the inline expansion.

**Assessment creation panel.** When generating a share link, the link box shows a skeleton until the token is ready (which is usually <500ms — most of the time the skeleton barely flashes).

**Hard rule:** never use `<div className="spinner">`, `<RefreshCw className="animate-spin">`, or any rotating-circle pattern anywhere in the app. The exception is the recording dot's *breathing* animation, which is not a spinner. If you find any spinners in the existing code, replace them.

Implement skeletons in `components/skeletons/` with a base `<Skeleton>` primitive that takes `width`, `height`, `className`. All skeletons share the same shimmer behavior.

### 2. Error states — calm recovery

Audit every failure mode. For each, render a calm recovery state in serif type with a clear next action.

**Catalog of failure modes to handle:**

| Where | What can fail | The recovery state |
|---|---|---|
| `/read/[token]` | Token invalid/expired | Centered serif: *"This link has expired."* Below: *"Ask your teacher for a new link."* No retry button. |
| `/read/[token]/recording` | Mic permission denied | Calm serif: *"We need your microphone to hear you read."* Below in stone: instructions for unblocking + a "Refresh" link. (Already built in Week 2, audit and improve.) |
| `/read/[token]/recording` | Mic permission granted, then mic disconnects mid-read | A small inline notice that fades in below the dot: *"Microphone disconnected. Please reconnect and try again."* The reading is discarded — don't try to salvage a broken stream. |
| `/read/[token]/recording` | Upload fails after retries | Already built in Week 2 — *"We'll save this when you're back online."* Audit to confirm it still works. |
| `/api/score` | Deepgram timeout / 5xx | Mark session `status='failed'`, `scores_json.error_code='asr_failed'`. Report view shows: *"This reading could not be scored. Please ask the student to read again."* with a small button *"Generate new link"*. |
| `/api/score` | Claude timeout / 5xx | Score the reading without the AI summary. The summary block shows: *"AI summary unavailable. Click to retry."* in 14px stone italic. Retry button calls a separate endpoint that just runs Layer 4. |
| `/dashboard` | Supabase Realtime drops | Silent failure → fall back to 15s polling. Already documented in Week 4; verify still works. |
| `/dashboard` | Initial fetch fails | Skeleton stays visible for 5s, then a small inline notice: *"Couldn't load readings."* + a "Retry" link in stone. No full-page error. |
| Any auth-required route | Session expired | Redirect to `/auth/login` silently. Don't show a "session expired" page — just redirect. After login, redirect back to the original URL. |

**Rule for all error states:** no red icons, no exclamation marks, no "Oops!" copy, no shaking elements. Calm everywhere. The user is already stressed when something breaks; the UI should de-escalate, not amplify.

### 3. Transition polish sweep

Open every route and click through every flow. Look for:

- Layout shifts (CLS) — anything that jumps when fonts load, when async data arrives, when an animation completes
- Janky transitions — anything that doesn't feel like 240ms ease-out
- Inconsistent timing — some places using 300ms, others 200ms, others 500ms. Pick 240ms as the canonical page-transition duration and 120ms as the canonical hover duration. Sweep and standardize.
- Animations that fire on every render instead of just on mount (the WCPM count-up is the obvious one — make sure it doesn't re-trigger on hover)

Document any transitions you change. If anything was already good, leave it.

### 4. Score-reveal animation refinement

The report's reveal sequence (Week 5 set this up) should feel cinematic but not slow. The current sequence:
1. WCPM number counts up over 800ms
2. Percentile bar fills over 600ms, starting 200ms after #1
3. Prosody dots stagger in left-to-right with 50ms gaps

Refine:

- The whole sequence should complete in under 1.6 seconds total. If it's slower right now, tighten timings.
- The waveform fades in last, after the prosody dots, over 400ms. The error dots on the waveform fade in 200ms after the waveform itself, with a 30ms stagger.
- The summary paragraph fades in at the same time as the waveform.
- The transcript appears immediately (no animation) — it's content the teacher might scroll to, and waiting for it would be annoying.

Use Framer Motion's `useInView` hook to ensure the animation only fires when the report is actually visible (so an unexpanded row in the dashboard doesn't waste an animation).

Add a `prefers-reduced-motion` media query check. If the user has reduced motion enabled, skip all reveal animations and render everything immediately. This is an accessibility requirement, not a polish item — implement it everywhere reveal animations are used.

### 5. Cmd+K command palette

The checklist says: *"Cmd+K command palette (V1: just create assessment + search)"*.

Install `cmdk`:

```bash
npm install cmdk
```

Implement `<CommandPalette>` as a global client component mounted in the app root layout. Triggered by Cmd+K (Mac) or Ctrl+K (Windows/Linux). Renders as a centered overlay, ~640px wide, paper bg, mist 1px border, 16px border-radius, dropping in from the top with a 200ms ease-out animation. Page behind dims to 40% opacity.

**V1 commands (only these):**

1. **Create new assessment** — opens the assessment creation panel (same as the dashboard button)
2. **Search readings** — typing filters across student names. Each result is a row showing student name + class label + time. Selecting one navigates to the dashboard with that row expanded.
3. **Sign out** — a destructive action, shows a confirmation in 14px stone before executing
4. **Go to dashboard** — for when you're somewhere else and want to get back

That's the entire command set for V1. No "settings," no "profile," no "help." Don't build them.

**Design:**

- Single input field at the top, no border, 24px Inter, color ink, no placeholder. autoFocus on mount.
- Below, the command list in 16px ink, with hover/active state in `mist` background
- Active result has a subtle `accent`-color 2px left border
- Keyboard nav: arrow keys move selection, Enter executes, Esc closes
- A small footer in 12px stone showing keyboard hints: *"↵ select · ↑↓ navigate · esc close"*

The student flow (`/read/[token]/*`) does NOT mount the command palette. It's teacher-only.

### 6. PWA manifest + service worker

The student route must work as a PWA — installable, fast on cold load, survives a flaky connection.

**Manifest (`public/manifest.json`):**

```json
{
  "name": "FluencyScope",
  "short_name": "FluencyScope",
  "description": "A reading fluency assessment tool.",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#FAFAF7",
  "theme_color": "#0A0A0A",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

Generate the icon PNGs as simple monochrome marks: a single `ink` filled square with rounded corners, the letter F in `paper` color centered (Inter, weight 600). No gradients, no shadows. Use sharp or a similar library to generate at 192×192 and 512×512. Write to `public/icons/`.

Reference the manifest from `app/layout.tsx`'s metadata.

**Service worker:**

Use `next-pwa` (or `@serwist/next` which is the modern Next.js 15-friendly equivalent). Strategy:

- The student route shell (`/read/[token]`, `/read/[token]/recording`, `/read/[token]/done`) — **stale-while-revalidate**, so it loads instantly from cache then updates in the background
- Static assets (fonts, icons, JS bundles) — **cache-first**, indefinite TTL with versioned filenames
- Passage text data — **network-first**, fall back to cache (passages don't change but new ones get added)
- The `/api/*` routes — **never cache** (always network)
- The teacher dashboard and reports — **network-only** (real-time data, no caching)

Test by:
1. Loading `/read/[token]` once
2. Going offline (Chrome DevTools)
3. Reloading the page
4. Verifying the page still loads with the passage and recording UI works (audio gets buffered to IndexedDB and uploaded when back online — this should already work from Week 2)

### 7. Bundle size audit

Run `npm run build` and inspect the output. The student route (`/read/[token]`) must be **under 200 KB JS** as the Week 6 checklist requires.

Common culprits to hunt:
- Framer Motion: full library is ~60KB. If the student route only uses simple fades, import only what's needed: `import { motion, AnimatePresence } from 'framer-motion/mini'` (the mini bundle is ~20KB) — verify this is sufficient for the student flow's animations.
- WaveSurfer.js: ~40KB. The student flow doesn't need it. Lazy-load it for the report only.
- Recharts/D3/Chart.js: should not be on the student route at all. If they are, that's a bug — move them to dashboard-only routes.
- shadcn components: only import the ones the student route actually uses.
- Supabase client: ~30KB. The student route only does an unauth read of the assessment — make sure it's not loading the full auth client.

Use `@next/bundle-analyzer` to visualize the bundle:

```bash
npm install --save-dev @next/bundle-analyzer
ANALYZE=true npm run build
```

If the student route exceeds 200KB after optimization, report back with what's still in there and why. Don't break functionality to hit the budget.

The teacher dashboard has no bundle budget — load whatever's needed. Teachers run on better hardware.

### 8. Lazy-load everything off the student flow

Per ARCHITECTURE.md section 6.5: *"no waveform rendering, no charts, no heavy Framer Motion sequences during reading."*

Audit the student route imports. Anything that's not strictly needed for the read-and-submit flow gets:

- Dynamic imported with `next/dynamic({ ssr: false })`
- Or moved to the teacher-only routes entirely

Specifically verify:
- WaveSurfer is NOT imported by the student route (only the report)
- Recharts/Chart.js is NOT imported anywhere on the student route
- The cmdk command palette is NOT mounted on the student route
- The full `<SessionReport>` component is NOT imported by the student route

If the student flow imports any of these even transitively, restructure.

### 9. Production deploy + custom domain prep

Deploy to Vercel production:

```bash
npx vercel --prod
```

If the user is not authenticated to Vercel CLI, **stop and report** — they will run this manually.

Set production environment variables (these should already be set from Week 1 Part 2 / Week 3, but verify):

```bash
npx vercel env ls production
```

Expected: `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. If any are missing, report.

**Custom domain — prepare, then hand off:**

The user wants a custom domain (e.g., `fluencyscope.com`). The Vercel side requires:

1. Buy the domain (HUMAN — user does this on Namecheap, Cloudflare Registrar, or similar)
2. Add the domain in the Vercel project settings (`npx vercel domains add fluencyscope.com`)
3. Configure DNS to point at Vercel's nameservers OR add the A/CNAME records Vercel provides

Run step 2 if the user has provided a domain in `.env.local` as `CUSTOM_DOMAIN`. If not, **stop at this step** and report: *"Provide the domain you've purchased and I'll wire it up."*

Once the domain is wired:
- Update `metadata.metadataBase` in `app/layout.tsx` to point at the production URL
- Update the Supabase Auth allowed redirect URLs (HUMAN — must be done in the Supabase dashboard)
- Update the assessment share link generation to use the production domain (currently might be using `vercel.app` — switch to the env-configured custom domain)

### 10. Pre-pilot checks

Before declaring Week 6 done:

1. Run `npm run build` cleanly with zero warnings (errors will already block the build; warnings often hide real issues)
2. Run `npm run lint` cleanly
3. Run any tests that exist (probably few — that's fine for V1; testing isn't on this week's checklist)
4. Sign in as a fresh teacher account, create an assessment, copy the link, open it in a fresh incognito window, type a name, read a passage, submit, navigate back to the dashboard, see the new reading appear, click into it, view the report, override one score, print the report, sign out
5. Note any rough edges and fix the small ones; flag the big ones for the user

---

## Verification checklist

1. Every loading state in the app uses skeletons, not spinners
2. Every error state listed above renders calmly with a recovery action
3. The score-reveal animation completes in under 1.6 seconds
4. `prefers-reduced-motion` is respected everywhere
5. Cmd+K opens the command palette on the dashboard, NOT on the student flow
6. The student route is installable as a PWA on a Chromebook (Chrome menu → "Install FluencyScope")
7. The student route loads from cache when offline (audio buffers to IndexedDB, uploads when back online)
8. `npm run build` reports a student route bundle under 200 KB JS
9. Production deploy succeeded and the URL is accessible
10. End-to-end smoke test passes from a fresh incognito window

---

## Output

Report back with:
1. Which subsections completed cleanly
2. The student route bundle size (exact number)
3. Production URL
4. Any custom domain steps requiring user input
5. The full list of HUMAN tasks remaining (Chromebook test, Safari/Firefox test, Eileen demo, 6th grader demo, iterate)
6. Any rough edges that fell out of the smoke test
7. Any blockers

## Quality bar

This is the version of the app you'll show to Eileen. Walk through every flow yourself one more time. If anything makes you wince — a font that looks slightly off, a transition that's a beat too slow, copy that's a touch too clinical, an empty state that feels apologetic — fix it before stopping.

The bar isn't "feature complete." The bar is *"I would happily put this in front of a Brooklyn middle school principal next Tuesday."*
