import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchOverrideAnalytics, generateAnalyticsReport } from "@/lib/analytics";
import { AnalyticsClient } from "./client";

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Check if user is admin
  const { data: teacher } = await supabase
    .from("teachers")
    .select("*, schools(*)")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher || teacher.role !== "admin") {
    // Not an admin - redirect to regular dashboard
    redirect("/dashboard");
  }

  // Fetch analytics using admin client (bypasses RLS for system-wide view)
  const admin = createAdminClient();

  // Fetch analytics for last 90 days with school breakdown
  const analytics = await fetchOverrideAnalytics(admin, {
    includeSchoolBreakdown: true,
  });

  // Generate recommendations
  const report = generateAnalyticsReport(analytics);

  return (
    <AnalyticsClient
      report={report}
      currentUser={teacher}
    />
  );
}
