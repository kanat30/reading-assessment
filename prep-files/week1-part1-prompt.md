# FluencyScope — Week 1 Build Prompt (Part 1 of 2)

You are a coding agent with terminal and filesystem access. You will execute the first six items of the Week 1 build checklist for **FluencyScope**, a reading fluency assessment web app. Work autonomously. Do not ask for confirmation between steps. Only stop if you hit a genuine blocker (network failure, missing dependency the user must install, ambiguous design decision not covered below).

---

## What you are building

A Next.js web app where a 6th grader will eventually click a link, see a reading passage, click "Start Reading," and read aloud while their mic records. **In this prompt, we are NOT wiring up audio recording yet** — we are building the static UI shell and the design system that everything else will sit on top of.

The aesthetic target is Linear / Things 3 / Apple Books — not edtech. Massive whitespace, beautiful typography, monochrome with one accent color, restraint everywhere. If something looks generic-Tailwind or shadcn-default, it is wrong.

---

## Tech stack (locked in — do not deviate)

- Next.js 15 with App Router, TypeScript, Tailwind CSS
- shadcn/ui for component primitives
- Framer Motion for transitions (install but do not use heavily yet)
- Inter for UI sans, Source Serif 4 for the reading passage (both via `next/font/google`)

---

## Tasks

Execute these in order.

### 1. Initialize the project

Run `create-next-app` in the **current working directory**. The project name is `fluencyscope`. Use these flags so it runs non-interactively:

```bash
npx create-next-app@latest fluencyscope --typescript --tailwind --eslint --app --no-src-dir --turbopack --import-alias "@/*" --use-npm
```

After it completes, `cd fluencyscope` and run all subsequent commands inside that directory.

### 2. Install dependencies

```bash
npm install framer-motion
```

Then initialize shadcn/ui:

```bash
npx shadcn@latest init -d
```

Use the defaults when prompted. After init, install these components:

```bash
npx shadcn@latest add button input
```

### 3. Configure fonts

Replace `app/layout.tsx` so it loads Inter (UI) and Source Serif 4 (passage text) via `next/font/google` and exposes them as CSS variables `--font-sans` and `--font-serif`. Set the body class to use `--font-sans` by default.

The metadata title should be `FluencyScope` and description `A reading fluency assessment tool.`

### 4. Set design tokens

Edit `app/globals.css`. Replace the default shadcn color tokens with the FluencyScope palette below. Use HSL values so they work with shadcn's CSS variable system. Add them to both the `:root` block and (with the same values) — we are NOT supporting dark mode in V1, so remove the `.dark` block entirely if shadcn added one.

The palette:

| Token name | Hex | Purpose |
|---|---|---|
| `--ink` | `#0A0A0A` | Body text, primary UI |
| `--paper` | `#FAFAF7` | Page background |
| `--mist` | `#F0F0EC` | Subtle dividers, hover states |
| `--stone` | `#71716E` | Secondary text, metadata |
| `--accent` | `#1E40AF` | Primary buttons, focus states (deep blue) |
| `--success` | `#3F7D58` | Green percentile band |
| `--warning` | `#C77D3F` | Yellow percentile band |
| `--alert` | `#A33D3D` | Red percentile band |

Also map shadcn's existing semantic tokens (`--background`, `--foreground`, `--primary`, `--muted-foreground`, etc.) to point at these — `--background` → paper, `--foreground` → ink, `--primary` → accent, `--muted-foreground` → stone, `--border` → mist. This way shadcn components inherit the theme without rewrites.

In `tailwind.config.ts` (or `.js`), extend the theme with:
- `colors`: `ink`, `paper`, `mist`, `stone`, `accent`, `success`, `warning`, `alert` mapped to the CSS variables
- `fontFamily`: `sans: ['var(--font-sans)']`, `serif: ['var(--font-serif)']`
- `fontSize`: add `display: ['56px', { lineHeight: '1.1', fontWeight: '600' }]` to support the hero text size from DESIGN.md

### 5. Hard-code the passage

Create `lib/passages.ts` with a single exported passage object. Use this exact text — it is from the Achieve the Core Grade 6–8 Fluency Packet (public domain, attribution preserved):

