/**
 * Pull WER validation samples from the live database.
 *
 * WER (word error rate) validation checks whether Deepgram is *mis-hearing* what a
 * student actually said — the highest-risk variable in the product, because an ASR
 * mis-hearing gets scored as a student reading error (especially for AAVE / Spanglish /
 * newcomer accents) and silently corrupts WCPM. See validation-data/README.md.
 *
 * This script does the tedious half of setting up a validation run: for real sessions
 * that already have a recording, it downloads the audio and assembles
 * validation-data/samples.json pre-filled with everything the machine knows — the
 * passage text, the duration, and the app's own WCPM (in `notes`, for reference). It
 * leaves exactly two fields blank for you to fill by listening:
 *
 *   - hand_transcription : what the student ACTUALLY said, verbatim (fillers, repeats)
 *   - hand_wcpm          : your hand count of correct words
 *
 * Then `npx tsx scripts/validate-wer.ts` re-runs Deepgram on each audio and reports
 * WER (ASR vs your transcription) and the WCPM delta (app vs your count).
 *
 * Re-runnable: it MERGES into an existing samples.json, preserving any hand_transcription
 * / hand_wcpm you have already entered (keyed by session id) so a re-pull never clobbers
 * your work.
 *
 * Usage:
 *   npx tsx scripts/pull-wer-samples.ts                 # newest 25 sessions with audio
 *   npx tsx scripts/pull-wer-samples.ts --limit 10
 *   npx tsx scripts/pull-wer-samples.ts <sessionId> ... # specific sessions
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-only; bypasses RLS to read student audio —
 * this is trusted maintenance tooling, run locally by the product owner).
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { getPassageById } from "../lib/passages/library";

dotenv.config({ path: ".env.local" });

const AUDIO_BUCKET = "recordings";
const DATA_DIR = path.join(process.cwd(), "validation-data");
const SAMPLES_FILE = path.join(DATA_DIR, "samples.json");
const DEFAULT_LIMIT = 25;

interface ValidationSample {
  id: string;
  audio_file: string;
  passage_text: string;
  hand_transcription: string;
  hand_wcpm: number;
  duration_seconds: number;
  notes?: string;
}

// Minimal shapes for the columns we select.
interface SessionRow {
  id: string;
  audio_url: string | null;
  duration_seconds: number | null;
  scores_json: { metrics?: { wcpm?: number; accuracy_percent?: number } } | null;
  passage_id: string | null; // library passage id (text); null for legacy
  created_at: string;
  students: { first_name: string | null; last_name: string | null } | null;
  assessments: {
    reading_level: number | null;
    assessment_period: string | null;
    passage_id: string | null; // legacy passages(id) uuid
  } | null;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`✗ Missing ${name} in .env.local — cannot reach the database.`);
    process.exit(1);
  }
  return v;
}

function parseArgs(argv: string[]): { limit: number; ids: string[] } {
  const ids: string[] = [];
  let limit = DEFAULT_LIMIT;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--limit") {
      limit = parseInt(argv[++i], 10) || DEFAULT_LIMIT;
    } else {
      ids.push(argv[i]);
    }
  }
  return { limit, ids };
}

function studentLabel(s: SessionRow["students"]): string {
  const name = [s?.first_name, s?.last_name].filter(Boolean).join(" ").trim();
  return name || "unknown student";
}

// Resolve the passage the student actually read for this session: a library passage
// (sessions.passage_id, text id) takes precedence; otherwise the assessment's legacy
// passage (a passages(id) uuid), which we fetch separately. Mirrors the report's
// per-session passage resolution.
function resolveLibraryPassage(row: SessionRow): { text: string; title: string } | null {
  if (!row.passage_id) return null;
  const p = getPassageById(row.passage_id);
  return p ? { text: p.text, title: p.title } : null;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { limit, ids } = parseArgs(process.argv.slice(2));

  console.log("Pulling WER validation samples from the live database…\n");

  // Fetch candidate sessions (must have audio to validate).
  let query = supabase
    .from("sessions")
    .select(
      "id, audio_url, duration_seconds, scores_json, passage_id, created_at, " +
        "students(first_name, last_name), " +
        "assessments(reading_level, assessment_period, passage_id)"
    )
    .not("audio_url", "is", null)
    .order("created_at", { ascending: false });

  query = ids.length > 0 ? query.in("id", ids) : query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("✗ Query failed:", error.message);
    process.exit(1);
  }
  const sessions = (data ?? []) as unknown as SessionRow[];
  if (sessions.length === 0) {
    console.log("No sessions with audio found for that selection.");
    process.exit(0);
  }

  // Batch-fetch legacy passage texts for sessions without a library passage_id.
  const legacyIds = Array.from(
    new Set(
      sessions
        .filter((s) => !s.passage_id && s.assessments?.passage_id)
        .map((s) => s.assessments!.passage_id!)
    )
  );
  const legacyText = new Map<string, { text: string; title: string }>();
  if (legacyIds.length > 0) {
    const { data: passages, error: pErr } = await supabase
      .from("passages")
      .select("id, title, text")
      .in("id", legacyIds);
    if (pErr) {
      console.error("✗ Legacy passage lookup failed:", pErr.message);
      process.exit(1);
    }
    for (const p of passages ?? []) {
      legacyText.set(p.id as string, { text: p.text as string, title: p.title as string });
    }
  }

  // Preserve any hand-entered fields from a prior run.
  const prior = new Map<string, ValidationSample>();
  if (fs.existsSync(SAMPLES_FILE)) {
    try {
      const existing: ValidationSample[] = JSON.parse(fs.readFileSync(SAMPLES_FILE, "utf-8"));
      for (const s of existing) prior.set(s.id, s);
    } catch {
      console.warn("⚠️  Existing samples.json is not valid JSON — it will be overwritten.\n");
    }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const samples: ValidationSample[] = [];
  const skipped: string[] = [];

  for (const s of sessions) {
    const who = studentLabel(s.students);

    // Resolve passage text.
    const passage =
      resolveLibraryPassage(s) ||
      (s.assessments?.passage_id ? legacyText.get(s.assessments.passage_id) : undefined);
    if (!passage) {
      skipped.push(`${s.id} (${who}) — passage text could not be resolved`);
      continue;
    }
    if (!s.duration_seconds || s.duration_seconds <= 0) {
      skipped.push(`${s.id} (${who}) — no recorded duration`);
      continue;
    }

    // Download the audio into validation-data/.
    const ext = path.extname(s.audio_url!) || ".webm";
    const audioFile = `${s.id}${ext}`;
    const destPath = path.join(DATA_DIR, audioFile);
    const { data: blob, error: dlErr } = await supabase.storage
      .from(AUDIO_BUCKET)
      .download(s.audio_url!);
    if (dlErr || !blob) {
      skipped.push(`${s.id} (${who}) — audio download failed: ${dlErr?.message ?? "no data"}`);
      continue;
    }
    fs.writeFileSync(destPath, Buffer.from(await blob.arrayBuffer()));

    const appWcpm = s.scores_json?.metrics?.wcpm;
    const level = s.assessments?.reading_level;
    const period = s.assessments?.assessment_period;
    const noteBits = [
      who,
      level ? `Level ${level}` : null,
      period,
      appWcpm != null ? `app WCPM ${appWcpm}` : "app WCPM n/a",
      s.created_at.slice(0, 10),
    ].filter(Boolean);

    const priorSample = prior.get(s.id);
    samples.push({
      id: s.id,
      audio_file: audioFile,
      passage_text: passage.text,
      // Preserve prior hand entries; otherwise leave blank for the user to fill.
      hand_transcription: priorSample?.hand_transcription ?? "",
      hand_wcpm: priorSample?.hand_wcpm ?? 0,
      duration_seconds: Math.round(s.duration_seconds),
      notes: noteBits.join(" · "),
    });

    console.log(`  ✓ ${audioFile}  (${who}${appWcpm != null ? `, app WCPM ${appWcpm}` : ""})`);
  }

  fs.writeFileSync(SAMPLES_FILE, JSON.stringify(samples, null, 2) + "\n");

  console.log(`\nWrote ${samples.length} sample(s) to ${path.relative(process.cwd(), SAMPLES_FILE)}`);
  if (skipped.length > 0) {
    console.log(`\nSkipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  – ${s}`);
  }

  const needFilling = samples.filter((s) => !s.hand_transcription || !s.hand_wcpm).length;
  console.log(
    "\nNext:\n" +
      `  1. Open ${path.relative(process.cwd(), SAMPLES_FILE)} and, for each sample (${needFilling} still need it),\n` +
      "     listen to its audio in validation-data/ and fill:\n" +
      "       • hand_transcription — what the student ACTUALLY said, word for word\n" +
      "       • hand_wcpm          — your count of correct words\n" +
      "  2. Run:  npx tsx scripts/validate-wer.ts\n" +
      "\nTip: prioritize AAVE / Spanglish / newcomer-accent readers — that is the case\n" +
      "WER validation most needs to prove scores as non-errors.\n"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
