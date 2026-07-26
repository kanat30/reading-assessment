/**
 * Backfill for the 2026-07-26 norms/prosody pipeline changes (D1 + D2).
 *
 * For every completed session this script:
 *   1. Resolves the norm set ONCE — student grade (assessments.student_grade,
 *      null on pre-existing assessments) → passage-level estimate fallback,
 *      labeled — and writes it to scores_json.norms, so every report surface
 *      renders the same grade/period/cuts.
 *   2. Computes the deterministic prosody dimensions (pace/smoothness/phrasing;
 *      Expression stays teacher-rated) from the stored word events and writes
 *      scores_json.prosody_dimensions. Existing sessions predate dimensions.
 *   3. Regenerates the AI summary from the stored metrics + the resolved norm
 *      set, so old summaries citing "grade-6 spring benchmark of 150/146"
 *      can no longer contradict the report header. Skipped when:
 *        - the teacher overrode the summary (their words are never replaced), or
 *        - the session belongs to the demo tenant (hand-written summaries;
 *          pass --demo-summaries to regenerate those too).
 *
 * DRY-RUN BY DEFAULT — prints a before/after per session. Nothing is written
 * without --apply. Run this on the validation-cohort sessions before the
 * district experts review any reports.
 *
 * Usage:
 *   npx tsx scripts/backfill-norms.ts                    # dry-run, all completed sessions
 *   npx tsx scripts/backfill-norms.ts --limit 10
 *   npx tsx scripts/backfill-norms.ts <sessionId> ...    # specific sessions
 *   npx tsx scripts/backfill-norms.ts --apply            # write changes
 *   npx tsx scripts/backfill-norms.ts --apply --demo-summaries
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (+ ANTHROPIC_API_KEY for summary
 * regeneration) in .env.local. Trusted local tooling.
 */

import "./load-env"; // MUST be first: lib/scoring/ai.ts reads env at import time
import { createClient } from "@supabase/supabase-js";
import { getPassageById } from "../lib/passages/library";
import { resolveNorms, describeNormsBasis, getBand, getBandLabel } from "../lib/scoring/norms";
import { computeProsodyDimensions } from "../lib/scoring/prosody";
import { generateSummary } from "../lib/scoring/summary";
import { SessionEvent, EnhancedErrorPattern } from "../lib/scoring/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DEMO_SUMMARIES = args.includes("--demo-summaries");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : undefined;
const SESSION_IDS = args.filter((a, i) => !a.startsWith("--") && (limitIdx < 0 || i !== limitIdx + 1));

interface StoredScores {
  metrics?: { wcpm?: number; accuracy_percent?: number };
  norms?: unknown;
  prosody_dimensions?: unknown;
  summary?: string;
  error_patterns?: EnhancedErrorPattern[];
  [key: string]: unknown;
}

async function fetchSessions(withStudentGrade: boolean) {
  let query = supabase
    .from("sessions")
    .select(`
      id, passage_id, duration_seconds, scores_json,
      students(first_name, last_name),
      assessments(
        reading_level, assessment_period,${withStudentGrade ? " student_grade," : ""}
        passages(title, text),
        schools(name)
      )
    `)
    .eq("status", "complete")
    .order("created_at", { ascending: false });
  if (SESSION_IDS.length > 0) query = query.in("id", SESSION_IDS);
  if (LIMIT) query = query.limit(LIMIT);
  return query;
}

