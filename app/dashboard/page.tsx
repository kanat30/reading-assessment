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

  // Get completed sessions for this teacher's school (sorted by scored_at DESC)
  const { data: sessions } = await supabase
    .from("sessions")
    .select(`
      id,
      status,
      scored_at,
      created_at,
      duration_seconds,
      scores_json,
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
    .order("scored_at", { ascending: false, nullsFirst: false });

  // Get distinct class labels from assessments
  const { data: assessments } = await supabase
    .from("assessments")
    .select("class_label")
    .eq("school_id", teacher.school_id)
    .not("class_label", "is", null);

  const classLabels = [...new Set((assessments || []).map((a) => a.class_label).filter(Boolean))];

  // Get all passages for the creation flow
  const { data: passages } = await supabase
    .from("passages")
    .select("*")
    .order("word_count", { ascending: true });

  // Transform sessions to match expected types (Supabase returns nested objects)
  const transformedSessions = (sessions || []).map((s) => ({
    ...s,
    students: s.students as unknown as { id: string; first_name: string; last_name: string },
    assessments: s.assessments as unknown as {
      id: string;
      class_label: string;
      school_id: string;
      passages: { id: string; title: string; grade_band: string };
    },
  }));

  return (
    <DashboardClient
      teacher={teacher}
      school={teacher.schools}
      sessions={transformedSessions}
      classLabels={classLabels as string[]}
      passages={passages || []}
    />
  );
}