```ts
export const PASSAGE = {
  id: "atc-g6-01",
  title: "from The Adventures of Tom Sawyer",
  grade_band: "6-8",
  source_attribution: "Achieve the Core 6-8 Fluency Packet",
  text: `Saturday morning was come, and all the summer world was bright and fresh, and brimming with life. There was a song in every heart; and if the heart was young the music issued at the lips. There was cheer in every face and a spring in every step. The locust trees were in bloom and the fragrance of the blossoms filled the air. Cardiff Hill, beyond the village and above it, was green with vegetation, and it lay just far enough away to seem a Delectable Land, dreamy, reposeful, and inviting. Tom appeared on the sidewalk with a bucket of whitewash and a long-handled brush. He surveyed the fence, and all gladness left him and a deep melancholy settled down upon his spirit. Thirty yards of board fence nine feet high. Life to him seemed hollow, and existence but a burden.`,
  word_count: 117,
};
```

### 6. Build the student reading screen

This is two routes that flow into each other. Use Framer Motion for the transitions between them but keep the animations subtle — 240ms ease-out fades, no slides or zooms.

**Route: `app/read/page.tsx`** (the pre-reading screen)

Full-bleed `paper` background. Centered vertically and horizontally:

- The passage title in 14px stone, all lowercase, letter-spacing slightly loose: `from the adventures of tom sawyer`
- Below it, the passage text itself in **Source Serif 4, 24px, line-height 1.6**, weight 400, color ink. Max-width ~70 characters per line (use `max-w-[680px]`). Generous vertical padding above and below — at least 96px top/bottom on desktop.
- At the very bottom of the viewport, centered horizontally, a single button: **"Start reading"**. Use the shadcn Button component but restyle it: accent background, paper text, 16px font, generous padding (px-8 py-4), no border-radius higher than 8px, smooth 120ms hover transition that subtly darkens the accent color.
- Clicking the button navigates to `/read/recording` (next route below).
- No navbar. No logo. No instructions. No "this will take 60 seconds" copy.

**Route: `app/read/recording/page.tsx`** (the reading screen — STATIC for now, no real recording)

Identical layout to the pre-reading screen — same passage, same typography, same spacing — **except**:
- The "Start reading" button is replaced with a single small dot (12px diameter, accent color) that pulses with a 2-second breathing cycle. Implement the pulse with Framer Motion's `animate` prop, not CSS keyframes. Smooth sine wave, opacity oscillating between 0.3 and 1.0.
- Below the dot, in 14px stone italic: *"Tap when you're done"*
- Tapping the dot (or anywhere it suggests) navigates to `/read/done`.

**Route: `app/read/done/page.tsx`**

Centered. In Source Serif 4 32px weight 600: **"Nice work."** Below it in 14px stone: *"You can close this window."* That's it. No score, no feedback, no "your teacher will review this."

The page should fade in over 400ms when it loads.

### 7. Replace the homepage

Replace `app/page.tsx` with a simple redirect to `/read`. Use Next.js's `redirect()` from `next/navigation` in a server component. (When we wire up real share tokens later, this becomes `/read/[token]` — for now, a static redirect is fine for the demo.)

### 8. Verify

Run `npm run dev`. Open `http://localhost:3000` and walk through the full flow:
- Landing redirects to `/read`
- The passage renders in serif type with proper measure
- The "Start reading" button is visible at the bottom
- Clicking it navigates to the recording screen with the pulsing dot
- Tapping the dot navigates to the done screen
- All transitions are smooth, no layout shifts

If anything looks off (the serif font isn't loading, the accent color is wrong, the layout is cramped), fix it before stopping.

---

## Output

When done, report back with:
1. The list of routes you created
2. Any deviations from this spec and why
3. Any items in this prompt you couldn't complete and why
4. The terminal command to start the dev server (so the user can review)

Do **not** commit to git, do **not** deploy to Vercel, do **not** start on items 7+ of the original Week 1 checklist (audio capture, Deepgram, Claude, report view) — those are coming in a follow-up prompt.

---

## Design quality bar

Before reporting "done," screenshot the three routes mentally and ask: *would this look out of place next to a Linear or Things 3 screenshot?* If the answer is no — if it looks like generic Tailwind, has visible borders everywhere, has cramped spacing, has inconsistent type sizes — iterate until it doesn't. The point of Week 1 is the magic moment, and the magic moment requires that the static screens already look beautiful before any audio or AI is wired up.
