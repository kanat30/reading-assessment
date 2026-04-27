/**
 * Backfill script for waveform peaks on existing sessions.
 *
 * This script:
 * 1. Finds all sessions with status='complete' that don't have waveform_peaks
 * 2. Downloads the audio from Supabase Storage
 * 3. Extracts peaks using the same algorithm as the scoring pipeline
 * 4. Updates the session's scores_json with the peaks
 *
 * Run with: npx tsx scripts/backfill-waveforms.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { extractPeaks } from "../lib/scoring/waveform";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SessionRow {
  id: string;
  audio_url: string;
  scores_json: Record<string, unknown> | null;
}

async function backfillWaveforms() {
  console.log("=== Backfilling Waveform Peaks ===\n");

  // Find all complete sessions without waveform_peaks
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, audio_url, scores_json")
    .eq("status", "complete")
    .not("scores_json", "is", null);

  if (error) {
    console.error("Error fetching sessions:", error.message);
    process.exit(1);
  }

  // Filter to only sessions without waveform_peaks
  const sessionsToBackfill = (sessions as SessionRow[]).filter((s) => {
    const scoresJson = s.scores_json as Record<string, unknown> | null;
    return !scoresJson?.waveform_peaks;
  });

  if (sessionsToBackfill.length === 0) {
    console.log("No sessions need backfilling. All done!");
    return;
  }

  console.log(`Found ${sessionsToBackfill.length} session(s) to backfill.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const session of sessionsToBackfill) {
    const sessionId = session.id;
    const audioUrl = session.audio_url;

    process.stdout.write(`Processing ${sessionId}... `);

    try {
      // Download audio from Supabase Storage
      const { data: audioData, error: downloadError } = await supabase.storage
        .from("recordings")
        .download(audioUrl);

      if (downloadError || !audioData) {
        console.log(`SKIP (audio not found: ${downloadError?.message})`);
        errorCount++;
        continue;
      }

      // Convert Blob to Buffer
      const arrayBuffer = await audioData.arrayBuffer();
      const audioBuffer = Buffer.from(arrayBuffer);

      // Extract peaks
      const peaks = await extractPeaks(audioBuffer, 200);

      if (peaks.every((p) => p === 0)) {
        console.log("SKIP (could not decode audio)");
        errorCount++;
        continue;
      }

      // Update scores_json with peaks
      const updatedScoresJson = {
        ...session.scores_json,
        waveform_peaks: peaks,
      };

      const { error: updateError } = await supabase
        .from("sessions")
        .update({ scores_json: updatedScoresJson })
        .eq("id", sessionId);

      if (updateError) {
        console.log(`ERROR (${updateError.message})`);
        errorCount++;
        continue;
      }

      console.log("OK");
      successCount++;
    } catch (err) {
      console.log(`ERROR (${err instanceof Error ? err.message : "unknown"})`);
      errorCount++;
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Success: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
}

backfillWaveforms().catch(console.error);
