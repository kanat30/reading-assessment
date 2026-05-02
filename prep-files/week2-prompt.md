# FluencyScope — Week 2 Build Prompt

You are a coding agent with terminal and filesystem access. Week 1 has shipped: a working end-to-end magic moment (record → score → report) at `./fluencyscope`. The aesthetic is roughly right but unpolished, the audio capture is basic MediaRecorder defaults, and the report has a plain `<audio>` element instead of a proper waveform.

Week 2 has three goals:

1. **Polish the student experience** until a real 12-year-old uses it without anxiety.
2. **Make the audio capture resilient** to flaky NYC school WiFi (IndexedDB buffering, retry logic).
3. **Upgrade the report's audio playback** to a real waveform with error dots and a synced transcript.

Work autonomously. Do not stop between sections.

---

## Section A — Student flow polish

### A1. Convert `/read` to `/read/[token]`

Currently the static student route is `/read`. Convert it to a dynamic route at `app/read/[token]/page.tsx`. The token is a URL-safe random string. For now, the only valid token is `demo` — anything else 404s with a calm serif "Reading not found" message. (Real token validation against the DB lands in Week 3.)

The root `app/page.tsx` redirect should now point to `/read/demo` instead of `/read`.

Pass the token through to the recording and done routes — they'll need it in Week 3 to associate readings with assessments. For now just thread it as a URL param: `/read/demo/recording`, `/read/demo/done?s=...`. Use Next.js parallel folder structure: `app/read/[token]/recording/page.tsx` and `app/read/[token]/done/page.tsx`. Move the existing logic into these.

### A2. Add the name-entry screen

Currently `/read/[token]` lands directly on the passage. Per DESIGN.md section 4.1, before the passage there should be a name screen.

