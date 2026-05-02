/**
 * Backfill script for enhanced error patterns on existing sessions.
 *
 * This script:
 * 1. Finds all sessions with status='complete' that have session_events
 * 2. Fetches session_events for each session
 * 3. Computes error patterns using the new enhanced algorithm
 * 4. Updates the session's scores_json with the enhanced patterns
 *
 * Run with: npx tsx scripts/backfill-patterns.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { computeErrorPatterns, EnhancedErrorPattern } from "../lib/scoring/patterns";
import { SessionEvent, EventType } from "../lib/scoring/types";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SessionRow {
  id: string;
  scores_json: Record<string, unknown> | null;
}

interface SessionEventRow {
  word_index: number;
  expected_word: string;
  spoken_word: string | null;
  start_timestamp_ms: number | null;
  end_timestamp_ms: number | null;
  event_type: string;
  confidence_score: number | null;
}

async function backfillPatterns() {
  console.log("=== Backfilling Enhanced Error Patterns ===\n");

  // Find all complete sessions with scores_json
  const { data: sessions, error } = await supabase
    .from("sessions")
    .select("id, scores_json")
    .eq("status", "complete")
    .not("scores_json", "is", null);

  if (error) {
    console.error("Error fetching sessions:", error.message);
    process.exit(1);
  }

  // Filter to sessions that don't have the new enhanced error_patterns format
  // (check for 'id' property which is unique to EnhancedErrorPattern)
  const sessionsToBackfill = (sessions as SessionRow[]).filter((s) => {
    const scoresJson = s.scores_json as Record<string, unknown> | null;
    const errorPatterns = scoresJson?.error_patterns as unknown[];
    // If no error_patterns or first pattern doesn't have 'id', need to backfill
    if (!errorPatterns || errorPatterns.length === 0) return true;
    const firstPattern = errorPatterns[0] as Record<string, unknown>;
    return !firstPattern?.id;
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

    process.stdout.write(`Processing ${sessionId}... `);

    try {
      // Fetch session events
      const { data: events, error: eventsError } = await supabase
        .from("session_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("word_index", { ascending: true });

      if (eventsError) {
        console.log(`SKIP (events fetch error: ${eventsError.message})`);
        errorCount++;
        continue;
      }

      if (!events || events.length === 0) {
        console.log("SKIP (no events)");
        errorCount++;
        continue;
      }

      // Convert to SessionEvent format
      const sessionEvents: SessionEvent[] = (events as SessionEventRow[]).map((e) => ({
        word_index: e.word_index,
        expected_word: e.expected_word,
        spoken_word: e.spoken_word,
        start_timestamp_ms: e.start_timestamp_ms,
        end_timestamp_ms: e.end_timestamp_ms,
        event_type: e.event_type as EventType,
        confidence_score: e.confidence_score,
      }));

      // Compute enhanced patterns
      const enhancedPatterns: EnhancedErrorPattern[] = computeErrorPatterns(sessionEvents);

      // Update scores_json with new patterns
      const updatedScoresJson = {
        ...session.scores_json,
        error_patterns: enhancedPatterns,
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

      console.log(`OK (${enhancedPatterns.length} patterns)`);
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

backfillPatterns().catch(console.error);
