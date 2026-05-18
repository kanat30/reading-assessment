import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface NoteRequest {
  session_id: string;
  note_text: string;
}

const MAX_NOTE_LENGTH = 2000;

/**
 * GET /api/session-notes?session_id=xxx
 * Fetch the current teacher's note for a session.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id parameter" },
      { status: 400 }
    );
  }

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get teacher info
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  // Fetch the note
  const { data: note, error } = await supabase
    .from("session_teacher_notes")
    .select("id, note_text, created_at, updated_at")
    .eq("session_id", sessionId)
    .eq("teacher_id", teacher.id)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = no rows returned (not an error, just no note exists)
    console.error("Get note error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ note: note || null });
}

/**
 * POST /api/session-notes
 * Create or update (upsert) a note for a session.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get teacher info
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id, school_id")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  try {
    const body: NoteRequest = await request.json();
    const { session_id, note_text } = body;

    // Validate required fields
    if (!session_id || !note_text) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate note length
    if (note_text.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        { error: `Note exceeds maximum length of ${MAX_NOTE_LENGTH} characters` },
        { status: 400 }
      );
    }

    // Verify session belongs to teacher's school
    const { data: session } = await supabase
      .from("sessions")
      .select("id, assessments!inner(school_id)")
      .eq("id", session_id)
      .single();

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionAssessment = session.assessments as any;
    if (sessionAssessment.school_id !== teacher.school_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Upsert the note
    const { data: note, error: upsertError } = await supabase
      .from("session_teacher_notes")
      .upsert(
        {
          session_id,
          teacher_id: teacher.id,
          note_text: note_text.trim(),
        },
        {
          onConflict: "session_id,teacher_id",
        }
      )
      .select("id, note_text, created_at, updated_at")
      .single();

    if (upsertError) {
      console.error("Upsert note error:", upsertError);
      return NextResponse.json(
        { error: "Failed to save note" },
        { status: 500 }
      );
    }

    return NextResponse.json({ note });
  } catch (error) {
    console.error("Session notes API error:", error);
    return NextResponse.json(
      { error: "Failed to save note" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/session-notes?session_id=xxx
 * Remove the current teacher's note for a session.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing session_id parameter" },
      { status: 400 }
    );
  }

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get teacher info
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  // Delete the note (RLS ensures teacher can only delete own notes)
  const { error: deleteError } = await supabase
    .from("session_teacher_notes")
    .delete()
    .eq("session_id", sessionId)
    .eq("teacher_id", teacher.id);

  if (deleteError) {
    console.error("Delete note error:", deleteError);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
