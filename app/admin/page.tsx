import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient } from "./client";

export default async function AdminPage() {
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

  // Fetch all data using admin client
  const admin = createAdminClient();

  const [teachersResult, schoolsResult] = await Promise.all([
    admin.from("teachers").select("*, schools(name)").order("created_at", { ascending: false }),
    admin.from("schools").select("*").order("name", { ascending: true }),
  ]);

  return (
    <AdminClient
      currentUser={teacher}
      teachers={teachersResult.data || []}
      schools={schoolsResult.data || []}
    />
  );
}
