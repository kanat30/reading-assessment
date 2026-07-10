# Decision Log — FluencyScope

> Append-only. Newest at the top. One entry per meaningful, lasting decision
> (strategic, architectural, or commercial).

## [2026-07-10] SECURITY DEFINER functions must self-check tenancy, pin search_path, and deny client roles by default
- **Decision:** Every `SECURITY DEFINER` function must (a) verify the caller's `school_id` against the target row itself — table RLS does not apply inside it; (b) `SET search_path = public, pg_temp`; (c) have EXECUTE revoked from `PUBLIC`/`anon` (and from `authenticated` too if it's an internal helper). Migrations 0017/0018 retrofit this onto the override functions.
- **Why:** Verified live: `recalculate_session_metrics` (0014) was executable by the anon key via PostgREST — Supabase grants EXECUTE to client roles by default — letting anyone recalc-and-read any school's session metrics. And `apply_session_override` (0008) checked "is a teacher" but not "is a teacher of this school", so any teacher could rewrite another school's scores given a session UUID. School-scoped table RLS existed in both cases and was bypassed by the definer context.
- **Alternatives considered:** SECURITY INVOKER + relying on table RLS (breaks the atomic recalc, which must read cross-checked rows); trusting UUID unguessability (session IDs circulate in URLs and student devices — not a tenancy boundary).
- **Implications for the code:** New DB functions follow the 0017/0018 template: tenancy check via `auth.uid()` → `teachers.school_id` → `assessments.school_id`, pinned search_path, explicit REVOKE/GRANT block at the bottom of the migration.

## [2026-07-10] Centralize the Claude model ID; make AI fallback failures loud
- **Decision:** All scoring-pipeline Claude calls go through `lib/scoring/ai.ts` (one exported client, one `CLAUDE_MODEL` constant — currently `claude-sonnet-4-6` — and a `logAiFallback()` helper every catch block must use).
- **Why:** Three of four call sites shipped with a nonexistent hand-constructed model ID (`claude-sonnet-4-5-20250514`) and 404'd for weeks; because each had a graceful fallback, the failure was invisible — teachers saw canned summaries and heuristic prosody believing it was AI. Silent degradation of AI features is a trust and (per DOE guidance) transparency problem.
- **Alternatives considered:** Fixing the strings in place (leaves four copies to drift again); an env var for the model (adds config surface without preventing the bad-snapshot failure mode).
- **Implications for the code:** New AI call sites must import from `lib/scoring/ai.ts`; catch blocks that fall back must call `logAiFallback()` so `[AI-FALLBACK]` is greppable in Vercel logs. Model upgrades are a one-line change.

## [2026-07-10] Anonymous student endpoints use capability-scoped access, teacher endpoints require auth
- **Decision:** Student-facing API routes (`/api/score`, `/api/comprehension` POST) stay anonymous but are bounded: the unguessable session/assessment token is the capability, plus a 2-hour submission window, one-time comprehension grading, a 25MB/10min upload cap, and per-token rate limiting. Teacher-facing routes that read or mutate student data (`/api/audio/[id]`, `/api/comprehension/regrade`) require an authenticated teacher whose `school_id` matches the session's school, even when they use the admin client internally.
- **Why:** Student audio is treated as potential biometric data under the March 2026 Chancellor's AI guidance; the audio endpoint previously served any student's recording to anyone holding a session UUID, indefinitely. Rate limits are per-token (not per-IP) because a whole class legitimately submits from behind one school NAT.
- **Alternatives considered:** Signed short-lived storage URLs for audio (cleaner long-term, more moving parts pre-pilot); per-IP rate limiting (breaks classrooms); requiring student logins (violates the no-login product constraint).
- **Implications for the code:** Any new route using `createAdminClient()` must either verify teacher+school or justify anonymity with an explicit capability bound. Pattern to copy: `app/api/audio/[id]/route.ts`.

## [2026-06-10] Enforce strategy-as-code with auto-load + a STATUS sync hook
- **Decision:** Stop relying on memory to keep the docs in sync. CLAUDE.md now `@`-imports PRODUCT/ROADMAP/STATUS so they load into context every session, and a committed `.claude/settings.json` Stop hook reminds when changes under `app/`, `lib/`, or `components/` are staged without `docs/STATUS.md`.
- **Why:** Operating rules 1 and 3 are the ones that get skipped under deadline; auto-loading makes "read the docs" automatic, and the hook catches status drift at the moment it matters (staging for a commit). Keying the hook off *staged* files — not the working tree — means in-progress feature work doesn't trigger constant nags.
- **Alternatives considered:** Leaving the rules as prose-only (drifts); a git `pre-commit` hook (stronger but lives outside the repo in `.git/hooks` and isn't version-controlled by default); putting the hook in `settings.local.json` (rejected — it's gitignored/personal, so it wouldn't enforce the rule for teammates or the connected Claude Project).
- **Implications for the code:** New committed `.claude/settings.json`; CLAUDE.md gains three `@`-imports. The hook is non-blocking (reminder only) and needs a `/hooks` reload or restart to go live the session it's added. DECISIONS.md stays un-imported by design (append-only history, not steering context).

## [2026-06-10] Initialize strategy-as-code documentation layer
- **Decision:** Add a version-controlled `docs/` strategy layer (PRODUCT, ROADMAP, DECISIONS, STATUS) alongside the code, readable by both Claude Code and a connected Claude Project.
- **Why:** Keep product strategy and current state next to the code, in sync, so the "why" lives beside the "how."
- **Alternatives considered:** Keeping strategy only in the Claude Project / external docs (drifts from code); using the existing `prep-files/` planning docs as-is (those are a static April plan, already outrun by the code).
- **Implications for the code:** New `docs/*.md` files; CLAUDE.md gains operating rules requiring these docs be read before, and updated after, substantive work. No code behavior change.

<!--
Entries below this line are auto-inferred from git history (auto-inferred — verify).
They are seeded so the log isn't empty; confirm or rewrite from the Project side.
-->

## [auto-inferred — verify] Deterministic scoring engine, LLM for interpretation only
- **Decision:** Word-level alignment, WCPM/accuracy, prosody, and error patterns are deterministic code (`lib/scoring/`); Claude is used only for teacher summaries, comprehension grading, and question generation — never to see raw audio.
- **Why:** Reliability and a hard student-data/AI constraint (see `docs/IMPORTANT_LONG_TERM.md`).
- **Alternatives considered:** Using an LLM for scoring directly. — TODO confirm
- **Implications for the code:** Scoring lives in `lib/scoring/`; LLM calls take structured data/text only.

## [auto-inferred — verify] Multi-tenant via Supabase RLS from day one
- **Decision:** Every tenant-scoped table carries `school_id` and is isolated by Postgres Row-Level Security; the service-role/admin client is reserved for trusted server paths (e.g. anonymous student submission).
- **Why:** Tenant isolation without app-layer enforcement; schema stable across planned versions.
- **Alternatives considered:** App-layer tenant filtering. — TODO confirm
- **Implications for the code:** New tables need RLS policies added as a new numbered migration in `supabase/migrations/`.
