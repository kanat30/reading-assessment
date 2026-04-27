"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  const supabase = await createClient();
  const admin = createAdminClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("fullName") as string;
  const schoolName = formData.get("schoolName") as string;

  // 1. Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    return { error: authError?.message || "Failed to create account" };
  }

  const userId = authData.user.id;

  // 2. Create school (using admin client to bypass RLS)
  const { data: school, error: schoolError } = await admin
    .from("schools")
    .insert({ name: schoolName })
    .select()
    .single();

  if (schoolError || !school) {
    // Cleanup: delete the auth user if school creation fails
    await admin.auth.admin.deleteUser(userId);
    return { error: "Failed to create school" };
  }

  // 3. Create teacher record
  const { error: teacherError } = await admin.from("teachers").insert({
    school_id: school.id,
    email,
    full_name: fullName,
    auth_provider_id: userId,
  });

  if (teacherError) {
    // Cleanup
    await admin.from("schools").delete().eq("id", school.id);
    await admin.auth.admin.deleteUser(userId);
    return { error: "Failed to create teacher profile" };
  }

  redirect("/dashboard");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
