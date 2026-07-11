import { ComprehensionQuestion, ComprehensionAnswer, ComprehensionResult, ComprehensionStatus } from "./types";
import { anthropic, CLAUDE_MODEL, logAiFallback } from "./ai";

/**
 * Grade all comprehension questions in a single API call for speed.
 * Previously we made N parallel calls (one per question), but network latency
 * made that slow (~5s for 3 questions). Batching reduces to ~1-2s.
 */
export async function gradeComprehension(
  passageText: string,
  questions: ComprehensionQuestion[],
  studentAnswers: Record<string, string>
): Promise<ComprehensionResult> {
  // Build the questions block for the prompt
  const questionsBlock = questions.map((q, i) => {
    const answer = studentAnswers[q.id] || "(no answer provided)";
    return `Q${i + 1} (${q.type}): ${q.question}\nStudent's Answer: "${answer}"`;
  }).join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: `You are grading a student's reading comprehension answers. Grade ALL questions in one response.

Passage:
"${passageText}"

Questions and Answers:
${questionsBlock}

Grade each answer using THREE levels:
- "correct": Answer demonstrates clear understanding and is accurate
- "partial": Answer shows some understanding but is incomplete, uncertain, or only partly accurate
- "incorrect": Answer is wrong, irrelevant, or shows no understanding

Grading guidelines:
- Accept equivalent representations: "4" = "four", "2nd" = "second", "NYC" = "New York City"
- Accept reasonable paraphrasing - students don't need to quote exactly
- For literal questions, check if the key information is present
- For inferential questions, accept any reasonable interpretation supported by the text

Respond with a JSON array, one object per question in order:
[
  {"status": "correct|partial|incorrect", "feedback": "brief feedback", "expected_answer": "exact quote from passage"},
  ...
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
    const parsed = JSON.parse(jsonText) as Array<{
      status: string;
      feedback?: string;
      expected_answer?: string;
    }>;

    // Map parsed results to answers
    const answers: ComprehensionAnswer[] = questions.map((question, i) => {
      const result = parsed[i] || { status: "incorrect", feedback: "Could not grade." };
      const status: ComprehensionStatus =
        result.status === "correct" ? "correct"
        : result.status === "partial" ? "partial"
        : "incorrect";

      return {
        question_id: question.id,
        student_answer: studentAnswers[question.id] || "",
        is_correct: status === "correct",
        status,
        feedback: result.feedback || "Graded.",
        expected_answer: result.expected_answer || undefined,
      };
    });

    // Score: correct = 1, partial = 0.5, incorrect = 0
    const score = answers.reduce((sum, a) => {
      if (a.status === "correct") return sum + 1;
      if (a.status === "partial") return sum + 0.5;
      return sum;
    }, 0);

    return { questions, answers, score, total: questions.length };
  } catch (error) {
    // Fallback: mark all as needing review (don't fail the submission)
    logAiFallback("comprehension-grading", error);

    const answers: ComprehensionAnswer[] = questions.map((question) => ({
      question_id: question.id,
      student_answer: studentAnswers[question.id] || "",
      is_correct: false,
      status: "incorrect" as ComprehensionStatus,
      feedback: "Grading unavailable - please review manually.",
      expected_answer: undefined,
    }));

    return { questions, answers, score: 0, total: questions.length };
  }
}
