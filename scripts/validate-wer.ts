/**
 * WER Validation Script
 *
 * Compares hand-scored WCPM against app-calculated WCPM to validate ASR accuracy.
 * This is the critical pre-demo validation for building teacher trust.
 *
 * Usage:
 *   npx tsx scripts/validate-wer.ts
 *
 * Setup:
 *   1. Create validation-data/ folder in project root
 *   2. Add audio files (webm/mp3/wav)
 *   3. Create samples.json with ground truth data (see sample format below)
 *
 * Sample format (validation-data/samples.json):
 * [
 *   {
 *     "id": "sample-001",
 *     "audio_file": "sample-001.webm",
 *     "passage_text": "The quick brown fox...",
 *     "hand_transcription": "The quick brown fox...",
 *     "hand_wcpm": 142,
 *     "duration_seconds": 60,
 *     "notes": "AAVE speaker, grade 7"
 *   }
 * ]
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { DeepgramClient } from "@deepgram/sdk";
import { alignWords, normalizeWord } from "../lib/scoring/alignment";
import { calculateMetrics } from "../lib/scoring/metrics";
import { DeepgramWord } from "../lib/scoring/types";

dotenv.config({ path: ".env.local" });

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! });

// ============================================
// Types
// ============================================

interface ValidationSample {
  id: string;
  audio_file: string;
  passage_text: string;
  hand_transcription: string;
  hand_wcpm: number;
  duration_seconds: number;
  notes?: string;
}

interface ValidationResult {
  id: string;
  notes?: string;
  // ASR output
  asr_transcript: string;
  asr_word_count: number;
  // WER calculation (ASR vs hand transcription)
  wer_percent: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  // WCPM comparison
  hand_wcpm: number;
  app_wcpm: number;
  wcpm_delta: number;
  // Accuracy comparison
  app_accuracy: number;
  // Pass/fail
  passed: boolean;
}

// ============================================
// WER Calculation (Levenshtein at word level)
// ============================================

function calculateWER(
  reference: string[],
  hypothesis: string[]
): { wer: number; substitutions: number; deletions: number; insertions: number } {
  const ref = reference.map(normalizeWord).filter((w) => w.length > 0);
  const hyp = hypothesis.map(normalizeWord).filter((w) => w.length > 0);

  const n = ref.length;
  const m = hyp.length;

  if (n === 0) {
    return { wer: hyp.length > 0 ? 100 : 0, substitutions: 0, deletions: 0, insertions: m };
  }

  // DP matrix for edit distance
  const dp: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  // Operation tracking: 0=match, 1=sub, 2=del, 3=ins
  const ops: number[][] = Array(n + 1)
    .fill(null)
    .map(() => Array(m + 1).fill(0));

  for (let i = 0; i <= n; i++) {
    dp[i][0] = i;
    ops[i][0] = 2; // deletion
  }
  for (let j = 0; j <= m; j++) {
    dp[0][j] = j;
    ops[0][j] = 3; // insertion
  }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
        ops[i][j] = 0; // match
      } else {
        const sub = dp[i - 1][j - 1] + 1;
        const del = dp[i - 1][j] + 1;
        const ins = dp[i][j - 1] + 1;

        if (sub <= del && sub <= ins) {
          dp[i][j] = sub;
          ops[i][j] = 1; // substitution
        } else if (del <= ins) {
          dp[i][j] = del;
          ops[i][j] = 2; // deletion
        } else {
          dp[i][j] = ins;
          ops[i][j] = 3; // insertion
        }
      }
    }
  }

  // Traceback to count operations
  let substitutions = 0;
  let deletions = 0;
  let insertions = 0;
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && ops[i][j] === 0) {
      i--;
      j--;
    } else if (i > 0 && j > 0 && ops[i][j] === 1) {
      substitutions++;
      i--;
      j--;
    } else if (i > 0 && ops[i][j] === 2) {
      deletions++;
      i--;
    } else {
      insertions++;
      j--;
    }
  }

  const wer = (substitutions + deletions + insertions) / n;

  return {
    wer: Math.round(wer * 100 * 10) / 10, // Round to 1 decimal
    substitutions,
    deletions,
    insertions,
  };
}

// ============================================
// Keyterm Extraction (same as app/api/score/route.ts)
// ============================================

function extractKeyterms(passageText: string): string[] {
  const words = passageText.split(/\s+/);
  const keyterms = new Set<string>();

  const sentences = passageText.split(/[.!?]+/);
  const sentenceStarters = new Set<string>();
  for (const sentence of sentences) {
    const firstWord = sentence.trim().split(/\s+/)[0];
    if (firstWord) {
      sentenceStarters.add(firstWord.toLowerCase());
    }
  }

  for (const word of words) {
    const cleaned = word.replace(/[^a-zA-Z'-]/g, "");
    if (!cleaned || cleaned.length < 3) continue;

    if (/^[A-Z][a-z]/.test(cleaned) && !sentenceStarters.has(cleaned.toLowerCase())) {
      keyterms.add(cleaned);
    }

    const vowelGroups = cleaned.toLowerCase().match(/[aeiouy]+/g);
    if (vowelGroups && vowelGroups.length >= 3) {
      keyterms.add(cleaned);
    }
  }

  return Array.from(keyterms).slice(0, 100);
}

// ============================================
// Process Single Sample
// ============================================

async function processSample(
  sample: ValidationSample,
  dataDir: string
): Promise<ValidationResult> {
  const audioPath = path.join(dataDir, sample.audio_file);

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const audioBuffer = fs.readFileSync(audioPath);
  const keyterms = extractKeyterms(sample.passage_text);

  // Call Deepgram with same config as app
  const response = await deepgram.listen.v1.media.transcribeFile(audioBuffer, {
    model: "nova-3",
    language: "en",
    smart_format: false,
    punctuate: false,
    utterances: false,
    filler_words: true,
    keyterm: keyterms.length > 0 ? keyterms : undefined,
  });

  // Extract words
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transcriptResponse = response as any;
  const words: DeepgramWord[] =
    transcriptResponse?.results?.channels?.[0]?.alternatives?.[0]?.words?.map(
      (w: { word: string; start: number; end: number; confidence: number }) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
      })
    ) || [];

  const asrTranscript = words.map((w) => w.word).join(" ");

  // Calculate WER (ASR vs hand transcription)
  const handWords = sample.hand_transcription.split(/\s+/);
  const asrWords = asrTranscript.split(/\s+/);
  const werResult = calculateWER(handWords, asrWords);

  // Calculate app WCPM using same alignment as scoring pipeline
  const expectedWords = sample.passage_text.split(/\s+/);
  const { events } = alignWords(expectedWords, words);
  const metrics = calculateMetrics(events, sample.duration_seconds);

  // Calculate delta
  const wcpmDelta = Math.abs(sample.hand_wcpm - metrics.wcpm);
  const passed = wcpmDelta <= 5; // ±5 WCPM threshold

  return {
    id: sample.id,
    notes: sample.notes,
    asr_transcript: asrTranscript,
    asr_word_count: asrWords.length,
    wer_percent: werResult.wer,
    substitutions: werResult.substitutions,
    deletions: werResult.deletions,
    insertions: werResult.insertions,
    hand_wcpm: sample.hand_wcpm,
    app_wcpm: metrics.wcpm,
    wcpm_delta: wcpmDelta,
    app_accuracy: metrics.accuracy_percent,
    passed,
  };
}

// ============================================
// Main
// ============================================

async function main() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║           FluencyScope WER Validation Script               ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  const dataDir = path.join(process.cwd(), "validation-data");
  const samplesFile = path.join(dataDir, "samples.json");

  // Check for validation data
  if (!fs.existsSync(dataDir)) {
    console.log("⚠️  No validation-data/ folder found.\n");
    console.log("To set up validation:");
    console.log("  1. mkdir validation-data");
    console.log("  2. Add audio files (webm/mp3/wav)");
    console.log("  3. Create samples.json with ground truth\n");
    console.log("Sample format for samples.json:");
    console.log(JSON.stringify([
      {
        id: "sample-001",
        audio_file: "sample-001.webm",
        passage_text: "The passage text the student was reading...",
        hand_transcription: "What the teacher heard the student say...",
        hand_wcpm: 142,
        duration_seconds: 60,
        notes: "AAVE speaker, grade 7",
      },
    ], null, 2));
    process.exit(0);
  }

  if (!fs.existsSync(samplesFile)) {
    console.log("⚠️  No samples.json found in validation-data/\n");
    console.log("Create validation-data/samples.json with your ground truth data.");
    process.exit(0);
  }

  // Load samples
  const samples: ValidationSample[] = JSON.parse(fs.readFileSync(samplesFile, "utf-8"));
  console.log(`Found ${samples.length} validation sample(s)\n`);

  if (samples.length === 0) {
    console.log("No samples to process.");
    process.exit(0);
  }

  const results: ValidationResult[] = [];
  let passedCount = 0;

  // Process each sample
  for (const sample of samples) {
    process.stdout.write(`Processing ${sample.id}... `);

    try {
      const result = await processSample(sample, dataDir);
      results.push(result);
      if (result.passed) passedCount++;

      const status = result.passed ? "✓ PASS" : "✗ FAIL";
      console.log(`${status} (delta: ${result.wcpm_delta} WCPM)`);
    } catch (error) {
      console.log(`ERROR: ${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  // Summary
  console.log("\n" + "═".repeat(64));
  console.log("DETAILED RESULTS");
  console.log("═".repeat(64) + "\n");

  for (const result of results) {
    console.log(`┌─ ${result.id} ${result.notes ? `(${result.notes})` : ""}`);
    console.log(`│  WER: ${result.wer_percent}% (S:${result.substitutions} D:${result.deletions} I:${result.insertions})`);
    console.log(`│  Hand WCPM: ${result.hand_wcpm}  |  App WCPM: ${result.app_wcpm}  |  Delta: ${result.wcpm_delta}`);
    console.log(`│  App Accuracy: ${result.app_accuracy}%`);
    console.log(`└─ ${result.passed ? "✓ PASSED" : "✗ FAILED"}\n`);
  }

  // Aggregate stats
  console.log("═".repeat(64));
  console.log("AGGREGATE STATISTICS");
  console.log("═".repeat(64) + "\n");

  if (results.length > 0) {
    const avgWER = results.reduce((sum, r) => sum + r.wer_percent, 0) / results.length;
    const avgDelta = results.reduce((sum, r) => sum + r.wcpm_delta, 0) / results.length;
    const maxDelta = Math.max(...results.map((r) => r.wcpm_delta));
    const minDelta = Math.min(...results.map((r) => r.wcpm_delta));

    console.log(`Samples:       ${results.length}`);
    console.log(`Passed:        ${passedCount}/${results.length} (${Math.round((passedCount / results.length) * 100)}%)`);
    console.log(`Avg WER:       ${avgWER.toFixed(1)}%`);
    console.log(`Avg WCPM Δ:    ${avgDelta.toFixed(1)}`);
    console.log(`Max WCPM Δ:    ${maxDelta}`);
    console.log(`Min WCPM Δ:    ${minDelta}`);
    console.log("");

    if (passedCount === results.length) {
      console.log("🎉 All samples passed! ASR accuracy is within acceptable threshold (±5 WCPM).");
    } else {
      console.log(`⚠️  ${results.length - passedCount} sample(s) exceeded the ±5 WCPM threshold.`);
      console.log("   Review failed samples and consider:");
      console.log("   - Audio quality issues");
      console.log("   - Counting rule alignment (how disfluencies are handled)");
      console.log("   - Dialect-specific tuning");
    }
  }
}

main().catch(console.error);
