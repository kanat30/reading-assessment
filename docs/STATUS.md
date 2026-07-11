# Status — FluencyScope
_Last updated: 2026-07-11 by Claude Code_

**Stack:**
Next.js 16 (App Router) + React 19, shipped as a PWA (Serwist service worker) · Supabase (Postgres + RLS, Auth, Storage) · Deepgram `nova-3` ASR · Claude API (`@anthropic-ai/sdk`, model `claude-sonnet-4-6` via `lib/scoring/ai.ts`) · Tailwind CSS v4 + Base UI/shadcn + Framer Motion · wavesurfer.js · TypeScript · deployed on Vercel. Node 20+ (no `engines` field pinned).

**What's working / built:**
- Teacher auth (Supabase email/password) and dashboard with assessment/session lists, current-week default window, date filters, shareable assessment links, templates, numbered students.
- Student flow (no login): `read/[token]` → name entry → recording (MediaRecorder) → comprehension → done. **The read is a fixed 60-second timed sample: the app auto-stops and advances at the limit (no reliance on the student tapping stop), shown as a calm depleting bar with no ticking numbers and an "Almost done" cue in the final 10s; a manual stop remains for early finishers.** Upload retries with backoff and has offline recovery (auto-uploads when the connection returns); a failed upload keeps the recording so the student never re-reads.
- Scoring pipeline (`POST /api/score`): Deepgram `nova-3` (`filler_words`, passage `keyterm` prompting) → deterministic alignment/error classification → WCPM, accuracy, Hasbrouck–Tindal benchmark bands (BOY/MOY/EOY, median-of-3) → prosody (1–4) → error patterns → Claude teacher summary. Hardened: 25MB/10min caps, per-token rate limiting.
- **Not-reached handling (2026-07-11):** since the read is a fixed 60s sample, words past where the student stopped are excluded from scoring, error patterns, error counts, and the transcript (which collapses the unread remainder behind a "reached N of M words" marker) — they are no longer shown or counted as omission errors. Cutoff derived by `getLastReachedIndex()` (`lib/scoring/metrics.ts`). Migration 0019 applies the same cutoff to the override metric-recompute (fixes a latent bug where the first word-override recomputed accuracy over the whole passage). See DECISIONS 2026-07-11.
- **AI features are actually live as of 2026-07-10.** Three of four Claude call sites (summary, prosody, question generation) had shipped with a nonexistent model ID and were silently falling back for weeks. All four now use `CLAUDE_MODEL` from `lib/scoring/ai.ts` (verified against the live API); fallbacks log `[AI-FALLBACK]` so silent degradation can't recur.
- Leveled passage library (~60 passages, levels 3–7, Forms A/B/C, 300+ words each) with comprehension questions.
- Teacher report (`report/[id]` + print view): synced transcript, waveform, prosody gauges, error patterns, AI summary with advisory-only disclaimer, word-level overrides (approve/reject/flag with metric recompute), comprehension regrade, teacher notes + review-status workflow. **Multi-passage display fix (2026-07-11):** dashboard, report, and print view now resolve each session's passage from `sessions.passage_id` via the library instead of the assessment's single legacy passage, so median-of-3 sessions show their real distinct titles/text and the transcript matches the AI summary. See DECISIONS 2026-07-11.
- **Compliance surface started:** public `/explainability` page (deterministic scoring vs AI use, teacher override rights, data handling, known ASR limits) linked from the report; advisory-only framing on AI outputs.
- **Endpoint authorization:** `/api/audio/[id]` (student audio = potential biometric) and `/api/comprehension/regrade` now require an authenticated teacher of the session's school; anonymous `/api/comprehension` is bounded by a 2-hour window and one-time grading. See DECISIONS 2026-07-10.
- Admin console + analytics; audio via `/api/audio/[id]`; maintenance `scripts/` incl. `validate-wer.ts`.
- 18 ordered SQL migrations, **all applied to the live DB (verified 2026-07-10)**. 0017 fixed the override recalc (self-corrections count as correct; latest-override-wins) and revoked client-role EXECUTE on the internal helper — verified live: anon now gets 42501 where it previously executed; the backfill repaired session `43f1f6c4` exactly as predicted (WCPM 108→110, accuracy 96→98%). 0018 added the missing school check to `apply_session_override`. `npm run lint` (0 errors) and `npm run build` pass as of 2026-07-10.

**In progress:**
- Nothing mid-flight. Working tree holds the 2026-07-10 fixes plus the 2026-07-11 multi-passage display fix and not-reached handling (see git status), uncommitted. Migration 0019 needs `db push`; existing sessions' stored `error_patterns` need a re-run of `scripts/backfill-patterns.ts` (relax its skip filter) to drop the pre-fix inflated tail.

**Known gaps / tech debt:**
- **WER validation still has zero samples** (`validation-data/` holds only the template). Roadmap marks this as blocking any demo; the script is ready.
- Dashboard not seeded with realistic demo sessions (roadmap pre-demo item).
- No automated tests — quality relies on `lint` + `build` + manual testing. `lib/scoring/` remains the highest-value target for unit tests.
- Rate limiting on `/api/score` is per-Vercel-instance (in-memory) — bounds bursts, not exact; fine pre-pilot, revisit with a shared store if abuse appears.
- `.env.local`'s `SUPABASE_ACCESS_TOKEN` is expired (management API returns 401) — refresh it or remove it.
- `prep-files/ARCHITECTURE.md` is the original April plan, outrun by the code. Treat as rationale, not current state.
- Strategy fields (vision, pricing, GTM specifics) — see TODOs in `docs/PRODUCT.md`.

**Next concrete steps:**
- Commit the 2026-07-10 working-tree changes.
- **WER validation:** record 5–10 diverse readings (AAVE, Spanglish, newcomer accents), hand-transcribe, run `scripts/validate-wer.ts`. Target ±5 WCPM. Blocks the Eileen demo.
- Seed the dashboard with realistic sessions across benchmark bands before the demo.
- Remaining compliance items for ERMA: vendor disclosure one-pager, data-retention policy/automatic deletion, Rasinski MDFS tooltip rewrites.
- Decide on a testing strategy for `lib/scoring/`.
