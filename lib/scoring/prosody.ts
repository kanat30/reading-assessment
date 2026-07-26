import { SessionEvent, ProsodyScore, ProsodyDimensions, ProsodyDimensionValue } from "./types";
import { anthropic, CLAUDE_MODEL, logAiFallback } from "./ai";

/*
 * ============================================================================
 * Deterministic prosody dimensions (Rasinski MDFS dimensions)
 * ============================================================================
 * Computed server-side at score time and stored in scores_json.prosody_dimensions.
 * Only what ASR timing/event data can honestly support is computed:
 *
 *  - Pace       — from WCPM (rate appropriateness)
 *  - Smoothness — from the disfluency rate (self-corrections + mispronunciations)
 *  - Phrasing   — from pause placement (mid-sentence vs. at punctuation)
 *
 * Expression (pitch, stress, intonation) CANNOT be derived from word timestamps —
 * the old client-side heuristic used word-duration variance, which mostly measured
 * word-length mix, not expressiveness. Expression is therefore teacher-rated:
 * null ("Not yet rated") until a teacher sets it through the override flow.
 *
 * Thresholds below were calibrated against the existing scored sessions
 * (scripts/recalibrate-prosody.ts prints the distribution) so values spread
 * across 1-4 instead of pinning at 4 — the old client rule (pace=4 whenever
 * WCPM>=90) filled every dot for any on-benchmark reader.
 */

// Pace: WCPM bands. Anchored to the middle-school H-T range: the grade 4-8
// p50s run ~94-151, so 4 means "conversational rate for MS" and 1 means
// laborious. (Rasinski: 4 = consistently conversational, 1 = slow and laborious.)
// Calibrated 2026-07-26 (real sessions spread 37/23/33/7 across 1-4; the
// realistic seeded classroom spreads 10/20/48/22) — replaces the old client
// rule (4 whenever WCPM>=90) that filled every dot for on-benchmark readers.
const PACE_CUTS = { four: 140, three: 110, two: 85 };

// Smoothness: disfluencies (self-corrections + mispronunciations) per 100
// attempted words. Rate-based, not absolute count, so a 200-word read isn't
// judged harsher than an 80-word read. (Rasinski: 4 = smooth with few breaks,
// 1 = frequent extended pauses/hesitations, multiple attempts.)
// Calibrated 2026-07-26: real-session disfluency rates p25=1.3 / p50=2.8 /
// p75=5.7 / p90=15.1 per 100 words; these cuts spread 17/20/37/27 across 1-4.
const SMOOTHNESS_CUTS = { four: 1.5, three: 4, two: 8 }; // max rate for each value

// Phrasing: pauses that break the syntax — >600ms gaps NOT following
// punctuation — per 100 attempted words. Pausing at punctuation is good
// phrasing; pausing mid-clause is word-by-word reading. (Rasinski: 4 = well
// phrased respecting punctuation, 1 = monotonic word-by-word.)
// Calibrated 2026-07-26 on the 30 real (non-demo) sessions: mid-sentence pause
// rates ran p50=1.0 / p75=1.9 / p90=5.7 per 100 words; these cuts spread the
// cohort ~50/25/15/10 across 4/3/2/1 instead of pinning 77% at 4.
const PHRASING_PAUSE_MS = 600;
const PHRASING_CUTS = { four: 0.5, three: 2, two: 5 }; // max mid-sentence pauses /100 words

function bandDown(value: number, cuts: { four: number; three: number; two: number }): ProsodyDimensionValue {
  // Higher value is worse (rates); cuts are inclusive maxima.
  if (value <= cuts.four) return 4;
  if (value <= cuts.three) return 3;
  if (value <= cuts.two) return 2;
  return 1;
}

