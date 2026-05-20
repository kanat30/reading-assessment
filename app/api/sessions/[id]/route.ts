import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/sessions/[id]
 * Permanently deletes a session and its associated data.
 * Requires teacher to be authenticated and own the session's school.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id: sessionId } = await params;
  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get teacher's school
  const { data: teacher } = await supabase
    .from("teachers")
    .select("school_id")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    return NextResponse.json({ error: "Teacher not found" }, { status: 404 });
  }

  // Verify session belongs to teacher's school
  const { data: session } = await supabase
    .from("sessions")
    .select("id, audio_url, assessments!inner(school_id)")
    .eq("id", sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionAssessment = session.assessments as any;
  if (sessionAssessment.school_id !== teacher.school_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Delete audio file from storage (if exists)
    if (session.audio_url) {
      await adminClient.storage
        .from("recordings")
        .remove([session.audio_url]);
    }

    // Delete session events
    await adminClient
      .from("session_events")
      .delete()
      .eq("session_id", sessionId);

    // Delete comprehension answers
    await adminClient
      .from("comprehension_answers")
      .delete()
      .eq("session_id", sessionId);

    // Delete session overrides
    await adminClient
      .from("session_overrides")
      .delete()
      .eq("session_id", sessionId);

    // Delete teacher notes (cascade will also handle this, but explicit for clarity)
    await adminClient
      .from("session_teacher_notes")
      .delete()
      .eq("session_id", sessionId);

    // Delete the session itself
    const { error: deleteError } = await adminClient
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (deleteError) {
      console.error("Error deleting session:", deleteError);
      return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete session error:", error);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
}
