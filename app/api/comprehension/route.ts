import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/admin";
import { gradeComprehension } from "@/lib/scoring/comprehension";
import { ComprehensionQuestion } from "@/lib/scoring/types";
import { getPassageById } from "@/lib/passages/library";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * Grade the student's answers with Claude and persist the result. This runs in
 * the background (via `waitUntil`) AFTER the student's submit has already
 * returned — the AI grade is teacher-only (the student never sees it and the
 * done page shows nothing about it), so making the student wait ~10-30s for the
 * model call was pure dead time. The raw answers are persisted synchronously
 * before this runs, so nothing is lost if grading lags or fails; a teacher can
 * always re-grade from the report.
 */
async function gradeAndPersist(
  supabase: AdminClient,
  sessionId: string,
  passageText: string,
  questions: ComprehensionQuestion[],
  answers: Record<string, string>,
  isLibraryPassage: boolean
): Promise<void> {
  try {
    const result = await gradeComprehension(passageText, questions, answers);

    // Legacy passages store per-answer grades in the comprehension_answers table
    // (library passages keep them in scores_json — synthetic ids aren't FK-safe).
    if (!isLibraryPassage) {
      for (const answer of result.answers) {
        const { error: upsertError } = await supabase
          .from("comprehension_answers")
          .upsert({
            session_id: sessionId,
            question_id: answer.question_id,
            student_answer: answer.student_answer,
            is_correct: answer.is_correct,
            status: answer.status,
            feedback: answer.feedback,
            expected_answer: answer.expected_answer,
          }, { onConflict: "session_id,question_id" });
        if (upsertError) console.error("Error storing graded answer:", upsertError);
      }
    }

    // Re-read scores_json immediately before writing so we merge onto the latest
    // (rather than clobbering the metrics/summary written by the scoring pipeline).
    const { data: currentSession } = await supabase
      .from("sessions")
      .select("scores_json")
      .eq("id", sessionId)
      .single();

    const comprehensionData: Record<string, unknown> = {
      score: result.score,
      total: result.total,
    };
    if (isLibraryPassage) comprehensionData.answers = result.answers;

    await supabase
      .from("sessions")
      .update({
        scores_json: {
          ...((currentSession?.scores_json as Record<string, unknown>) || {}),
          comprehension: comprehensionData,
        },
      })
      .eq("id", sessionId);
  } catch (error) {
    // gradeComprehension has its own fallback and shouldn't throw; this guards
    // the DB writes. Leave the pending marker + raw answers for teacher re-grade.
    console.error("Background comprehension grading failed:", error);
  }
}

interface PassageData {
  id: string;
  text: string;
  title: string;
}

// The unguessable session id is the capability; comprehension actions are only
// valid shortly after the reading (mirrors the submission window).
const SUBMISSION_WINDOW_MS = 2 * 60 * 60 * 1000;

// Load the passage + comprehension questions for the student's session. This
// runs server-side with the admin client so the student flow never needs
// anonymous RLS read access to `sessions` — the report stays teacher-only.
// Bound by the assessment share_token and the same short post-reading window.
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");
  const token = searchParams.get("token");

  if (!sessionId || !token) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select(`
      id,
      created_at,
      passage_id,
      assessments(
        share_token,
        passage_id,
        passages(id, title, text)
      )
    `)
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const assessment = session.assessments as unknown as {
    share_token: string | null;
    passage_id: string | null;
    passages: PassageData | null;
  } | null;

  // Bind the session capability to its assessment token.
  if (!assessment || assessment.share_token !== token) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const sessionAge = Date.now() - new Date(session.created_at).getTime();
  if (sessionAge > SUBMISSION_WINDOW_MS) {
    return NextResponse.json({ error: "This assessment is no longer available." }, { status: 403 });
  }

  // Library passage first (session.passage_id is the library ID), then legacy DB.
  if (session.passage_id) {
    const libraryPassage = getPassageById(session.passage_id);
    if (!libraryPassage || !libraryPassage.questions?.length) {
      return NextResponse.json({ passage: null, questions: [] });
    }
    return NextResponse.json({
      passage: {
        id: libraryPassage.id,
        title: libraryPassage.title,
        text: libraryPassage.text,
      },
      // IDs must match those the POST handler grades against.
      questions: libraryPassage.questions.map((q, idx) => ({
        id: `lib-${session.passage_id}-${idx}`,
        question: q.question,
        question_type: q.type,
        display_order: idx,
      })),
    });
  }

  const legacyPassage = assessment.passages;
  if (!legacyPassage) {
    return NextResponse.json({ passage: null, questions: [] });
  }

  const { data: questionRows } = await supabase
    .from("passage_questions")
    .select("id, question, question_type, display_order")
    .eq("passage_id", legacyPassage.id)
    .order("display_order", { ascending: true });

  return NextResponse.json({
    passage: {
      id: legacyPassage.id,
      title: legacyPassage.title,
      text: legacyPassage.text,
    },
    questions: questionRows ?? [],
  });
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
        created_at,
        scores_json,
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

    // This endpoint is anonymous (student flow) — the unguessable session id
    // is the capability. Limit what that capability allows: answers may only
    // be submitted shortly after the reading, and only once.
    const sessionAge = Date.now() - new Date(session.created_at).getTime();
    if (sessionAge > SUBMISSION_WINDOW_MS) {
      return NextResponse.json(
        { error: "Submission window has closed" },
        { status: 403 }
      );
    }

    const existingScores = session.scores_json as Record<string, unknown> | null;
    if (existingScores?.comprehension) {
      return NextResponse.json(
        { error: "Comprehension answers were already submitted for this session" },
        { status: 409 }
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

    // Persist the RAW answers synchronously, then grade with Claude in the
    // background. The student's submit no longer blocks on the ~10-30s model
    // call — the grade is teacher-only, so the student just needs their answers
    // saved. The pending marker (a) preserves the answers if grading lags/fails,
    // and (b) blocks a duplicate submit via the `existingScores?.comprehension`
    // check above.
    const rawAnswers = questions.map((q) => ({
      question_id: q.id,
      student_answer: answers[q.id] || "",
      is_correct: false,
      status: null as string | null, // ungraded — filled in by gradeAndPersist
      feedback: null as string | null,
      expected_answer: null as string | null,
    }));

    if (!isLibraryPassage) {
      for (const answer of rawAnswers) {
        const { error: insertError } = await supabase
          .from("comprehension_answers")
          .upsert({
            session_id: session_id,
            question_id: answer.question_id,
            student_answer: answer.student_answer,
            is_correct: false,
            status: null,
            feedback: null,
            expected_answer: null,
          }, { onConflict: "session_id,question_id" });
        if (insertError) console.error("Error storing raw answer:", insertError);
      }
    }

    const pendingComprehension: Record<string, unknown> = {
      status: "grading",
      score: 0,
      total: questions.length,
    };
    if (isLibraryPassage) pendingComprehension.answers = rawAnswers;

    await supabase
      .from("sessions")
      .update({
        scores_json: {
          ...((existingScores as Record<string, unknown>) || {}),
          comprehension: pendingComprehension,
        },
      })
      .eq("id", session_id);

    // Grade after the response is sent (Vercel keeps the function alive for this).
    waitUntil(
      gradeAndPersist(supabase, session_id, passageText, questions, answers, isLibraryPassage)
    );

    // Return immediately — the student proceeds without waiting on the AI call.
    return NextResponse.json({ status: "grading", total: questions.length });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Comprehension API error:", errorMessage, error);
    return NextResponse.json(
      { error: `Failed to grade comprehension: ${errorMessage}` },
      { status: 500 }
    );
  }
}
