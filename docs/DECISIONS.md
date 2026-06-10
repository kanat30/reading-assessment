# Decision Log — FluencyScope

> Append-only. Newest at the top. One entry per meaningful, lasting decision
> (strategic, architectural, or commercial).

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