async function main() {
  // Tolerate a DB that predates migration 0023 (student_grade): all existing
  // assessments have no grade there anyway, so the estimated-from-level basis
  // is identical. Post-0023, the column is read and used.
  let { data: sessions, error } = await fetchSessions(true);
  if (error?.message?.includes("student_grade")) {
    console.log("(migration 0023 not applied yet — proceeding without student_grade)\n");
    ({ data: sessions, error } = await fetchSessions(false));
  }
  if (error || !sessions) {
    console.error("Failed to fetch sessions:", error?.message);
    process.exit(1);
  }

  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — ${sessions.length} completed sessions\n`);

  let updated = 0;
  let summariesRegenerated = 0;

  for (const s of sessions) {
    const scores = (s.scores_json ?? {}) as StoredScores;
    const wcpm = scores.metrics?.wcpm;
    const accuracy = scores.metrics?.accuracy_percent;
    const assessment = s.assessments as unknown as {
      reading_level: number | null;
      assessment_period: string | null;
      student_grade: number | null;
      passages: { title: string; text: string } | null;
      schools: { name: string } | null;
    } | null;
    const student = s.students as unknown as { first_name: string; last_name: string } | null;
    const label = `${s.id.slice(0, 8)} ${student?.first_name ?? "?"} ${student?.last_name ?? ""}`.trim();

    if (typeof wcpm !== "number") {
      console.log(`${label}: SKIP (no metrics in scores_json)`);
      continue;
    }

    // Resolve passage (library via session.passage_id, else legacy assessment passage)
    const libraryPassage = s.passage_id ? getPassageById(s.passage_id) : undefined;
    const passageText = libraryPassage?.text ?? assessment?.passages?.text ?? null;
    const passageTitle = libraryPassage?.title ?? assessment?.passages?.title ?? "the passage";

    // 1. Resolve the norm set once
    const norms = resolveNorms({
      studentGrade: assessment?.student_grade ?? null,
      readingLevel: libraryPassage?.reading_level ?? assessment?.reading_level ?? null,
      period: assessment?.assessment_period ?? null,
    });
    const { caption } = describeNormsBasis(norms);
    const band = getBandLabel(getBand(wcpm, norms.cuts));

    // 2. Prosody dimensions from stored events
    let dimensions = null;
    if (passageText) {
      const { data: events } = await supabase
        .from("session_events")
        .select("word_index, expected_word, spoken_word, start_timestamp_ms, end_timestamp_ms, event_type, confidence_score")
        .eq("session_id", s.id)
        .order("word_index");
      if (events && events.length > 0) {
        dimensions = computeProsodyDimensions(events as SessionEvent[], passageText, wcpm);
      }
    }

    // 3. Summary regeneration — never over a teacher's own words
    const { data: summaryOverrides } = await supabase
      .from("session_overrides")
      .select("id")
      .eq("session_id", s.id)
      .eq("field_name", "summary")
      .limit(1);
    const teacherEdited = (summaryOverrides?.length ?? 0) > 0;
    const isDemo = (assessment?.schools?.name ?? "").includes("(Demo)");
    const skipSummary = teacherEdited || (isDemo && !DEMO_SUMMARIES);

    let newSummary: string | null = null;
    if (!skipSummary && typeof accuracy === "number") {
      newSummary = await generateSummary(
        wcpm,
        accuracy,
        norms,
        scores.error_patterns ?? [],
        passageTitle
      );
      summariesRegenerated++;
    }

    console.log(`${label}`);
    console.log(`  norms: ${caption} [basis: ${norms.basis}] → ${band}`);
    console.log(`  dims:  ${dimensions ? `pace ${dimensions.pace} · smoothness ${dimensions.smoothness} · phrasing ${dimensions.phrasing} · expression unrated` : "(no events — skipped)"}`);
    if (newSummary) {
      console.log(`  summary OLD: ${String(scores.summary ?? "").slice(0, 110)}`);
      console.log(`  summary NEW: ${newSummary.slice(0, 110)}`);
    } else {
      console.log(`  summary: kept (${teacherEdited ? "teacher-edited" : isDemo ? "demo tenant" : "no accuracy stored"})`);
    }

    if (APPLY) {
      const nextScores: StoredScores = {
        ...scores,
        norms,
        ...(dimensions ? { prosody_dimensions: dimensions } : {}),
        ...(newSummary ? { summary: newSummary } : {}),
      };
      const { error: updateError } = await supabase
        .from("sessions")
        .update({ scores_json: nextScores })
        .eq("id", s.id);
      if (updateError) {
        console.log(`  !! update failed: ${updateError.message}`);
      } else {
        updated++;
      }
    }
    console.log("");
  }

  console.log(
    `${APPLY ? `Updated ${updated} sessions` : "Dry-run complete — nothing written"}; summaries regenerated: ${summariesRegenerated}.`
  );
}

main();
