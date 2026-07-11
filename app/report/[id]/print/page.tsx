import { createClient } from "@/lib/supabase/server";
import { getPassageById } from "@/lib/passages/library";
import { PrintReport } from "@/components/PrintReport";

interface PrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintPage({ params }: PrintPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch full session data with related info
  const { data: session, error } = await supabase
    .from("sessions")
    .select(`
      id,
      status,
      created_at,
      duration_seconds,
      scores_json,
      passage_id,
      students(first_name, last_name),
      assessments(
        class_label,
        passages(id, title, text, grade_band),
        teachers(full_name),
        schools(name)
      )
    `)
    .eq("id", id)
    .single();

  if (error || !session || session.status !== "complete") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center print:bg-white">
        <p className="font-serif text-xl text-black italic">Report not available.</p>
      </div>
    );
  }

  // Fetch session events for transcript
  const { data: events } = await supabase
    .from("session_events")
    .select("*")
    .eq("session_id", id)
    .order("word_index", { ascending: true });

  // Transform nested data - Supabase returns single objects for to-one relations
  // but TypeScript may see them as arrays
  const assessments = session.assessments as unknown as {
    class_label: string;
    passages: { title: string; text: string; grade_band: string };
    teachers: { full_name: string };
    schools: { name: string };
  };

  // Resolve the passage actually read this session (library flow stores it on the
  // session; the assessment's passages row is only the legacy fallback).
  const libraryPassage = session.passage_id ? getPassageById(session.passage_id) : undefined;
  if (libraryPassage) {
    assessments.passages = {
      title: libraryPassage.title,
      text: libraryPassage.text,
      grade_band: libraryPassage.grade_content,
    };
  }

  const transformedSession = {
    id: session.id,
    created_at: session.created_at,
    duration_seconds: session.duration_seconds,
    scores_json: session.scores_json,
    students: session.students as unknown as { first_name: string; last_name: string },
    assessments,
  };

  return (
    <PrintReport
      session={transformedSession}
      events={events || []}
    />
  );
}
