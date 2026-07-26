import { EnhancedErrorPattern } from "./types";
import { anthropic, CLAUDE_MODEL, logAiFallback } from "./ai";
import { ResolvedNorms, getBand, getBandLabel, describePercentile, describeNormsBasis } from "./norms";

/**
 * Teacher-facing summary. The norm set is the SAME resolved object stored in
 * scores_json.norms and rendered in the report header — passed in here so the
 * summary text can never cite a different grade/period/benchmark than the
 * surfaces around it (the pre-2026-07-26 version hardcoded "grade-6 spring").
 */
export async function generateSummary(
  wcpm: number,
  accuracy: number,
  norms: ResolvedNorms,
  errorPatterns: EnhancedErrorPattern[],
  passageTitle: string
): Promise<string> {
  const benchmark = norms.cuts.p50;
  const band = getBand(wcpm, norms.cuts);
  const bandLabel = getBandLabel(band);
  const percentileText = describePercentile(wcpm, norms.cuts);
  const { caption } = describeNormsBasis(norms);
  const periodPhrase =
    norms.period === "BOY" ? "beginning-of-year" : norms.period === "MOY" ? "middle-of-year" : "end-of-year";

  try {
    const patternsDescription = errorPatterns.length > 0
      ? errorPatterns.map(p => `${p.label} (${p.event_count} errors: ${p.matched_words.slice(0, 3).join(", ")}${p.matched_words.length > 3 ? "..." : ""})`).join("; ")
      : "No significant patterns";

    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are writing a brief teacher-facing summary of a middle-school student's oral reading fluency assessment. Write exactly 2-3 sentences, in the tone of a doctor's note: clinical, specific, useful. No preamble, no greetings. Mention the WCPM relative to the grade-${norms.grade} ${periodPhrase} benchmark of ${benchmark} WCPM, the accuracy, and one specific pattern in the errors if any stands out. Do not mention the student by name. Use ONLY the benchmark, band, and percentile provided below — do not cite any other grade level, season, or benchmark number.

Data:
- WCPM: ${wcpm} (grade-${norms.grade} ${periodPhrase} benchmark: ${benchmark}; norm set: ${caption})
- Benchmark band: ${bandLabel}
- Percentile position: ${percentileText}
- Accuracy: ${accuracy}%
- Top error patterns: ${patternsDescription}
- Passage: "${passageTitle}"

Write the summary now.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock ? textBlock.text : "Summary unavailable.";
  } catch (error) {
    logAiFallback("summary", error);
    // Graceful fallback - generate a basic summary without Claude
    const performance = wcpm >= benchmark ? "at or above" : "below";
    return `Reading rate of ${wcpm} WCPM is ${performance} the grade-${norms.grade} ${periodPhrase} benchmark of ${benchmark} (${percentileText}). Accuracy was ${accuracy}%.`;
  }
}