Insert a new state at the top of `app/read/[token]/page.tsx` — call it the "landing" state. Use `useState` to track which step the user is on within this single route (don't add another route for this).

The landing state shows:

- Centered vertically and horizontally on the paper background
- In Source Serif 4 32px weight 600: **"What's your name?"**
- Below it, a single text input. No border, no box. Just a 1px `mist` underline that becomes 1px `accent` on focus. Inter 24px weight 400. Width ~480px. No placeholder. No label. No submit button.
- The input has autoFocus on mount.
- Pressing Enter (or Tab) advances to the passage view, but only if the input has at least 2 characters and a space (rough "first and last name" check). Otherwise the underline briefly flashes `alert` color and a soft 12px stone hint appears: *"Type your first and last name"*. This hint fades after 3 seconds.
- In the bottom-left corner of the viewport, in 12px stone: `Period 3 ELA · Ms. Eileen` (hard-coded for V1 — comes from the assessment record in Week 3).
- No app logo. No "Welcome to FluencyScope." No instructions.

The name persists in `sessionStorage` under key `fs:student-name` and is read by the recording screen so it can be sent to the score API later.

### A3. Smooth page transitions

Wrap the four student states (landing → pre-reading → reading → done) in Framer Motion `AnimatePresence`. Each transition is:

- **240ms ease-out**
- Opacity fade only — no slides, no zooms
- Stagger child elements by 40ms when the new state mounts (e.g., the headline appears, then the input, then the corner label)

The reading screen specifically should feel like the world holds its breath when the dot appears. Test by clicking through the flow yourself and watching for any abrupt cuts or twitches. If anything feels jumpy, slow it down before adjusting.

### A4. Recording state polish

Refine the pulsing dot from Part 1:

- Confirm the breathing cycle is exactly 2.0 seconds, sine-wave easing, opacity 0.3 → 1.0 → 0.3
- Add a subtle scale animation: 1.0 → 1.15 → 1.0, in sync with the opacity
- Color stays accent

Add a soft tick sound when recording actually starts (after mic permission grants). Source: a single sine-wave-shaped 80ms tap, ~440Hz, gentle attack and release. Generate it programmatically with the Web Audio API — do not include an audio file. Implementation:

```ts
function playStartTick() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 440;
  osc.type = "sine";
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}
```

Sounds are **off by default** — add a `localStorage` flag `fs:sounds-enabled` (default `false`). For V1 demo just expose a tiny toggle in the bottom-right corner of the landing screen — 12px stone, "sound: off" / "sound: on", clickable. School environments require headphones; this respects that.

### A5. Done screen polish

Currently the done screen just fades in text. Add: a single drawn checkmark SVG, 48px, in `success` color, that animates its stroke-dashoffset from full length to 0 over 600ms ease-out. The checkmark appears first, then 200ms later "Nice work." fades in below it.

Add a gentle chime sound when the done screen mounts (also gated by the sound flag). One warm bell-like tone, ~600ms, descending: 880Hz → 660Hz with a long exponential decay.

The "View report →" demo link from Week 1 stays but should be even more recessive — opacity 0.4, only opacity 1 on hover. This is a backstage door, not a feature.

### A6. Microphone permission flow

Test the cold microphone permission flow. The first time a user reaches the recording screen, the browser will pop up a permission prompt. While that prompt is showing, the screen should display:

- Centered, in Source Serif 4 24px italic stone: *"Allow microphone access to begin"*
- An arrow SVG pointing to the upper-left corner of the viewport (where Chrome's prompt appears) — drawn, not clipart, in stone color, 32px

If the user denies permission:
- Show a calm error state: serif type, *"We need your microphone to hear you read."*
- Below it, 14px stone: *"Click the lock icon in your browser's address bar and allow microphone access. Then refresh this page."*
- A subtle "Refresh" button in the corner.

No alert dialogs. No red exclamation icons. Calm everywhere.

---

## Section B — Audio capture resilience

### B1. Configure MediaRecorder properly

Update the MediaRecorder configuration in the recording screen:

```ts
const recorder = new MediaRecorder(stream, {
  mimeType: "audio/webm;codecs=opus",
  audioBitsPerSecond: 24000, // 24 kbps mono
});
```

Verify the browser actually honors this — if `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` is false on a target browser, fall back to `audio/webm` and log a warning. Capture audio in 1-second chunks (`recorder.start(1000)`) so we can buffer them.

### B2. Buffer audio chunks to IndexedDB during recording

Per ARCHITECTURE.md section 6.5: the recording must survive a mid-reading WiFi drop. Strategy:

- Open an IndexedDB database `fluencyscope` with object store `audio-chunks` keyed by `[session_id, chunk_index]`
- On each `dataavailable` event from MediaRecorder, write the chunk to IndexedDB
- Generate a client-side `session_id` (UUID) when recording starts
- After the recorder stops, assemble the chunks into a single Blob *from IndexedDB* (not from in-memory) — this is the upload payload
- After successful upload, delete the chunks from IndexedDB

Implement this in `lib/audio/buffer.ts` with an interface:

```ts
export async function appendChunk(sessionId: string, index: number, chunk: Blob): Promise<void>;
export async function assembleBlob(sessionId: string): Promise<Blob>;
export async function clearSession(sessionId: string): Promise<void>;
export async function listOrphanedSessions(): Promise<string[]>;
```

`listOrphanedSessions` finds session IDs in IndexedDB that haven't been cleared — used by the "back online" recovery flow below.

### B3. Upload retry with exponential backoff

In the recording screen, after the recorder stops:

1. Show *"Scoring your reading..."* state
2. Attempt POST to `/api/score` with the assembled audio blob
3. On network failure or non-2xx response, retry up to 3 times with exponential backoff: 1s, 2s, 4s
4. If all 3 retries fail:
   - Persist the audio blob in IndexedDB (it's already there, just don't clear it)
   - Show a calm message: *"We'll save this when you're back online. You can close this window."* in serif type
   - Register a service worker background sync (or a `setInterval` poll every 30s if the browser doesn't support sync) that retries the upload when connectivity returns
   - Once the upload succeeds, clear the IndexedDB session
5. On success, clear the IndexedDB session and navigate to done

Show "Saved!" in 14px stone for 1 second only after the server confirms — never optimistically.

### B4. Recover orphaned sessions on next load

When the recording screen mounts, call `listOrphanedSessions()`. If any sessions exist (a previous reading that never uploaded successfully), kick off background uploads for each in parallel before showing the recording UI. Don't block the user — just retry quietly. Log to console for now; a proper teacher-facing notification comes in Week 4.

---

## Section C — Report view: real waveform

### C1. Install WaveSurfer

```bash
npm install wavesurfer.js
```

### C2. Replace the `<audio>` element with a waveform

In `app/report/[id]/page.tsx`, build a new client component `<ReportWaveform>` that takes:
- `audioUrl: string`
- `events: SessionEvent[]` (from the session)

It renders:
- A WaveSurfer instance, full container width, height 64px
- Waveform color: `stone` (low contrast — this is a quiet visual fingerprint, not a chart)
- Progress (played) color: `ink`
- Cursor color: `accent`
- Background transparent (no panel, no border)
- Bar style: `barWidth: 2, barGap: 2, barRadius: 1`

Above the waveform, overlay `accent`-colored dots at the timestamps of every error event (`substitution` or `omission`). Each dot is 8px, slightly above the waveform line, with a 1px white stroke so it reads against the bars. Dots are absolutely positioned; their `left` is calculated from `event.start_timestamp_ms / total_duration_ms`.

Click handlers:
- Click anywhere on the waveform → seek to that point and play
- Click a dot → seek to that error's timestamp and play (use `event.stopPropagation`)

Below the waveform, show a play/pause button and the current time / total time in 12px stone Inter. No volume slider, no scrubber separate from the waveform — the waveform IS the scrubber.

### C3. Synced transcript

The transcript was rendered in Week 1 with errors highlighted inline. Now make every word clickable:

- Wrap each word in a `<span>` with `data-start={event.start_timestamp_ms}` and `data-end={event.end_timestamp_ms}`
- Click on any word → seek the WaveSurfer instance to that timestamp and play
- During playback, the currently-spoken word gets a soft `accent`-colored background highlight (5% opacity). Update this on WaveSurfer's `audioprocess` event, throttled to 100ms
- Hover state: subtle `mist` background

Words without timestamps (omissions) are not clickable — keep them styled but inert.

### C4. Prosody gauges (placeholder for V1)

The four MDFS prosody dimensions (Expression/Volume, Phrasing, Smoothness, Pace) are real scores in V2 but are simplified rules-based estimates in V1. For now, hard-code reasonable values derived from existing data:

- **Expression** = 3 if average word duration variance is "moderate", else 2 (use a simple heuristic on word durations)
- **Phrasing** = 4 minus the count of pauses > 1.5s, clamped to 1-4
- **Smoothness** = 4 minus number of self-corrections, clamped to 1-4
- **Pace** = scaled from WCPM (90+ → 4, 70-89 → 3, 50-69 → 2, <50 → 1)

Add the gauge UI below the percentile bar, above the transcript:

Each dimension is a row, 14px stone label on the left (40% width), four small dots on the right filled to the score:
```
Expression / volume   ●●●○
Phrasing              ●●○○
```

Filled dots are `ink`, empty dots are `mist`. 8px dots, 4px gap. Don't use the percentile band colors here.

---

## Section D — Verification

1. Run through the full student flow on `localhost:3000` — landing → name → passage → recording → done. Note any rough edges and fix them before stopping.
2. Open Chrome DevTools, throttle network to "Slow 3G," and run the flow again. Verify the audio uploads successfully (with retries visible in the network tab) and the report still renders.
3. Disable network entirely mid-recording. Stop the recording. Verify the "We'll save this when you're back online" state appears. Re-enable network. Verify the upload completes and the report becomes accessible.
4. On the report page, click an error dot on the waveform — verify the audio jumps to that moment. Click a word in the transcript — verify the same.
5. Test the cold microphone permission flow in an incognito window.

If any of these fail, fix before stopping.

---

## Output

Report back with:
1. Which subsections completed cleanly
2. Any rough edges remaining (with notes on whether they're worth Week 3 attention or can ship as-is)
3. Bundle size of the student route — run `npm run build` and report the JS bundle for `/read/[token]`. The Week 6 budget is under 200 KB; flag if we're already over.
4. Any blockers

## Quality bar

A 12-year-old should sit down and use this without you needing to explain anything. The recording screen specifically should feel calm, not like a test. If you watch the flow and feel any anxiety yourself — the dot pulsing too aggressively, a transition feeling jumpy, the name input feeling demanding — fix it. The bar is "Apple Books, not edtech."
