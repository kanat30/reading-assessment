import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { DeepgramClient } from "@deepgram/sdk";
import { v4 as uuidv4 } from "uuid";

import { createAdminClient } from "@/lib/supabase/admin";
import { alignWords } from "@/lib/scoring/alignment";
import { calculateMetrics, analyzeErrorPatterns } from "@/lib/scoring/metrics";
import { generateSummary } from "@/lib/scoring/summary";
import { analyzeProsody } from "@/lib/scoring/prosody";
import { extractPeaks } from "@/lib/scoring/waveform";
import { DeepgramWord, SessionEvent, ScoringMetrics, ProsodyScore, ErrorPattern } from "@/lib/scoring/types";

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! });

interface ScoringResult {
  events: SessionEvent[];
  insertions: SessionEvent[];
  metrics: ScoringMetrics;
  prosody: ProsodyScore | null;
  summary: string;
  errorPatterns: ErrorPattern[];
  avgConfidence: number;
  transcript: string;
  waveformPeaks: number[];
}

async function runScoringPipeline(
  sessionId: string,
  audioBuffer: Buffer,
  passageText: string,
  passageTitle: string,
  durationSeconds: number
): Promise<ScoringResult> {
  // Layer 1: Deepgram ASR
  const response = await deepgram.listen.v1.media.transcribeFile(audioBuffer, {
    model: "nova-3",
    language: "en",
    smart_format: false,
    punctuate: false,
    utterances: false,
  });

  // Extract words from response
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

  const transcript = words.map((w) => w.word).join(" ");

  // Extract waveform peaks for mini-waveform visualization (runs in parallel with alignment)
  const waveformPeaksPromise = extractPeaks(audioBuffer, 200);

  // Layer 2: Alignment & error classification
  const expectedWords = passageText.split(/\s+/);
  const { events, insertions } = alignWords(expectedWords, words);

  // Layer 3: Calculate metrics
  const metrics = calculateMetrics(events, durationSeconds);
  const errorPatterns = analyzeErrorPatterns(events);

  // Calculate average confidence
  const confidenceScores = events
    .filter((e) => e.confidence_score !== null)
    .map((e) => e.confidence_score!);
  const avgConfidence =
    confidenceScores.length > 0
      ? Math.round(
          (confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length) * 100
        )
      : 0;

  // Layer 4: Claude summary and prosody analysis (waveform peaks run in parallel)
  const [summary, prosody, waveformPeaks] = await Promise.all([
    generateSummary(
      metrics.wcpm,
      metrics.accuracy_percent,
      metrics.percentile_estimate,
      errorPatterns,
      passageTitle
    ),
    analyzeProsody(
      events,
      passageText,
      durationSeconds,
      metrics.wcpm,
      metrics.accuracy_percent
    ),
    waveformPeaksPromise,
  ]);

  return {
    events,
    insertions,
    metrics,
    prosody,
    summary,
    errorPatterns,
    avgConfidence,
    transcript,
    waveformPeaks,
  };
}

async function processScoring(
  sessionId: string,
  audioBuffer: Buffer,
  passageText: string,
  passageTitle: string,
  durationSeconds: number
) {
  const supabase = createAdminClient();
  const startTime = Date.now();

  try {
    // Update status to processing
    await supabase
      .from("sessions")
      .update({ status: "processing" })
      .eq("id", sessionId);

    // Run scoring pipeline
    const result = await runScoringPipeline(
      sessionId,
      audioBuffer,
      passageText,
      passageTitle,
      durationSeconds
    );

    const scoringDuration = (Date.now() - startTime) / 1000;

    // Build scores_json
    const scoresJson = {
      metrics: result.metrics,
      prosody: result.prosody,
      summary: result.summary,
      error_patterns: result.errorPatterns,
      avg_confidence: result.avgConfidence,
      scoring_duration_seconds: scoringDuration,
      waveform_peaks: result.waveformPeaks,
    };

    // Update session with results
    await supabase
      .from("sessions")
      .update({
        status: "complete",
        transcript: result.transcript,
        scores_json: scoresJson,
        scored_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    // Insert session events
    const eventRows = result.events.map((e) => ({
      session_id: sessionId,
      word_index: e.word_index,
      expected_word: e.expected_word,
      spoken_word: e.spoken_word,
      start_timestamp_ms: e.start_timestamp_ms,
      end_timestamp_ms: e.end_timestamp_ms,
      event_type: e.event_type,
      confidence_score: e.confidence_score,
    }));

    if (eventRows.length > 0) {
      await supabase.from("session_events").insert(eventRows);
    }

    console.log(`Scoring complete for session ${sessionId} in ${scoringDuration.toFixed(1)}s`);
  } catch (error) {
    console.error(`Scoring failed for session ${sessionId}:`, error);
    await supabase
      .from("sessions")
      .update({ status: "failed" })
      .eq("id", sessionId);
  }
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const formData = await request.formData();
    const audioFile = formData.get("audio") as File;
    const assessmentToken = formData.get("assessment_token") as string;
    const studentName = formData.get("student_name") as string;
    const durationSeconds = parseFloat(formData.get("duration_seconds") as string);

    // Validate inputs
    if (!audioFile || !assessmentToken || !studentName || isNaN(durationSeconds)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Parse student name
    const nameParts = studentName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Look up assessment by token
    const { data: assessment, error: assessmentError } = await supabase
      .from("assessments")
      .select("*, passages(*)")
      .eq("share_token", assessmentToken)
      .single();

    if (assessmentError || !assessment) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    // Check if assessment is expired
    if (assessment.expires_at && new Date(assessment.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Assessment has expired" },
        { status: 410 }
      );
    }

    const passage = assessment.passages;

    // Find or create student
    const { data: existingStudent } = await supabase
      .from("students")
      .select("id")
      .eq("school_id", assessment.school_id)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .single();

    let studentId: string;

    if (existingStudent) {
      studentId = existingStudent.id;
    } else {
      const { data: newStudent, error: studentError } = await supabase
        .from("students")
        .insert({
          school_id: assessment.school_id,
          first_name: firstName,
          last_name: lastName,
        })
        .select("id")
        .single();

      if (studentError || !newStudent) {
        console.error("Error creating student:", studentError);
        return NextResponse.json(
          { error: "Failed to create student record" },
          { status: 500 }
        );
      }

      studentId = newStudent.id;
    }

    // Generate session ID
    const sessionId = uuidv4();

    // Convert audio file to buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Upload audio to Supabase Storage
    const audioPath = `${sessionId}.webm`;
    const { error: uploadError } = await supabase.storage
      .from("recordings")
      .upload(audioPath, audioBuffer, {
        contentType: "audio/webm",
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading audio:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload audio" },
        { status: 500 }
      );
    }

    // Create session with status='pending'
    const { error: sessionError } = await supabase.from("sessions").insert({
      id: sessionId,
      assessment_id: assessment.id,
      student_id: studentId,
      audio_url: audioPath,
      duration_seconds: durationSeconds,
      status: "pending",
    });

    if (sessionError) {
      console.error("Error creating session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    // Run scoring asynchronously
    waitUntil(
      processScoring(
        sessionId,
        audioBuffer,
        passage.text,
        passage.title,
        durationSeconds
      )
    );

    // Return session ID immediately
    return NextResponse.json({ session_id: sessionId });
  } catch (error) {
    console.error("Scoring error:", error);
    return NextResponse.json(
      { error: "Failed to process reading" },
      { status: 500 }
    );
  }
}
