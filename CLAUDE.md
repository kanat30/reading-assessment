@AGENTS.md

<!-- ====================================================================== -->
<!-- Appended 2026-06-10 — do not edit the line above this block.          -->
<!-- ====================================================================== -->

## Strategy-as-code operating rules

The strategy docs below are auto-loaded into context every session so they always steer
the work (this replaces "remember to read them"). DECISIONS.md is intentionally not
imported — it is append-only history, not steering context.

@docs/PRODUCT.md
@docs/ROADMAP.md
@docs/STATUS.md

The `docs/` folder is the source of truth for *why* this product exists; the code is the
*how*. Before and after substantive work, keep them in sync:

1. Before any non-trivial feature or refactor, read `docs/PRODUCT.md` and `docs/ROADMAP.md`
   and let them constrain your approach. If a request conflicts with them, flag it.
2. When you make a decision with lasting impact (architecture, dependency, scope,
   commercial-facing behavior), prepend an entry to `docs/DECISIONS.md` using the entry
   format already in that file.
3. After meaningful changes, update `docs/STATUS.md` (what's now built / in progress /
   next). Keep it honest — it is what the strategy side reads to know real progress.
4. Never silently diverge from `docs/`. If reality has outrun the docs, update the docs
   in the same change.
