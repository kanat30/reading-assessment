/**
 * Prosody dimension recalibration harness (D2, DECISIONS 2026-07-26).
 *
 * Pulls every completed session's word events from the live DB, runs the
 * deterministic dimension rules from lib/scoring/prosody.ts over them, and
 * prints the resulting 1-4 distributions per dimension — plus the raw input
 * rates (WCPM, disfluencies/100 words, mid-sentence pauses/100 words) at key
 * quantiles so thresholds can be sanity-checked against the data rather than
 * guessed. The point: values must SPREAD across 1-4. The old client-side rule
 * (pace=4 whenever WCPM>=90) pinned every on-benchmark reader at 4/4.
 *
 * Read-only. Usage:
 *   npx tsx scripts/recalibrate-prosody.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env.local (trusted local tooling).
 */

import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getPassageById } from "../lib/passages/library";
import { computeProsodyDimensions } from "../lib/scoring/prosody";
import { SessionEvent } from "../lib/scoring/types";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(supabaseUrl, serviceKey);

function quantiles(values: number[], qs: number[]): number[] {
  if (values.length === 0) return qs.map(() => NaN);
  const sorted = [...values].sort((a, b) => a - b);
  return qs.map((q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
}

function distLine(label: string, values: number[]): string {
  const counts = [1, 2, 3, 4].map((v) => values.filter((x) => x === v).length);
  const total = values.length || 1;
  const pct = counts.map((c) => `${String(Math.round((c / total) * 100)).padStart(3)}%`);
  return `${label.padEnd(12)} 1:${String(counts[0]).padStart(3)} (${pct[0]})  2:${String(counts[1]).padStart(3)} (${pct[1]})  3:${String(counts[2]).padStart(3)} (${pct[2]})  4:${String(counts[3]).padStart(3)} (${pct[3]})`;
}

async function main() {
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, passage_id, duration_seconds, scores_json, assessments(passages(text), schools(name))")
    .eq("status", "complete")
    .limit(500);

  if (error || !sessions) {
    console.error("Failed to fetch sessions:", error?.message);
    process.exit(1);
  }

  const rows: {
    id: string;
    demo: boolean;
    wcpm: number;
    disflPer100: number;
    midPausePer100: number;
    pace: number;
    smoothness: number;
    phrasing: number;
  }[] = [];

  for (const s of sessions) {
    const scores = s.scores_json as { metrics?: { wcpm?: number } } | null;
    const wcpm = scores?.metrics?.wcpm;
    if (typeof wcpm !== "number" || wcpm <= 0) continue;

    // Resolve passage text (library first, legacy assessment passage fallback)
    const libraryPassage = s.passage_id ? getPassageById(s.passage_id) : undefined;
    const assessmentRel = s.assessments as unknown as {
      passages?: { text?: string };
      schools?: { name?: string };
    } | null;
    const passageText = libraryPassage?.text ?? assessmentRel?.passages?.text;
    if (!passageText) continue;
    // Seeded demo sessions have SYNTHETIC word timing — fine for rate-based
    // dimensions (wcpm, disfluency counts), misleading for pause-based ones.
    const demo = (assessmentRel?.schools?.name ?? "").includes("(Demo)");

    const { data: events } = await supabase
      .from("session_events")
      .select("word_index, expected_word, spoken_word, start_timestamp_ms, end_timestamp_ms, event_type, confidence_score")
      .eq("session_id", s.id)
      .order("word_index");
    if (!events || events.length === 0) continue;

    const typedEvents = events as SessionEvent[];
    const dims = computeProsodyDimensions(typedEvents, passageText, wcpm);

    // Recompute the raw input rates for the quantile table (mirrors prosody.ts)
    const attempted = typedEvents.filter((e) => e.event_type !== "insertion");
    const attemptedCount = Math.max(1, attempted.length);
    const disfl = attempted.filter(
      (e) => e.event_type === "self_correction" || e.event_type === "mispronunciation"
    ).length;
    const words = passageText.split(/\s+/);
    const timed = typedEvents
      .filter((e) => e.start_timestamp_ms !== null && e.end_timestamp_ms !== null)
      .sort((a, b) => (a.start_timestamp_ms ?? 0) - (b.start_timestamp_ms ?? 0));
    let midPauses = 0;
    for (let i = 1; i < timed.length; i++) {
      const gap = (timed[i].start_timestamp_ms ?? 0) - (timed[i - 1].end_timestamp_ms ?? 0);
      if (gap > 600) {
        const prevWord = words[timed[i - 1].word_index] || "";
        if (!/[.!?,;:]["')\]]*$/.test(prevWord)) midPauses++;
      }
    }

    rows.push({
      id: s.id.slice(0, 8),
      demo,
      wcpm,
      disflPer100: (disfl / attemptedCount) * 100,
      midPausePer100: (midPauses / attemptedCount) * 100,
      pace: dims.pace,
      smoothness: dims.smoothness,
      phrasing: dims.phrasing,
    });
  }

  const qs = [0.1, 0.25, 0.5, 0.75, 0.9];
  const qLabel = qs.map((q) => `p${q * 100}`).join("  ");
  const fmt = (v: number[]) => v.map((x) => x.toFixed(1).padStart(6)).join(" ");

  for (const cohort of ["real", "demo"] as const) {
    const subset = rows.filter((r) => (cohort === "demo") === r.demo);
    console.log(`\n===== ${cohort.toUpperCase()} sessions: ${subset.length} =====`);
    if (subset.length === 0) continue;
    console.log("Raw input rates (quantiles " + qLabel + "):");
    console.log(`  WCPM                    ${fmt(quantiles(subset.map((r) => r.wcpm), qs))}`);
    console.log(`  disfluencies /100 words ${fmt(quantiles(subset.map((r) => r.disflPer100), qs))}`);
    console.log(`  mid-sent pauses /100    ${fmt(quantiles(subset.map((r) => r.midPausePer100), qs))}`);
    console.log("Dimension value distributions (current thresholds in lib/scoring/prosody.ts):");
    console.log("  " + distLine("pace", subset.map((r) => r.pace)));
    console.log("  " + distLine("smoothness", subset.map((r) => r.smoothness)));
    console.log("  " + distLine("phrasing", subset.map((r) => r.phrasing)));
  }

  // Per-session table for spot-checking
  console.log("\nsession   wcpm  disfl/100  midP/100  pace smooth phras");
  for (const r of rows.slice(0, 60)) {
    console.log(
      `${r.id}  ${String(r.wcpm).padStart(4)}  ${r.disflPer100.toFixed(1).padStart(8)}  ${r.midPausePer100.toFixed(1).padStart(8)}  ${String(r.pace).padStart(4)} ${String(r.smoothness).padStart(6)} ${String(r.phrasing).padStart(5)}`
    );
  }
  if (rows.length > 60) console.log(`… ${rows.length - 60} more`);
}

main();
