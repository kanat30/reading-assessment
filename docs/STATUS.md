# Status — FluencyScope
_Last updated: 2026-06-10 by Claude Code_

**Stack:** (auto-inferred — verify)
Next.js 16 (App Router) + React 19, shipped as a PWA (Serwist service worker) · Supabase (Postgres + RLS, Auth, Storage) · Deepgram `nova-3` ASR · Claude API (`@anthropic-ai/sdk`) · Tailwind CSS v4 + Base UI/shadcn + Framer Motion · wavesurfer.js · TypeScript · deployed on Vercel. Node 20+ (no `engines` field pinned).

**What's working / built:** (auto-inferred from code + commits — verify)
- Teacher auth (Supabase email/password) and dashboard with assessment/session lists, date filters, shareable assessment links.
- Student flow (no login): `read/[token]` → name entry → recording (MediaRecorder) → comprehension → done.
- Scoring pipeline (`POST /api/score`): Deepgram ASR → deterministic alignment/error classification → WCPM, accuracy, percentile band → prosody (1–4) → error patterns → Claude teacher summary. Writes `sessions` + `session_events`.
- Comprehension questions: generation (`/api/generate-questions`, `/api/passage-questions`), grading, and partial-credit scoring.
- Teacher report (`report/[id]` + print view): synced transcript, waveform (click-to-seek), prosody gauges, error patterns, AI summary, teacher notes + review-status workflow.
- Admin console + analytics; assessment templates; numbered students.
- Audio served via `/api/audio/[id]`; one-off maintenance `scripts/` (backfill patterns/waveforms, prerequisite checks) run with `tsx`.
- 14 ordered SQL migrations (`supabase/migrations/0001`–`0014`).
- `npm run build` is expected to pass (ESLint config was fixed for the Vercel build per commit `815d1f5`) — not re-verified in this session.

**In progress:** (auto-inferred from uncommitted working tree — verify)
- Word-level teacher overrides: `app/api/event-override/`, `components/WordOverridePopover.tsx`, migration `0014_session_event_overrides.sql`.
- Comprehension partial-credit + regrade: `app/api/comprehension/regrade/`, edits to `lib/scoring/comprehension.ts`, `lib/scoring/types.ts`, report components.
- README + AGENTS.md were just rewritten to describe the real project (uncommitted).
- Strategy-as-code enforcement wired up (uncommitted): CLAUDE.md auto-imports PRODUCT/ROADMAP/STATUS via `@`; a committed `.claude/settings.json` Stop hook reminds when code is staged without `docs/STATUS.md`. The hook needs a `/hooks` reload or restart to go live this session.

**Known gaps / tech debt:**
- No automated tests at all — no test runner, scripts, or test files (auto-inferred — verify). Quality currently relies on `lint` + `build` + manual testing.
- `prep-files/ARCHITECTURE.md` is the original April plan and has been outrun by the code (comprehension, admin/analytics, templates, notes/review, overrides now exist despite being "out of scope V1" there). Treat it as rationale, not current state.
- `supabase/combined_migration.sql` deleted in the working tree; confirm migration application path.
- Strategy fields (vision, pricing, GTM, target-user specifics) are unknown from code — see TODOs in `docs/PRODUCT.md`.

**Next concrete steps:**
- Finish and commit the in-progress override + comprehension-regrade work.
- Fill PRODUCT.md / ROADMAP.md strategy TODOs from the Project side.
- Decide on a testing strategy for the deterministic scoring engine (`lib/scoring/`), the highest-value place for unit tests.
