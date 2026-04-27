import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface QuestionInput {
  question: string;
  question_type: "literal" | "inferential";
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const passageId = searchParams.get("passage_id");

  if (!passageId) {
    return NextResponse.json(
      { error: "Missing passage_id" },
      { status: 400 }
    );
  }

  const { data: questions, error } = await supabase
    .from("passage_questions")
    .select("id, question, question_type, display_order")
    .eq("passage_id", passageId)
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch questions" },
      { status: 500 }
    );
  }

  return NextResponse.json({ questions: questions || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  try {
    const body = await request.json();
    const { passage_id, questions } = body as {
      passage_id: string;
      questions: QuestionInput[];
    };

    if (!passage_id || !questions || !Array.isArray(questions)) {
      return NextResponse.json(
        { error: "Missing passage_id or questions" },
        { status: 400 }
      );
    }

    // Validate questions
    if (questions.length === 0 || questions.length > 5) {
      return NextResponse.json(
        { error: "Must provide 1-5 questions" },
        { status: 400 }
      );
    }

    for (const q of questions) {
      if (!q.question?.trim()) {
        return NextResponse.json(
          { error: "Question text cannot be empty" },
          { status: 400 }
        );
      }
      if (q.question_type !== "literal" && q.question_type !== "inferential") {
        return NextResponse.json(
          { error: "Invalid question_type" },
          { status: 400 }
        );
      }
    }

    // Delete existing questions for this passage
    await supabase
      .from("passage_questions")
      .delete()
      .eq("passage_id", passage_id);

    // Insert new questions
    const questionsToInsert = questions.map((q, index) => ({
      passage_id,
      question: q.question.trim(),
      question_type: q.question_type,
      display_order: index,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("passage_questions")
      .insert(questionsToInsert)
      .select("id, question, question_type, display_order");

    if (insertError) {
      console.error("Error inserting questions:", insertError);
      return NextResponse.json(
        { error: "Failed to save questions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      questions: inserted,
    });
  } catch (error) {
    console.error("Passage questions API error:", error);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
}
