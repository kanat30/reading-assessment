import { anthropic, CLAUDE_MODEL, logAiFallback } from "./ai";

export interface GeneratedQuestion {
  question: string;
  question_type: "literal" | "inferential";
}

/**
 * Generate 3 comprehension questions for a passage using Claude.
 * Creates age-appropriate questions for middle school students.
 * Mix of literal (find in text) and inferential (think about it) questions.
 */
export async function generateQuestions(
  passageTitle: string,
  passageText: string,
  gradeBand: string
): Promise<GeneratedQuestion[]> {
  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are creating reading comprehension questions for middle school students (grades ${gradeBand}).

Passage Title: "${passageTitle}"

Passage:
"${passageText}"

Generate exactly 3 comprehension questions for this passage:
- 2 LITERAL questions (answers can be found directly in the text)
- 1 INFERENTIAL question (requires thinking beyond what's stated)

Requirements:
- Use simple, clear language appropriate for middle school
- Questions should be answerable in 1-2 sentences
- Literal questions should ask about specific facts, characters, or events
- The inferential question should ask "why" or "how" or ask students to draw conclusions

Respond with ONLY a JSON array in this exact format:
[
  {"question": "What is...?", "question_type": "literal"},
  {"question": "How many...?", "question_type": "literal"},
  {"question": "Why do you think...?", "question_type": "inferential"}
]

JSON array only, no other text.`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock) {
      throw new Error("No text response from Claude");
    }

    // Parse JSON, handling potential markdown code blocks
    let jsonText = textBlock.text.trim();
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }

    const parsed = JSON.parse(jsonText) as GeneratedQuestion[];

    // Validate the response
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      throw new Error("Invalid response format");
    }

    for (const q of parsed) {
      if (!q.question || !q.question_type) {
        throw new Error("Missing question or question_type");
      }
      if (q.question_type !== "literal" && q.question_type !== "inferential") {
        throw new Error("Invalid question_type");
      }
    }

    return parsed;
  } catch (error) {
    logAiFallback("question-generation", error);
    // Return fallback generic questions if AI fails
    return [
      {
        question: "What is the main idea of this passage?",
        question_type: "literal",
      },
      {
        question: "What important details are mentioned in the text?",
        question_type: "literal",
      },
      {
        question: "Why do you think the author wrote this passage?",
        question_type: "inferential",
      },
    ];
  }
}
