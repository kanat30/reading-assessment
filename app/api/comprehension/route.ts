import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeComprehension } from "@/lib/scoring/comprehension";
import { ComprehensionQuestion } from "@/lib/scoring/types";
import { getPassageById } from "@/lib/passages/library";

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

    // Get session with passage info - both library and legacy fields
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select(`
        id,
        assessment_id,
        passage_id,
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

    let passageText: string;
    let questions: ComprehensionQuestion[] = [];
    let isLibraryPassage = false;

    // Check for library passage first (session.passage_id is the library passage ID)
    if (session.passage_id) {
      const libraryPassage = getPassageById(session.passage_id);
      if (!libraryPassage) {
        return NextResponse.json(
          { error: "Library passage not found" },
          { status: 404 }
        );
      }
      passageText = libraryPassage.text;
      isLibraryPassage = true;

      // Get questions from library passage
      if (libraryPassage.questions && libraryPassage.questions.length > 0) {
        questions = libraryPassage.questions.map((q, idx) => ({
          id: `lib-${session.passage_id}-${idx}`,
          question: q.question,
          type: q.type,
        }));
      } else {
        return NextResponse.json(
          { error: "No questions found for this library passage" },
          { status: 404 }
        );
      }
    } else {
      // Legacy database passage flow
      const assessments = session.assessments as unknown as { passage_id: string; passages: PassageData } | null;
      const passage = assessments?.passages;
      if (!passage) {
        return NextResponse.json(
          { error: "Passage not found" },
          { status: 404 }
        );
      }
      passageText = passage.text;

      // Get questions from database
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

      questions = questionRows.map((q) => ({
        id: q.id,
        question: q.question,
        type: q.question_type as "literal" | "inferential",
      }));
    }

    // Grade comprehension using Claude (with fallback)
    const result = await gradeComprehension(
      passageText,
      questions,
      answers
    );

    // Store answers in database (legacy passages only)
    // Library passages use synthetic question IDs (like "lib-L4-A-mars-0") which
    // aren't compatible with the comprehension_answers FK constraint.
    // For library passages, answers are stored in scores_json instead.
    if (!isLibraryPassage) {
      for (const answer of result.answers) {
        const { error: insertError } = await supabase
          .from("comprehension_answers")
          .upsert({
            session_id: session_id,
            question_id: answer.question_id,
            student_answer: answer.student_answer,
            is_correct: answer.is_correct,
            status: answer.status,
            feedback: answer.feedback,
            expected_answer: answer.expected_answer,
          }, {
            onConflict: "session_id,question_id"
          });

        if (insertError) {
          console.error("Error storing answer:", insertError);
        }
      }
    }

    // Update session's scores_json to include comprehension
    const { data: currentSession } = await supabase
      .from("sessions")
      .select("scores_json")
      .eq("id", session_id)
      .single();

    const comprehensionData: Record<string, unknown> = {
      score: result.score,
      total: result.total,
    };

    // For library passages, store detailed answers in scores_json
    // since they can't be stored in comprehension_answers table
    if (isLibraryPassage) {
      comprehensionData.answers = result.answers;
    }

    const updatedScores = {
      ...(currentSession?.scores_json as Record<string, unknown> || {}),
      comprehension: comprehensionData,
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Comprehension API error:", errorMessage, error);
    return NextResponse.json(
      { error: `Failed to grade comprehension: ${errorMessage}` },
      { status: 500 }
    );
  }
}
