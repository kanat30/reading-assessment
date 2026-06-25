import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "./client";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Get teacher info
  const { data: teacher } = await supabase
    .from("teachers")
    .select("*, schools(*)")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher) {
    redirect("/auth/login");
  }

  // Run all independent queries in parallel for faster initial load
  const [
    { data: sessions },
    { data: teacherNotes },
    { data: assessments },
    { data: passages },
    { data: templates },
    { data: activeAssessments },
  ] = await Promise.all([
    // Get completed sessions for this teacher's school (sorted by scored_at DESC)
    supabase
      .from("sessions")
      .select(`
        id,
        status,
        scored_at,
        created_at,
        duration_seconds,
        scores_json,
        teacher_review_status,
        students(id, first_name, last_name),
        assessments!inner(
          id,
          class_label,
          school_id,
          passages(id, title, grade_band)
        )
      `)
      .eq("assessments.school_id", teacher.school_id)
      .in("status", ["complete", "processing"])
      .order("scored_at", { ascending: false, nullsFirst: false }),

    // Get session IDs that have notes from the current teacher
    supabase
      .from("session_teacher_notes")
      .select("session_id")
      .eq("teacher_id", teacher.id),

    // Get distinct class labels from assessments
    supabase
      .from("assessments")
      .select("class_label")
      .eq("school_id", teacher.school_id)
      .not("class_label", "is", null),

    // Get all passages for the creation flow
    supabase
      .from("passages")
      .select("*")
      .order("word_count", { ascending: true }),

    // Get assessment templates for the teacher's school
    supabase
      .from("assessment_templates")
      .select(`
        id,
        name,
        passage_id,
        questions,
        created_at,
        passages(id, title, grade_band, word_count)
      `)
      .eq("school_id", teacher.school_id)
      .order("created_at", { ascending: false }),

    // Get active assessments with share tokens for this teacher's school
    supabase
      .from("assessments")
      .select(`
        id,
        share_token,
        class_label,
        created_at,
        expires_at,
        use_numbered_students,
        expected_student_count,
        passages(id, title, grade_band)
      `)
      .eq("school_id", teacher.school_id)
      .order("created_at", { ascending: false }),
  ]);

  const sessionIdsWithNotes = new Set((teacherNotes || []).map(n => n.session_id));
  const classLabels = [...new Set((assessments || []).map((a) => a.class_label).filter(Boolean))];

  // Transform sessions to match expected types (Supabase returns nested objects)
  // Map 'unreviewed' to 'new' for backwards compatibility before migration runs
  const mapReviewStatus = (status: string | null): "new" | "reviewed" | "approved" | "flagged" | "edited" => {
    if (!status || status === "unreviewed") return "new";
    return status as "new" | "reviewed" | "approved" | "flagged" | "edited";
  };

  const transformedSessions = (sessions || []).map((s) => ({
    ...s,
    teacher_review_status: mapReviewStatus(s.teacher_review_status),
    has_note: sessionIdsWithNotes.has(s.id),
    students: s.students as unknown as { id: string; first_name: string; last_name: string },
    assessments: s.assessments as unknown as {
      id: string;
      class_label: string;
      school_id: string;
      passages: { id: string; title: string; grade_band: string };
    },
  }));

  // Transform templates to match expected types
  const transformedTemplates = (templates || []).map((t) => ({
    ...t,
    passages: t.passages as unknown as { id: string; title: string; grade_band: string; word_count: number },
  }));

  // Transform active assessments to match expected types
  const transformedActiveAssessments = (activeAssessments || []).map((a) => ({
    ...a,
    passages: a.passages as unknown as { id: string; title: string; grade_band: string },
  }));

  return (
    <DashboardClient
      teacher={teacher}
      school={teacher.schools}
      sessions={transformedSessions}
      classLabels={classLabels as string[]}
      passages={passages || []}
      templates={transformedTemplates}
      activeAssessments={transformedActiveAssessments}
    />
  );
}
