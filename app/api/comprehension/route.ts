import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeComprehension } from "@/lib/scoring/comprehension";
import { ComprehensionQuestion } from "@/lib/scoring/types";

interface PassageData {
  id: string;
  text: string;
  title: string;
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { session_id, answers } = body as {
      session_id: string;
      answers: Record<string, string>; // question_id -> student_answer
    };

    if (!session_id || !answers) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get session with passage info
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(`
        id,
        assessment_id,
        assessments(
          passage_id,
          passages(
            id,
            text,
            title
          )
        )
      `)
      .eq("id", session_id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Extract passage from nested relations (Supabase returns single objects for FK relations
    // but TypeScript infers arrays - cast through unknown to handle this)
    const assessments = session.assessments as unknown as { passage_id: string; passages: PassageData } | null;
    const passage = assessments?.passages;
    if (!passage) {
      return NextResponse.json(
        { error: "Passage not found" },
        { status: 404 }
      );
    }

    // Get questions for this passage
    const { data: questionRows, error: questionsError } = await supabase
      .from("passage_questions")
      .select("id, question, question_type, display_order")
      .eq("passage_id", passage.id)
      .order("display_order", { ascending: true });

    if (questionsError || !questionRows || questionRows.length === 0) {
      return NextResponse.json(
        { error: "No questions found for this passage" },
        { status: 404 }
      );
    }

    // Convert to ComprehensionQuestion format for grading
    const questions: ComprehensionQuestion[] = questionRows.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.question_type as "literal" | "inferential",
    }));

    // Grade comprehension using Claude (with fallback)
    const result = await gradeComprehension(
      passage.text,
      questions,
      answers
    );

    // Store answers in database
    for (const answer of result.answers) {
      const { error: insertError } = await supabase
        .from("comprehension_answers")
        .upsert({
          session_id: session_id,
          question_id: answer.question_id,
          student_answer: answer.student_answer,
          is_correct: answer.is_correct,
          feedback: answer.feedback,
        }, {
          onConflict: "session_id,question_id"
        });

      if (insertError) {
        console.error("Error storing answer:", insertError);
      }
    }

    // Update session's scores_json to include comprehension
    const { data: currentSession } = await supabase
      .from("sessions")
      .select("scores_json")
      .eq("id", session_id)
      .single();

    const updatedScores = {
      ...(currentSession?.scores_json as Record<string, unknown> || {}),
      comprehension: {
        score: result.score,
        total: result.total,
      },
    };

    await supabase
      .from("sessions")
      .update({ scores_json: updatedScores })
      .eq("id", session_id);

    return NextResponse.json({
      score: result.score,
      total: result.total,
      answers: result.answers,
    });
  } catch (error) {
    console.error("Comprehension API error:", error);
    return NextResponse.json(
      { error: "Failed to process comprehension" },
      { status: 500 }
    );
  }
}
