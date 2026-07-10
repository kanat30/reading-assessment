# Roadmap — FluencyScope

> Format per item: what — why — status (planned / in-progress / parked / done)
>
> Precedence: STATUS.md is ground truth for what's built. "Now" = finishable from
> the current build plus everything gating the first pilot demo.

## Now — path to the Eileen demo + first pilot
- **Finish & commit word-level teacher overrides** — core V1 trust feature: per-word approve/reject of AI-flagged errors plus the ability to add missed words; corrections logged for manual parameter tuning (no automated retraining, per ERMA) — done (metric-recompute fix in migration 0017 pending `db push`, see STATUS.md)
- **Finish & commit comprehension partial-credit + regrade** — completes the end-of-passage comprehension *check* that qualifies the fluency score — done
- **WER validation** — highest-risk pre-demo variable; unvalidated ASR errors read as student reading errors and destroy teacher trust. Must confirm AAVE / Spanglish / newcomer accents score as non-errors. Blocks any demo — planned (gating)
- **Passage fixes** — passages are too short for a full one-minute read; need Lexile-leveling with below-grade routing; WCPM bands aligned to Hasbrouck–Tindal in Acadience At / Below / Well-Below language across BOY/MOY/EOY; median-of-3-passages protocol for comparability — planned
- **Rasinski MDFS tooltip rewrites** — plain-language definitions with 1–4 anchors for the Expression / Phrasing / Smoothness / Pace tooltips — planned
- **NYC DOE AI-guidance compliance pass** — public explainability page, advisory-only framing on AI outputs, and teacher-auth gating of student audio (biometric treatment) shipped 2026-07-10; remaining: vendor disclosure one-pager, data-retention/auto-deletion policy, full copy audit for placement/surveillance language — in-progress (compliance gate)
- **Seed dashboard with realistic sessions before the demo** — addresses content-density perception; a complete feature set can still feel sparse — planned
- **Eileen demo** — highest-priority next step; happens before any new features are added — planned
- **ERMA submission (parallel track)** — the actual NYC DOE deployment gate (~3 months); start now so it doesn't block expansion. Routes through Eileen as initiating principal — planned (parallel)
- **Matched-student validation design** — same students assessed manually and via FluencyScope, routed through Eileen as data custodian (Lauren cannot share PII). Open question: the school uses SDQA (grade level only, no WCPM) — resolve the comparison basis with Eileen before designing the cohort — planned

## Next — after the first pilot lands
- **SDQA-style adaptive placement step** — route students to the correct passage level before fluency assessment begins; strategically sound, in-scope as a routing step (not a standalone instrument) — planned
- **Join-code flow** — Kahoot-style PIN entry at a base URL; a priority before broader classroom testing, not a polish item — planned

## Later
- **V2 rostering** — Google Classroom API integration (self-serve via Google Cloud Console); deferred from V1 — planned
- **Clever integration** — gated behind a sales conversation; developer signup submitted with Library-tier framing — planned
- **Google SSO for @nycstudents.net** — requires ERMA approval; cannot be done independently — planned
- **Gradeloom integration** — FluencyScope as a module / "LEGO block" of the gradebook, still sold separately — planned
- **AI reliability layer (parked)** — reliability score / anomaly flags / "review-required" state to catch silent AI failure before it reaches gradebooks — parked (see docs/IMPORTANT_LONG_TERM.md)
- **Teacher-correction feedback loop (parked)** — use *categories* of corrections to refine prompts/rules; no student data trains any model (ERMA) — parked (see docs/IMPORTANT_LONG_TERM.md)

## Out of scope — do not build
Tutoring / practice · curriculum / instruction · comprehension-as-a-product (a validated construct with its own percentiles) · cross-student grouping engines · class or longitudinal trend analytics · SDQA as a standalone instrument · parent portal · K-5 / high school · custom teacher passage upload. The principle: **scalpel, not Swiss knife.**
