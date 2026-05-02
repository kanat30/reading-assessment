# Reading Assessment Tool — Design Principles

**Working name:** TBD (placeholder: "FluencyScope")
**Owner:** ABCHESS / Kanat
**Companion to:** ARCHITECTURE.md
**Last updated:** April 25, 2026

---

## 1. The design thesis

Edtech as a category looks terrible because it tries to be everything. Crowded dashboards, ten buttons per screen, institutional gray, dropdown menus inside dropdown menus. We're not in that category.

We're in the category of **beautifully crafted tools that do one thing**: Linear, Things 3, Arc Browser, Raycast, Stripe, Vercel. The narrow scope of a scalpel tool is a design gift — there are only six screens to build, so each one gets the attention it deserves.

The brief in one line: a 6th grader should feel like this is an app they'd choose to use, not a test they're being forced to take.

---

## 2. Five non-negotiable principles

1. **Massive whitespace.** Most edtech crams. We breathe. Empty space is content.
2. **One primary action per screen.** Never make the user pick from five buttons.
3. **Typography does the heavy lifting.** Beautiful type, hierarchy, spacing — not boxes, chrome, and dividers.
4. **Motion that means something.** Transitions guide attention. Nothing decorative, nothing twitchy. Every animation has a purpose.
5. **Restraint signals confidence.** Black, white, one accent color. No more.

---

## 3. Visual system

### 3.1 Color

A monochrome base with a single accent. Pick the accent once, use it everywhere, never add a second.

| Token | Hex | Use |
|---|---|---|
| `ink` | `#0A0A0A` | Body text, primary UI |
| `paper` | `#FAFAF7` | Page background (warmer than pure white) |
| `mist` | `#F0F0EC` | Subtle dividers, hover states |
| `stone` | `#71716E` | Secondary text, metadata |
| `accent` | TBD (recommend a deep blue or warm coral, not edtech green) | Primary buttons, focus states, error markers |
| `success` | `#3F7D58` | Positive percentile band only |
| `warning` | `#C77D3F` | Yellow percentile band only |
| `alert` | `#A33D3D` | Red percentile band only |

Never use the percentile band colors anywhere except the band indicator. Don't decorate with them.

### 3.2 Typography

A pairing, not a font.

- **UI sans:** Inter, Geist, or Söhne — clean, neutral, modern. Used for everything UI: buttons, labels, navigation, metadata.
- **Reading serif:** Source Serif, Tiempos Text, or Newsreader — warm, literary, readable. Used exclusively for passage text the student reads, and for the AI-generated teacher summary in the report.

The serif is a trust signal. It tells the student *this is a book, not a test*. It tells the teacher *this is a doctor's note, not a dashboard widget*.

Type scale (8pt grid):

| Role | Size / weight |
|---|---|
| Display (hero text on student screens) | 56px / 600 |
| H1 | 32px / 600 |
| H2 | 24px / 600 |
| Passage text (serif) | 24px / 400, line-height 1.6 |
| Body | 16px / 400 |
| Metadata | 14px / 500 |
| Caption | 12px / 500 |

### 3.3 Spacing

8pt grid, generous. Default screen padding is 64px on desktop, 32px on tablet/Chromebook portrait. When in doubt, double the whitespace.

### 3.4 Motion

- **Page transitions:** 240ms, ease-out. A subtle slide or fade, never a flip or zoom.
- **Element entrance:** stagger by 40ms when multiple items appear.
- **Hover states:** 120ms, ease-out. Just enough to feel responsive.
- **Recording pulse:** 2s breathing cycle, smooth sine wave. Calm, not urgent.
- **Success state:** soft scale + fade, no bounce. Confident, not childish.

Use Framer Motion for everything. Never use CSS keyframes for anything more complex than a single transition.

### 3.5 Sound (yes, sound)

Edtech never does this. It's magical when done right and it's a tiny implementation cost.

- Soft tick when recording starts (a single muted "tap" sound, ~80ms)
- Gentle chime when student submits (one warm bell tone, ~600ms)
- No sound on the teacher dashboard — this is a focus space

