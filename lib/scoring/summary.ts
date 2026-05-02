import Anthropic from "@anthropic-ai/sdk";
import { EnhancedErrorPattern } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateSummary(
  wcpm: number,
  accuracy: number,
  percentile: number,
  errorPatterns: EnhancedErrorPattern[],
  passageTitle: string
): Promise<string> {
  try {
    const patternsDescription = errorPatterns.length > 0
      ? errorPatterns.map(p => `${p.label} (${p.event_count} errors: ${p.matched_words.slice(0, 3).join(", ")}${p.matched_words.length > 3 ? "..." : ""})`).join("; ")
      : "No significant patterns";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `You are writing a brief teacher-facing summary of a 6th grader's oral reading fluency assessment. Write exactly 2-3 sentences, in the tone of a doctor's note: clinical, specific, useful. No preamble, no greetings. Mention the WCPM relative to the grade-6 spring benchmark of 150, the accuracy, and one specific pattern in the errors if any stands out. Do not mention the student by name.

Data:
- WCPM: ${wcpm} (benchmark: 150)
- Accuracy: ${accuracy}%
- Percentile: ${percentile}
- Top error patterns: ${patternsDescription}
- Passage: "${passageTitle}"

Write the summary now.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    return textBlock ? textBlock.text : "Summary unavailable.";
  } catch (error) {
    console.error("Claude summary error:", error);
    // Graceful fallback - generate a basic summary without Claude
    const benchmark = 150;
    const performance = wcpm >= benchmark ? "at or above" : "below";
    return `Reading rate of ${wcpm} WCPM is ${performance} the grade 6 spring benchmark of ${benchmark}. Accuracy was ${accuracy}%.`;
  }
}
