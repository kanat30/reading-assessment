<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# FluencyScope

Oral reading fluency assessment for middle-school teachers. Teachers create an assessment from a passage and share a link; a student opens it, reads aloud while the browser records, and the app transcribes, scores, and reports. See `README.md` for the full overview and `prep-files/ARCHITECTURE.md` for design rationale (note: that doc is the original plan — the code has since added comprehension questions, admin/analytics, assessment templates, teacher notes/review workflow, and word-level overrides).

## Stack

Next.js 16 (App Router) + React 19 PWA on Vercel · Supabase (Postgres + RLS, Auth, Storage) · Deepgram `nova-3` ASR · Claude API (`@anthropic-ai/sdk`) · Tailwind v4 + Base UI/shadcn · wavesurfer.js.

## Where things live

- `app/api/*` — route handlers. `score` runs the scoring pipeline; `comprehension`, `event-override`, `override`, `session-notes`, `session-status`, `templates`, `passage-questions`, `generate-questions`, `audio/[id]`, `sessions/[id]`.
- `lib/scoring/*` — the **deterministic** scoring engine (alignment, metrics, prosody, patterns, comprehension, summary). Keep word-level scoring rule-based; the LLM only sees structured data/text, never raw audio.
- `lib/supabase/{browser,server,admin}.ts` — pick the right client: `browser` in client components, `server` in server components/route handlers (respects RLS via the user session), `admin` only in trusted server code (service role, bypasses RLS).
- `app/read/[token]/*` — student flow (no auth, keep it light — runs on constrained Chromebooks). `app/report/[id]/*` and `app/dashboard`, `app/admin` — teacher side.

## Conventions

- **Multi-tenancy is enforced by RLS on `school_id`** — don't bypass it with the admin client unless the route genuinely needs to (e.g. anonymous student submission). New tables need RLS policies; add them as a new numbered migration in `supabase/migrations/` (never edit a committed migration).
- Path alias `@/*` maps to the project root.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`) are server-only — never reference them in client components or `NEXT_PUBLIC_*`.
- Run `npm run lint` and `npm run build` before considering a change done; the Vercel build must pass.
- AI outputs are always teacher-overridable. When touching scoring, preserve the override flow (overrides live in `session_event_overrides` and metrics recompute from them).
- When using Claude models, default to the latest (e.g. Opus/Sonnet 4.x) and consult the `claude-api` skill for current model IDs.
