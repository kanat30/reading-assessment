import Anthropic from "@anthropic-ai/sdk";
import { ComprehensionQuestion, ComprehensionAnswer, ComprehensionResult, ComprehensionStatus } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function gradeQuestion(
  passageText: string,
  question: ComprehensionQuestion,
  studentAnswer: string
): Promise<ComprehensionAnswer> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are grading a student's reading comprehension answer.

Passage:
"${passageText}"

Question (${question.type}): ${question.question}

Student's Answer: "${studentAnswer || "(no answer provided)"}"

Grade this answer using THREE levels:
- "correct": Answer demonstrates clear understanding and is accurate
- "partial": Answer shows some understanding but is incomplete, uncertain, or only partly accurate (e.g., student says "maybe" or "I think", or names 2 of 3 things asked)
- "incorrect": Answer is wrong, irrelevant, or shows no understanding

IMPORTANT grading guidelines:
- Accept equivalent representations: "4" = "four", "2nd" = "second", "NYC" = "New York City", etc.
- Accept reasonable paraphrasing - students don't need to quote the text exactly
- For literal questions, check if the key information is present (even if phrased differently)
- For inferential questions, accept any reasonable interpretation supported by the text
- Focus on whether the student understood the content, not on exact wording

Respond in this exact JSON format:
{
  "status": "correct" or "partial" or "incorrect",
  "feedback": "brief encouraging feedback",
  "expected_answer": "the correct answer based on the passage (brief, 1-2 sentences max)"
}

JSON only, no other text.`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("No text response");
  }

  // Try to parse JSON, handling potential markdown code blocks
  let jsonText = textBlock.text.trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
  }
  const parsed = JSON.parse(jsonText);

  const status: ComprehensionStatus = parsed.status === "correct" ? "correct"
    : parsed.status === "partial" ? "partial"
    : "incorrect";

  return {
    question_id: question.id,
    student_answer: studentAnswer,
    is_correct: status === "correct",
    status,
    feedback: parsed.feedback || "Graded.",
    expected_answer: parsed.expected_answer || undefined,
  };
}

export async function gradeComprehension(
  passageText: string,
  questions: ComprehensionQuestion[],
  studentAnswers: Record<string, string>
): Promise<ComprehensionResult> {
  // Grade all questions in parallel for faster response
  const answerPromises = questions.map((question) =>
    gradeQuestion(passageText, question, studentAnswers[question.id] || "").catch((error) => {
      console.error("Comprehension grading error for question:", question.id, error);
      throw new Error(`Failed to grade comprehension: ${error instanceof Error ? error.message : 'Unknown error'}`);
    })
  );

  const answers = await Promise.all(answerPromises);

  // Score: correct = 1, partial = 0.5, incorrect = 0
  const score = answers.reduce((sum, a) => {
    if (a.status === "correct") return sum + 1;
    if (a.status === "partial") return sum + 0.5;
    return sum;
  }, 0);

  return {
    questions,
    answers,
    score,
    total: questions.length,
  };
}
