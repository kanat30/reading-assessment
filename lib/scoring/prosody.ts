import { SessionEvent, ProsodyScore } from "./types";
import { anthropic, CLAUDE_MODEL, logAiFallback } from "./ai";

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
