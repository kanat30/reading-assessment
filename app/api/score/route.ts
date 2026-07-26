import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { DeepgramClient } from "@deepgram/sdk";
import { v4 as uuidv4 } from "uuid";

import { createAdminClient } from "@/lib/supabase/admin";
import { alignWords } from "@/lib/scoring/alignment";
import { calculateMetrics } from "@/lib/scoring/metrics";
import { computeErrorPatterns, toLegacyPatterns } from "@/lib/scoring/patterns";
import { generateSummary } from "@/lib/scoring/summary";
import { analyzeProsody } from "@/lib/scoring/prosody";
import { computeProsodyDimensions } from "@/lib/scoring/prosody-dimensions";
import { resolveNorms, ResolvedNorms } from "@/lib/scoring/norms";
import { extractPeaks } from "@/lib/scoring/waveform";
import { DeepgramWord, SessionEvent, ScoringMetrics, ProsodyScore, ProsodyDimensions, EnhancedErrorPattern } from "@/lib/scoring/types";
import { getPassageById } from "@/lib/passages/library";

const deepgram = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY! });

// A 3-minute WebM/Opus reading is ~3MB; 25MB is generous headroom while
// keeping storage/Deepgram spend bounded against abuse of this open endpoint.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_DURATION_SECONDS = 10 * 60;

