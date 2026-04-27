import Anthropic from "@anthropic-ai/sdk";
import { ComprehensionQuestion, ComprehensionAnswer, ComprehensionResult } from "./types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Simple keyword-based fallback grader when Claude API fails.
 * Checks if the student's answer contains key terms from the passage
 * that are relevant to the question.
 */
function fallbackGrade(
  passageText: string,
  question: string,
  studentAnswer: string
): { is_correct: boolean; feedback: string } {
  const answerLower = studentAnswer.toLowerCase().trim();
  const passageLower = passageText.toLowerCase();
  const questionLower = question.toLowerCase();

  // If answer is empty or too short, mark incorrect
  if (answerLower.length < 2) {
    return { is_correct: false, feedback: "Answer is too brief." };
  }

  // Extract key terms from the answer (words 3+ chars)
  const answerWords = answerLower.split(/\s+/).filter(w => w.length >= 3);

  // Check if answer words appear in the passage
  let matchCount = 0;
  for (const word of answerWords) {
    if (passageLower.includes(word)) {
      matchCount++;
    }
  }

  // Special handling for numeric answers
  const numericMatch = answerLower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/);
  if (numericMatch) {
    const numWord = numericMatch[1];
    // Check if this number appears in the passage
    if (passageLower.includes(numWord)) {
      return {
        is_correct: true,
        feedback: "Answer matches information from the passage."
      };
    }
    // Also check digit equivalents
    const numMap: Record<string, string> = {
      'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5',
      'six': '6', 'seven': '7', 'eight': '8', 'nine': '9', 'ten': '10'
    };
    const digit = numMap[numWord] || numWord;
    const word = Object.entries(numMap).find(([k, v]) => v === numWord)?.[0];
    if ((digit && passageLower.includes(digit)) || (word && passageLower.includes(word))) {
      return {
        is_correct: true,
        feedback: "Answer matches information from the passage."
      };
    }
  }

  // If most answer words are in the passage, likely correct
  if (answerWords.length > 0 && matchCount >= answerWords.length * 0.5) {
    return {
      is_correct: true,
      feedback: "Answer contains relevant information from the passage."
    };
  }

  // For very short answers that don't match well, be generous and mark as needing review
  if (answerLower.length <= 20) {
    return {
      is_correct: true,
      feedback: "Answer recorded - manual review recommended."
    };
  }

  return {
    is_correct: matchCount > 0,
    feedback: matchCount > 0 ? "Partial match found." : "Could not verify answer."
  };
}

export async function gradeComprehension(
  passageText: string,
  questions: ComprehensionQuestion[],
  studentAnswers: Record<string, string>
): Promise<ComprehensionResult> {
  const answers: ComprehensionAnswer[] = [];

  for (const question of questions) {
    const studentAnswer = studentAnswers[question.id] || "";

    if (!studentAnswer.trim()) {
      answers.push({
        question_id: question.id,
        student_answer: studentAnswer,
        is_correct: false,
        feedback: "No answer provided.",
      });
      continue;
    }

    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5-20250514",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `You are grading a student's reading comprehension answer. Be VERY generous - if the answer shows ANY understanding of the concept or contains relevant information, mark it correct.

Passage:
"${passageText}"

Question (${question.type}): ${question.question}

Student's Answer: "${studentAnswer}"

Grade this answer. For literal questions, the answer just needs to contain the correct information (even if brief like "four" or "six months"). For inferential questions, accept reasonable interpretations.

Respond in this exact JSON format:
{
  "is_correct": true or false,
  "feedback": "brief encouraging feedback"
}

JSON only, no other text.`,
          },
        ],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      if (textBlock) {
        // Try to parse JSON, handling potential markdown code blocks
        let jsonText = textBlock.text.trim();
        if (jsonText.startsWith("```")) {
          jsonText = jsonText.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
        }
        const parsed = JSON.parse(jsonText);
        answers.push({
          question_id: question.id,
          student_answer: studentAnswer,
          is_correct: parsed.is_correct === true,
          feedback: parsed.feedback || "Graded.",
        });
      } else {
        throw new Error("No text response");
      }
    } catch (error) {
      console.error("Comprehension grading error:", error);
      // Use smart fallback grader
      const fallbackResult = fallbackGrade(passageText, question.question, studentAnswer);
      answers.push({
        question_id: question.id,
        student_answer: studentAnswer,
        is_correct: fallbackResult.is_correct,
        feedback: fallbackResult.feedback,
      });
    }
  }

  const score = answers.filter((a) => a.is_correct).length;

  return {
    questions,
    answers,
    score,
    total: questions.length,
  };
}
