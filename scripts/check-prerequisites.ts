import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPrerequisites() {
  console.log("=== Week 4 Prerequisites Check ===\n");

  // Check 1: Assessments with share tokens
  const { data: assessments, error: assessError } = await supabase
    .from("assessments")
    .select("id, share_token, class_label, created_at, passages(title)")
    .not("share_token", "is", null);

  if (assessError) {
    console.log("X Error fetching assessments:", assessError.message);
  } else if (!assessments || assessments.length === 0) {
    console.log("X No assessments with share tokens found");
  } else {
    console.log("OK " + assessments.length + " assessment(s) with share tokens:");
    assessments.forEach((a: any) => {
      const title = a.passages?.title || "Unknown";
      const label = a.class_label || "no class";
      const token = a.share_token?.slice(0, 8) || "???";
      console.log("   - " + title + " (" + label + ") - token: " + token + "...");
    });
  }

  console.log("");

  // Check 2: ALL sessions (regardless of status)
  const { data: allSessions, error: allSessError } = await supabase
    .from("sessions")
    .select("id, status, scored_at, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (allSessError) {
    console.log("X Error fetching all sessions:", allSessError.message);
  } else if (!allSessions || allSessions.length === 0) {
    console.log("X No sessions at all in database");
  } else {
    console.log("INFO: " + allSessions.length + " total session(s) in database:");
    const statusCounts: Record<string, number> = {};
    allSessions.forEach((s: any) => {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    });
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log("   - " + status + ": " + count);
    });
  }

  // Check 2b: Completed sessions specifically
  const { data: sessions, error: sessError } = await supabase
    .from("sessions")
    .select(`
      id,
      status,
      scored_at,
      created_at,
      students(first_name, last_name),
      assessments(class_label, passages(title))
    `)
    .eq("status", "complete")
    .not("scored_at", "is", null)
    .order("scored_at", { ascending: false })
    .limit(10);

  console.log("");
  if (sessError) {
    console.log("X Error fetching completed sessions:", sessError.message);
  } else if (!sessions || sessions.length === 0) {
    console.log("X No completed sessions with scored_at found");
  } else {
    console.log("OK " + sessions.length + " completed session(s):");
    sessions.forEach((s: any) => {
      const student = s.students;
      const name = student ? student.first_name + " " + student.last_name : "Unknown";
      const passage = s.assessments?.passages?.title || "Unknown passage";
      const scoredAt = s.scored_at ? new Date(s.scored_at).toLocaleString() : "not scored";
      console.log("   - " + name + " read \"" + passage + "\" (scored: " + scoredAt + ")");
    });
  }

  console.log("");

  // Check 3: Teachers
  const { data: teachers, error: teachError } = await supabase
    .from("teachers")
    .select("id, email, schools(name)");

  if (teachError) {
    console.log("X Error fetching teachers:", teachError.message);
  } else if (!teachers || teachers.length === 0) {
    console.log("X No teachers found");
  } else {
    console.log("OK " + teachers.length + " teacher(s):");
    teachers.forEach((t: any) => {
      const school = t.schools?.name || "no school";
      console.log("   - " + t.email + " (" + school + ")");
    });
  }

  console.log("");

  // Check 4: Students
  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name");

  if (!students || students.length === 0) {
    console.log("INFO: No students in database yet");
  } else {
    console.log("INFO: " + students.length + " student(s) in database");
  }

  // Check 5: Passages
  const { data: passages } = await supabase
    .from("passages")
    .select("id, title");

  console.log("");
  if (!passages || passages.length === 0) {
    console.log("X No passages in database - need to seed passages first!");
  } else {
    console.log("OK " + passages.length + " passage(s) available");
  }

  // Summary
  console.log("\n=== Summary ===");
  const hasAssessments = assessments && assessments.length > 0;
  const hasSessions = sessions && sessions.length >= 2;
  const hasTeachers = teachers && teachers.length > 0;
  const hasPassages = passages && passages.length > 0;

  if (hasAssessments && hasSessions && hasTeachers) {
    console.log("ALL PREREQUISITES MET - Ready for Week 4!");
  } else {
    console.log("PREREQUISITES NOT MET:");
    if (!hasPassages) console.log("   - Need to seed passages first");
    if (!hasTeachers) console.log("   - Need at least 1 teacher account (sign up at /auth/login)");
    if (!hasAssessments) console.log("   - Need at least 1 assessment with share token (create via dashboard)");
    if (!hasSessions) console.log("   - Need at least 2-3 completed reading sessions");
  }
}

checkPrerequisites().catch(console.error);