// Best-effort rate limit, keyed by assessment token. Per-instance only on
// Vercel (no shared store), so it bounds bursts rather than being exact.
// Keyed per token — not per IP — because a whole class submits from behind
// one school NAT; the limit must allow a legitimate classroom burst.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_SUBMISSIONS_PER_WINDOW = 100;
const submissionWindows = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(token: string): boolean {
  const now = Date.now();
  const entry = submissionWindows.get(token);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    submissionWindows.set(token, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > MAX_SUBMISSIONS_PER_WINDOW;
}

/**
 * Extract keyterms from passage text to boost ASR recognition.
 * Focuses on proper nouns and challenging vocabulary.
 * Limited to 100 terms per Deepgram API constraint.
 */
function extractKeyterms(passageText: string): string[] {
  const words = passageText.split(/\s+/);
  const keyterms = new Set<string>();

  // Split into sentences to identify sentence-initial words
  const sentences = passageText.split(/[.!?]+/);
  const sentenceStarters = new Set<string>();
  for (const sentence of sentences) {
    const firstWord = sentence.trim().split(/\s+/)[0];
    if (firstWord) {
      sentenceStarters.add(firstWord.toLowerCase());
    }
  }

  for (const word of words) {
    // Clean the word of punctuation for matching
    const cleaned = word.replace(/[^a-zA-Z'-]/g, "");
    if (!cleaned || cleaned.length < 3) continue;

    // Proper nouns: capitalized words that aren't sentence starters
    // (character names, place names, etc.)
    if (
      /^[A-Z][a-z]/.test(cleaned) &&
      !sentenceStarters.has(cleaned.toLowerCase())
    ) {
      keyterms.add(cleaned);
    }

    // Multi-syllable words (rough heuristic: count vowel groups)
    // These are often challenging vocabulary
    const vowelGroups = cleaned.toLowerCase().match(/[aeiouy]+/g);
    if (vowelGroups && vowelGroups.length >= 3) {
      keyterms.add(cleaned);
    }
  }

  // Return up to 100 keyterms (API limit)
  return Array.from(keyterms).slice(0, 100);
}

interface ScoringResult {
  events: SessionEvent[];
  insertions: SessionEvent[];
  metrics: ScoringMetrics;
  prosody: ProsodyScore | null;
  prosodyDimensions: ProsodyDimensions;
  summary: string;
  errorPatterns: EnhancedErrorPattern[];
  avgConfidence: number;
  transcript: string;
  waveformPeaks: number[];
}

async function runScoringPipeline(
  sessionId: string,
  audioBuffer: Buffer,
  passageText: string,
  passageTitle: string,
  durationSeconds: number,
  norms: ResolvedNorms
): Promise<ScoringResult> {
  // Layer 1: Deepgram ASR
  // Extract passage-specific vocabulary to boost recognition accuracy
  const keyterms = extractKeyterms(passageText);

  const response = await deepgram.listen.v1.media.transcribeFile(audioBuffer, {
    model: "nova-3",
    language: "en",
    smart_format: false,
    punctuate: false,
    utterances: false,
    filler_words: true, // Capture hesitations (um, uh) for disfluency detection
    keyterm: keyterms.length > 0 ? keyterms : undefined, // Boost passage vocabulary
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

  // Layer 3: Calculate metrics + deterministic prosody dimensions
  const metrics = calculateMetrics(events, durationSeconds);
  const errorPatterns = computeErrorPatterns(events);
  const prosodyDimensions = computeProsodyDimensions(events, passageText, metrics.wcpm);

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
      norms,
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
    prosodyDimensions,
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
  durationSeconds: number,
  norms: ResolvedNorms
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
      durationSeconds,
      norms
    );

    const scoringDuration = (Date.now() - startTime) / 1000;

    // Build scores_json. `norms` is the session's single resolved norm set —
    // every surface (report header, group median, print, summary) renders
    // grade/period/cuts from this object and never re-derives them.
    const scoresJson = {
      metrics: result.metrics,
      norms,
      prosody: result.prosody,
      prosody_dimensions: result.prosodyDimensions,
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

    // Multi-passage support: passage tracking from library
    const passageId = formData.get("passage_id") as string | null;
    const passageIndexStr = formData.get("passage_index") as string | null;
    const passageIndex = passageIndexStr ? parseInt(passageIndexStr, 10) : 0;

    // Validate inputs
    if (!audioFile || !assessmentToken || !studentName || isNaN(durationSeconds)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json(
        { error: "Audio file too large" },
        { status: 413 }
      );
    }

    if (durationSeconds <= 0 || durationSeconds > MAX_DURATION_SECONDS) {
      return NextResponse.json(
        { error: "Invalid recording duration" },
        { status: 400 }
      );
    }

    if (isRateLimited(assessmentToken)) {
      return NextResponse.json(
        { error: "Too many submissions for this assessment; try again shortly" },
        { status: 429 }
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

    // Get passage - either from library (new flow) or database (legacy flow)
    let passageText: string;
    let passageTitle: string;
    let passageLevel: number | null = null;

    if (passageId) {
      // Library passage flow: look up passage from in-memory library
      const libraryPassage = getPassageById(passageId);
      if (!libraryPassage) {
        return NextResponse.json(
          { error: "Passage not found in library" },
          { status: 404 }
        );
      }
      passageText = libraryPassage.text;
      passageTitle = libraryPassage.title;
      passageLevel = libraryPassage.reading_level;
    } else if (assessment.passages) {
      // Legacy database passage flow
      passageText = assessment.passages.text;
      passageTitle = assessment.passages.title;
    } else {
      return NextResponse.json(
        { error: "No passage found for assessment" },
        { status: 404 }
      );
    }

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
    // Include passage tracking for multi-passage library flow
    const { error: sessionError } = await supabase.from("sessions").insert({
      id: sessionId,
      assessment_id: assessment.id,
      student_id: studentId,
      audio_url: audioPath,
      duration_seconds: durationSeconds,
      status: "pending",
      ...(passageId && { passage_id: passageId }),
      passage_index: passageIndex,
    });

    if (sessionError) {
      console.error("Error creating session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    // Resolve the norm set ONCE for this session: band by the student's grade
    // (captured at assessment creation) + assessment period; fall back to
    // estimating grade from passage level for older assessments, and label the
    // basis. Stored in scores_json.norms — the single source every surface
    // renders from.
    const norms = resolveNorms({
      studentGrade: assessment.student_grade ?? null,
      readingLevel: passageLevel ?? assessment.reading_level ?? null,
      period: assessment.assessment_period ?? null,
    });

    // Run scoring asynchronously
    waitUntil(
      processScoring(
        sessionId,
        audioBuffer,
        passageText,
        passageTitle,
        durationSeconds,
        norms
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