All sounds optional, off by default in headphones-required school environments.

---

## 4. The six screens

Every screen of the app, with the design intent for each.

### 4.1 Student: landing (clicked the link)

**Full-bleed paper background.** Centered vertically and horizontally:

> ## What's your name?
> [single input field, large, no border, just a thin underline]
> [no submit button — pressing enter or tab proceeds]

The teacher's class label sits in 12px stone in the bottom-left corner: *"Period 3 ELA — Ms. Eileen"*. No app logo at the top. No "Welcome to FluencyScope!" No instructions.

Why: zero friction, zero performance pressure. The student doesn't even know yet they're about to read. They're just typing their name.

### 4.2 Student: pre-reading

The passage appears in serif type, full width but with comfortable measure (~70 characters per line). 24px serif, 1.6 line-height. Generous whitespace above and below.

At the bottom, one button: **Start reading**.

No timer shown. No word count. No "this will take 60 seconds." No instructions about volume or microphone.

Why: the student should feel like they're about to read a book, not take a test.

### 4.3 Student: reading

The passage stays. The "Start reading" button is gone. In its place, a single small dot pulses softly with a 2-second breathing cycle. Below it, in 14px stone:

> *Tap when you're done*

That's it. No giant red recording circle. No waveform animation. No "RECORDING" text in caps. Maximum calm.

Optional polish: as the student reads, very subtly highlight the word being detected by ASR with a soft accent-colored underline. (Stretch goal — only if it works flawlessly. Otherwise skip.)

### 4.4 Student: done

Soft fade. Centered:

> ## Nice work.
> [a small animation — a single drawn checkmark, or a gentle particle burst]

Below, in 14px stone: *"You can close this window."*

No score. No feedback. No "your teacher will review this." Nothing that signals judgment.

### 4.5 Teacher: dashboard

A single vertical list. No tables. No filters at the top. No sidebar nav.

Each row, generous padding:

```
Maya Chen                                        2:14 PM today
Period 3 ELA · Passage 3                       [waveform · 47s]
```

The waveform is a tiny inline visualization of the audio — 60-80px wide, low-contrast. It's a quiet visual fingerprint, not a chart.

Click a row → it expands inline (Linear-style) into the report, with the rest of the list dimming and pushing down. No modal. No new page.

Empty state when no readings yet: just a single line of serif type center-screen. *"No readings yet."* And below it, a small button: *"Create assessment"*.

### 4.6 Teacher: report

This is the one screen where information density matters. But it should feel like a *New York Times article*, not a dashboard.

**Top of report:**

> # Maya Chen
> *Period 3 ELA · Passage 3 · April 25, 2:14 PM*

**The headline number, large:**

> ## 87 WCPM
> 25th percentile · grade 6 spring

The percentile shows as a single soft horizontal bar — green/yellow/red filled to the percentile point. No bar chart. No axis labels.

**The audio:**

A full-width waveform spans the page. Errors are marked as small accent-colored dots at the timestamp where they occurred. Tapping a dot scrubs to that moment. Tapping anywhere on the waveform plays from there. The transcript appears below, with errors highlighted inline — tapping a highlighted word in the transcript also scrubs to that moment in the audio.

**The four prosody dimensions:**

Four small horizontal gauges, each a row, with the dimension name in 14px stone and a 1-4 indicator filled to the score:

```
Expression / volume   ●●●○
Phrasing              ●●○○
Smoothness            ●●●●
Pace                  ●●●○
```

**The AI summary:**

A single paragraph in 18px serif type, like a doctor's note:

> *Maya read at 87 WCPM with 94% accuracy, below the grade 6 spring benchmark of 145. Prosody is strong overall, but she consistently struggled with multisyllabic Tier 2 vocabulary — particularly words ending in -tion and -ular. Recommend targeted decoding practice on those patterns.*

**Override button:** small, tucked in the bottom-right corner, in 14px stone. *"Disagree with this score?"* Trust the AI; make corrections frictionless when the teacher needs them.

