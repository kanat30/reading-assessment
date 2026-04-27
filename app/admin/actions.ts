"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type CreateTeacherResult = {
  success: boolean;
  error?: string;
  teacher?: {
    id: string;
    email: string;
    full_name: string;
  };
};

/**
 * Verify that the current user is an admin
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: teacher } = await supabase
    .from("teachers")
    .select("role")
    .eq("auth_provider_id", user.id)
    .single();

  if (!teacher || teacher.role !== "admin") {
    throw new Error("Not authorized");
  }

  return user;
}

/**
 * Get all teachers across all schools (admin only)
 */
export async function getAllTeachers() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("teachers")
    .select("*, schools(name)")
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message };
  }

  return { teachers: data };
}

/**
 * Get all schools (admin only)
 */
export async function getAllSchools() {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("schools")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    return { error: error.message };
  }

  return { schools: data };
}

/**
 * Create a new school (admin only)
 */
export async function createSchool(name: string): Promise<{ success: boolean; error?: string; school?: { id: string; name: string } }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("schools")
    .insert({ name })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return { success: true, school: data };
}

/**
 * Create a teacher with a default password (admin only)
 * The teacher can log in immediately with this password
 */
export async function createTeacherWithPassword(
  email: string,
  fullName: string,
  schoolId: string,
  password: string
): Promise<CreateTeacherResult> {
  await requireAdmin();
  const admin = createAdminClient();

  // 1. Create auth user with the provided password
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // Auto-confirm email so they can log in immediately
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message || "Failed to create auth user" };
  }

  const userId = authData.user.id;

  // 2. Create teacher record
  const { data: teacher, error: teacherError } = await admin
    .from("teachers")
    .insert({
      school_id: schoolId,
      email,
      full_name: fullName,
      auth_provider_id: userId,
      role: "teacher",
    })
    .select()
    .single();

  if (teacherError) {
    // Cleanup: delete the auth user if teacher creation fails
    await admin.auth.admin.deleteUser(userId);
    return { success: false, error: teacherError.message };
  }

  revalidatePath("/admin");
  return {
    success: true,
    teacher: {
      id: teacher.id,
      email: teacher.email,
      full_name: teacher.full_name,
    },
  };
}

/**
 * Create a teacher and send an invite email (admin only)
 * The teacher will receive an email to set their own password
 */
export async function createTeacherWithInvite(
  email: string,
  fullName: string,
  schoolId: string
): Promise<CreateTeacherResult> {
  await requireAdmin();
  const admin = createAdminClient();

  // 1. Invite user via email - they'll set their own password
  const { data: authData, error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/login`,
  });

  if (authError || !authData.user) {
    return { success: false, error: authError?.message || "Failed to send invite" };
  }

  const userId = authData.user.id;

  // 2. Create teacher record
  const { data: teacher, error: teacherError } = await admin
    .from("teachers")
    .insert({
      school_id: schoolId,
      email,
      full_name: fullName,
      auth_provider_id: userId,
      role: "teacher",
    })
    .select()
    .single();

  if (teacherError) {
    // Cleanup: delete the auth user if teacher creation fails
    await admin.auth.admin.deleteUser(userId);
    return { success: false, error: teacherError.message };
  }

  revalidatePath("/admin");
  return {
    success: true,
    teacher: {
      id: teacher.id,
      email: teacher.email,
      full_name: teacher.full_name,
    },
  };
}

/**
 * Delete a teacher (admin only)
 */
export async function deleteTeacher(teacherId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // Get teacher's auth_provider_id first
  const { data: teacher, error: fetchError } = await admin
    .from("teachers")
    .select("auth_provider_id")
    .eq("id", teacherId)
    .single();

  if (fetchError || !teacher) {
    return { success: false, error: "Teacher not found" };
  }

  // Delete teacher record (this will cascade to assessments, etc.)
  const { error: deleteError } = await admin
    .from("teachers")
    .delete()
    .eq("id", teacherId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Delete auth user
  if (teacher.auth_provider_id) {
    await admin.auth.admin.deleteUser(teacher.auth_provider_id);
  }

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Reset a teacher's password (admin only)
 */
export async function resetTeacherPassword(
  teacherId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  // Get teacher's auth_provider_id
  const { data: teacher, error: fetchError } = await admin
    .from("teachers")
    .select("auth_provider_id")
    .eq("id", teacherId)
    .single();

  if (fetchError || !teacher?.auth_provider_id) {
    return { success: false, error: "Teacher not found" };
  }

  // Update password
  const { error: updateError } = await admin.auth.admin.updateUserById(
    teacher.auth_provider_id,
    { password: newPassword }
  );

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

/**
 * Promote a teacher to admin (admin only)
 */
export async function promoteToAdmin(teacherId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("teachers")
    .update({ role: "admin" })
    .eq("id", teacherId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return { success: true };
}

/**
 * Demote an admin to teacher (admin only)
 */
export async function demoteToTeacher(teacherId: string): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const admin = createAdminClient();

  const { error } = await admin
    .from("teachers")
    .update({ role: "teacher" })
    .eq("id", teacherId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/admin");
  return { success: true };
}