export function computeProsodyDimensions(
  events: SessionEvent[],
  passageText: string,
  wcpm: number
): ProsodyDimensions {
  const attempted = events.filter((e) => e.event_type !== "insertion");
  const attemptedCount = Math.max(1, attempted.length);

  // --- Pace ---
  const pace: ProsodyDimensionValue =
    wcpm >= PACE_CUTS.four ? 4 : wcpm >= PACE_CUTS.three ? 3 : wcpm >= PACE_CUTS.two ? 2 : 1;

  // --- Smoothness ---
  const disfluencies = attempted.filter(
    (e) => e.event_type === "self_correction" || e.event_type === "mispronunciation"
  ).length;
  const disfluencyRate = (disfluencies / attemptedCount) * 100;
  const smoothness = bandDown(disfluencyRate, SMOOTHNESS_CUTS);

  // --- Phrasing ---
  const words = passageText.split(/\s+/);
  const timed = events
    .filter((e) => e.start_timestamp_ms !== null && e.end_timestamp_ms !== null)
    .sort((a, b) => (a.start_timestamp_ms ?? 0) - (b.start_timestamp_ms ?? 0));
  let midSentencePauses = 0;
  for (let i = 1; i < timed.length; i++) {
    const gap = (timed[i].start_timestamp_ms ?? 0) - (timed[i - 1].end_timestamp_ms ?? 0);
    if (gap > PHRASING_PAUSE_MS) {
      const prevWord = words[timed[i - 1].word_index] || "";
      if (!/[.!?,;:]["')\]]*$/.test(prevWord)) {
        midSentencePauses++;
      }
    }
  }
  const midSentenceRate = (midSentencePauses / attemptedCount) * 100;
  const phrasing = bandDown(midSentenceRate, PHRASING_CUTS);

  return { pace, smoothness, phrasing, expression: null };
}

/**
 * Loose input shape for the helpers below: stored scores_json comes back from
 * the DB untyped, so accept any object with number-ish dimension fields.
 */
export interface ProsodyDimensionsLike {
  pace?: number | null;
  smoothness?: number | null;
  phrasing?: number | null;
  expression?: number | null;
}

/**
 * Headline prosody (the x/4 shown in metric rows): the median of the stored
 * dimensions — the three computed ones until Expression is teacher-rated, all
 * four after. Works on any object shaped like ProsodyDimensions so it can run
 * client-side over scores_json (which already reflects teacher overrides,
 * since apply_session_override writes into prosody_dimensions).
 */
export function deriveProsodyHeadline(
  dimensions: ProsodyDimensionsLike | null | undefined
): number | null {
  if (!dimensions) return null;
  const values = [dimensions.pace, dimensions.smoothness, dimensions.phrasing, dimensions.expression]
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/**
 * Total across the four dimensions for the /16 (or /12 while Expression is
 * unrated) display. Cuts from the interpretation spec: <=8 of 16 = area of
 * concern, >=9 = developing appropriately (advisory framing only).
 */
export function prosodyTotal(
  dimensions: ProsodyDimensionsLike | null | undefined
): { total: number; max: 12 | 16; expressionRated: boolean } | null {
  if (!dimensions) return null;
  const computed = [dimensions.pace, dimensions.smoothness, dimensions.phrasing]
    .filter((v): v is number => typeof v === "number");
  if (computed.length !== 3) return null;
  const expressionRated = typeof dimensions.expression === "number";
  const total = computed.reduce((a, b) => a + b, 0) + (expressionRated ? (dimensions.expression as number) : 0);
  return { total, max: expressionRated ? 16 : 12, expressionRated };
}

interface PauseData {
  avgPauseBetweenWords: number;
  longPauses: number;        // Pauses > 500ms
  veryLongPauses: number;    // Pauses > 1000ms
  pausesAtPunctuation: number;
  pausesMidSentence: number;
}

function analyzePauses(events: SessionEvent[], passageText: string): PauseData {
  const pauseData: PauseData = {
    avgPauseBetweenWords: 0,
    longPauses: 0,
    veryLongPauses: 0,
    pausesAtPunctuation: 0,
    pausesMidSentence: 0,
  };

  const timedEvents = events.filter(
    (e) => e.start_timestamp_ms !== null && e.end_timestamp_ms !== null
  );

  if (timedEvents.length < 2) return pauseData;

  const pauses: number[] = [];
  const words = passageText.split(/\s+/);

  for (let i = 1; i < timedEvents.length; i++) {
    const prev = timedEvents[i - 1];
    const curr = timedEvents[i];

    if (prev.end_timestamp_ms !== null && curr.start_timestamp_ms !== null) {
      const pause = curr.start_timestamp_ms - prev.end_timestamp_ms;
      if (pause > 0) {
        pauses.push(pause);

        if (pause > 500) pauseData.longPauses++;
        if (pause > 1000) pauseData.veryLongPauses++;

        // Check if pause was at punctuation
        const prevWord = words[prev.word_index] || "";
        const endsWithPunctuation = /[.!?,;:]$/.test(prevWord);

        if (pause > 200) {
          if (endsWithPunctuation) {
            pauseData.pausesAtPunctuation++;
          } else {
            pauseData.pausesMidSentence++;
          }
        }
      }
    }
  }

  pauseData.avgPauseBetweenWords = pauses.length > 0
    ? pauses.reduce((a, b) => a + b, 0) / pauses.length
    : 0;

  return pauseData;
}

export async function analyzeProsody(
  events: SessionEvent[],
  passageText: string,
  durationSeconds: number,
  wcpm: number,
  accuracy: number
): Promise<ProsodyScore> {
  const pauseData = analyzePauses(events, passageText);

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `You are assessing a student's oral reading prosody using the NAEP Oral Reading Fluency Scale (1-4). Analyze the timing data and provide a prosody assessment.

NAEP Scale:
- Level 4: Reads primarily in larger, meaningful phrase groups. Expression is consistent and reflects understanding of text.
- Level 3: Reads primarily in three- or four-word phrase groups. Some expression. Mostly smooth.
- Level 2: Reads primarily in two-word phrases with some three- or four-word groupings. Word-by-word reading may occur. Little expression.
- Level 1: Reads primarily word-by-word. Occasional two-word phrases. No expression, ignores punctuation.

Reading Data:
- Words read: ${events.length}
- Duration: ${durationSeconds.toFixed(1)} seconds
- WCPM: ${wcpm}
- Accuracy: ${accuracy}%
- Average pause between words: ${pauseData.avgPauseBetweenWords.toFixed(0)}ms
- Long pauses (>500ms): ${pauseData.longPauses}
- Very long pauses (>1s): ${pauseData.veryLongPauses}
- Pauses at punctuation: ${pauseData.pausesAtPunctuation}
- Pauses mid-sentence: ${pauseData.pausesMidSentence}

Based on this data, assess the prosody. Respond in this exact JSON format:
{
  "level": <1-4>,
  "expression": "<one sentence about expression/intonation>",
  "phrasing": "<one sentence about phrasing patterns>",
  "pace": "<one sentence about pace/rhythm consistency>",
  "explanation": "<2-3 sentence overall assessment>"
}

Respond ONLY with the JSON, no other text.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (textBlock) {
      const parsed = JSON.parse(textBlock.text);
      return {
        level: parsed.level as 1 | 2 | 3 | 4,
        expression: parsed.expression,
        phrasing: parsed.phrasing,
        pace: parsed.pace,
        explanation: parsed.explanation,
      };
    }
  } catch (error) {
    logAiFallback("prosody", error);
  }

  // Fallback: estimate prosody from pause data
  let level: 1 | 2 | 3 | 4 = 2;
  if (pauseData.veryLongPauses > 5 || pauseData.avgPauseBetweenWords > 400) {
    level = 1;
  } else if (pauseData.longPauses < 3 && pauseData.pausesMidSentence < pauseData.pausesAtPunctuation) {
    level = accuracy > 90 ? 4 : 3;
  }

  return {
    level,
    expression: "Expression assessment requires audio analysis.",
    phrasing: pauseData.pausesMidSentence > pauseData.pausesAtPunctuation
      ? "Frequent mid-sentence pauses suggest word-by-word reading."
      : "Pauses generally align with punctuation.",
    pace: pauseData.veryLongPauses > 3
      ? "Pace is inconsistent with several long hesitations."
      : "Pace is relatively steady.",
    explanation: `Prosody level ${level} based on pause patterns and timing data.`,
  };
}
