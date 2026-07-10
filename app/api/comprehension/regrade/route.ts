import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { gradeComprehension } from "@/lib/scoring/comprehension";
import { ComprehensionQuestion } from "@/lib/scoring/types";

interface PassageData {
  id: string;
  text: string;
  title: string;
}

export async function POST(request: NextRequest) {
  // Regrade is a teacher action (report UI button) — require an
  // authenticated teacher of the session's school.
  const authClient = await createClient();
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: teacher } = await authClient
    .from("teachers")
    .select("school_id")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    const body = await request.json();
    const { session_id } = body as { session_id: string };

    if (!session_id) {
      return NextResponse.json(
        { error: "Missing session_id" },
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
          school_id,
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

    const sessionSchoolId = (session.assessments as unknown as { school_id: string } | null)?.school_id;
    if (sessionSchoolId !== teacher.school_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const assessments = session.assessments as unknown as { passage_id: string; passages: PassageData } | null;
    const passage = assessments?.passages;
    if (!passage) {
      return NextResponse.json(
        { error: "Passage not found" },
        { status: 404 }
      );
    }

    // Get existing comprehension answers for this session
    const { data: existingAnswers, error: answersError } = await supabase
      .from("comprehension_answers")
      .select("question_id, student_answer")
      .eq("session_id", session_id);

    if (answersError || !existingAnswers || existingAnswers.length === 0) {
      return NextResponse.json(
        { error: "No comprehension answers found for this session" },
        { status: 404 }
      );
    }

    // Convert to answers record
    const answers: Record<string, string> = {};
    for (const a of existingAnswers) {
      answers[a.question_id] = a.student_answer;
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

    const questions: ComprehensionQuestion[] = questionRows.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.question_type as "literal" | "inferential",
    }));

    // Re-grade comprehension using Claude with updated prompt
    const result = await gradeComprehension(
      passage.text,
      questions,
      answers
    );

    // Update answers in database with new grades
    for (const answer of result.answers) {
      const { error: updateError } = await supabase
        .from("comprehension_answers")
        .update({
          is_correct: answer.is_correct,
          status: answer.status,
          feedback: answer.feedback,
          expected_answer: answer.expected_answer,
        })
        .eq("session_id", session_id)
        .eq("question_id", answer.question_id);

      if (updateError) {
        console.error("Error updating answer:", updateError);
      }
    }

    // Update session's scores_json with new comprehension score
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
      success: true,
      session_id,
      score: result.score,
      total: result.total,
      answers: result.answers,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Comprehension regrade error:", errorMessage, error);
    return NextResponse.json(
      { error: `Failed to regrade comprehension: ${errorMessage}` },
      { status: 500 }
    );
  }
}
