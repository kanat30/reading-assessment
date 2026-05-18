import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ReviewStatus = "new" | "reviewed" | "approved" | "flagged" | "edited";

interface UpdateStatusRequest {
  session_id: string;
  status: ReviewStatus;
}

const VALID_STATUSES: ReviewStatus[] = ["new", "reviewed", "approved", "flagged", "edited"];

/**
 * PATCH /api/session-status
 * Update the review status of a session.
 */
export async function PATCH(request: NextRequest) {
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
    const body: UpdateStatusRequest = await request.json();
    const { session_id, status } = body;

    // Validate required fields
    if (!session_id || !status) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate status value
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
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

    // Update the status
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ teacher_review_status: status })
      .eq("id", session_id);

    if (updateError) {
      console.error("Update status error:", updateError);
      return NextResponse.json(
        { error: "Failed to update status" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error("Session status API error:", error);
    return NextResponse.json(
      { error: "Failed to update session status" },
      { status: 500 }
    );
  }
}
