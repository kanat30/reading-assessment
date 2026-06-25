# Product — FluencyScope

**One-liner:** A voice-first oral reading fluency (ORF) assessment that lets a middle-school teacher screen a whole class through a shared link — no 1:1 sitting — and get a trustworthy, teacher-overridable fluency report in ~30 seconds per student.

**Problem:** NYC's mandated universal screeners are silent and multiple-choice; they cannot measure oral fluency. The only way to get WCPM today is a teacher sitting 1:1 with each student to time and hand-score — so costly it rarely happens at scale. That leaves a diagnostic gap between the silent universal screener and classroom intervention. FluencyScope fills exactly that gap.

**Target user / buyer:**
- **Buyer:** the school (principal / ELA lead). A per-school decision, not a district procurement.
- **User:** grades 6–8 ELA teachers; students read on Chromebooks via a no-login link.
- **Validators (not requirement-setters):** district Achievement & Instructional Specialists in Literacy — credibility anchors, never the contracting entity.

**Value proposition / why us:**
- Removes the 1:1 administration burden — the single reason oral fluency screening doesn't happen at scale in middle schools.
- A **secondary screener** that complements district-mandated instruments (Acadience), never replaces them. Scores in district-recognized terms: Hasbrouck–Tindal WCPM norms (public domain) shown in At / Below / Well-Below Benchmark bands.
- **Trust-first:** deterministic scoring (no LLM word-judging), every AI output teacher-overridable, advisory-only framing aligned to the March 2026 Chancellor's AI guidance.
- **Design wedge vs. the closest competitor (Amira Learning / HMH):** Amira is elementary-focused and cutesy. FluencyScope is middle-school, clean, typography-driven (Linear / Things 3 / Apple Books restraint) — no edtech chrome.

**Scope guardrails (scalpel, not Swiss knife):** FluencyScope measures oral reading fluency. It is not tutoring, curriculum, comprehension-as-a-product, cross-student grouping/analytics, or a platform. An end-of-passage comprehension *check* (to qualify the fluency score) is in scope; a validated comprehension construct with its own percentiles is not. SDQA-style placement is a routing step, not a standalone instrument.

**Commercial model:**
- Per-school annual license, ~$2.5k–$5k / school / year.
- Sold standalone today. May later become a module ("LEGO block") of Gradeloom, but still licensed and sold separately.
- Realistic NYC ARR: $1–3M across years 1–3. A high-quality adjacent product to the ABCHESS portfolio (Observly, Gradeloom) — not a venture-scale standalone.
- **GTM:** land via single-school pilot (Eileen) → clear ERMA → expand school-by-school within NYC DOE. District specialists provide validation and credibility, not the contract.

**Hard constraints:**
- **Regulatory:** ERMA approval is the deployment gate (~3-month process, run in parallel with the build). The March 2026 Chancellor's AI guidance (traffic-light framework) requires advisory-only framing, a prominent teacher override, a public explainability page, treating voice/audio as potential biometric data, and a vendor disclosure one-pager. No student data may train any model (ERMA).
- **Technical:** multi-tenant via Supabase RLS on `school_id`; the student flow must run on constrained NYC-spec Chromebooks over flaky WiFi; the LLM only ever sees structured data/text, never raw audio; AI outputs are always teacher-overridable.
- **Trust:** WER (ASR word error rate) is the highest-risk variable — ASR errors masquerade as student reading errors. Must be validated before any stakeholder demo, including AAVE / Spanglish / newcomer accents *not* scoring as errors.