---

## 5. What we will not do

- ❌ Gamification. No badges, points, streaks, mascots, fireworks.
- ❌ Cartoon characters. No friendly owls, no robot tutors, no Duolingo green.
- ❌ Stock illustrations. No iStockphoto. No corporate Memphis style.
- ❌ Onboarding tours. The UI is simple enough that a tour is an admission of failure.
- ❌ Modals. They break flow. Use inline expansion, slide-in panels, or full-page transitions.
- ❌ Dropdown menus inside dropdown menus.
- ❌ More than one accent color.
- ❌ Tooltips that explain UI labels. If a label needs a tooltip, the label is wrong.
- ❌ Sidebar navigation. The app has six screens. We don't need a nav.
- ❌ Loading spinners. Use skeleton states or progress bars when waits exceed 400ms; otherwise show nothing.

---

## 6. References to steal from

Look at these often. Steal generously. Cite none.

| Product | What to learn from it |
|---|---|
| **Linear** | Inline expansion, keyboard navigation, density without clutter |
| **Things 3** | Typography, restraint, sound design, motion |
| **Arc Browser** | Bold type, generous whitespace, animation as language |
| **Raycast** | Speed, focus, single-action screens |
| **Stripe Dashboard** | Numbers as headlines, calm density |
| **Vercel** | Monochrome confidence, micro-interactions |
| **Pitch** | Beautiful empty states, considered transitions |
| **Notion (early)** | Typography hierarchy, content-first interfaces |
| **The New York Times article page** | The report screen aspires to this |
| **Apple Notes / Apple Books** | The student reading screen aspires to this |

Look at zero edtech apps for inspiration. Every reference should come from outside the category.

---

## 7. Tooling recommendations

| Need | Tool | Why |
|---|---|---|
| Component primitives | **shadcn/ui** with Tailwind | Linear-grade defaults, fully customizable, no vendor lock-in |
| Motion | **Framer Motion** | Native React, great defaults, escape hatches when needed |
| Iconography | **Phosphor Icons** or **Lucide** | Consistent stroke, large library, no Fisher-Price feel |
| Typography hosting | **Fontshare** (free) or **Adobe Fonts** | Higher-quality typefaces than Google Fonts for a tool this aesthetic-focused |
| Sound assets | Custom-recorded or licensed from **Soundsnap** | Two sounds is enough. Don't reuse stock UI sound packs |
| Design file | **Figma** | Standard. Build a component library that mirrors shadcn/ui 1:1 |

---

## 8. The hire that matters most

**Hire one excellent designer.** Not a generalist. Someone whose portfolio looks like Linear, Vercel, Arc, or independent product studios like Mercury, Dia, Plain.

This is the highest-leverage hire for a scalpel tool. A single designer for 4–6 weeks of focused work is worth more than two more engineers in this stage. The product is small enough that one designer can own every pixel; the design is ambitious enough that it cannot be done by a developer with a Tailwind library.

Where to find them: Read.cv, designer Twitter, Layers conference attendees, the credits on products you admire. Pay real money. Equity is fine, but the daily rate matters because you want their best 6 weeks, not their leftover hours.

---

## 9. Testing the design

Two tests, run continuously:

**The 6th grader test.** Sit a real 12-year-old in front of the student flow. Watch their face. If they look anxious, confused, or bored — even for a second — the design has failed. The reading screen specifically should feel calm. They should be willing to do it twice.

**The screenshot test.** Take a screenshot of any screen and post it next to a screenshot of Linear, Things, or Arc. If the FluencyScope screen looks visibly worse — cluttered, dated, generic — keep iterating. The bar is "indistinguishable from the best consumer software," not "good for edtech."

---

## 10. The honest summary

We're building a tool that two people use: a 12-year-old reading a passage, and a teacher reviewing their reading. Both deserve software that respects their time, their attention, and their dignity. Edtech almost never delivers this. We will, because the scope is narrow enough that we can.

The design is the product. The product is the design. They are not separable.
