"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signOut } from "@/app/auth/actions";
import {
  createTeacherWithPassword,
  createTeacherWithInvite,
  createSchool,
  deleteTeacher,
  resetTeacherPassword,
  promoteToAdmin,
  demoteToTeacher,
} from "./actions";

interface School {
  id: string;
  name: string;
}

interface Teacher {
  id: string;
  email: string;
  full_name: string;
  role: string;
  school_id: string;
  created_at: string;
  schools?: { name: string };
}

interface AdminClientProps {
  currentUser: Teacher;
  teachers: Teacher[];
  schools: School[];
}

type PanelMode = "closed" | "add-teacher" | "add-school" | "reset-password";
type ActiveTab = "users" | "schools";

export function AdminClient({ currentUser, teachers: initialTeachers, schools: initialSchools }: AdminClientProps) {
  const router = useRouter();
  const [teachers, setTeachers] = useState(initialTeachers);
  const [schools, setSchools] = useState(initialSchools);
  const [panelMode, setPanelMode] = useState<PanelMode>("closed");
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("users");

  // Form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [password, setPassword] = useState("");
  const [useInvite, setUseInvite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newSchoolName, setNewSchoolName] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const closePanel = () => {
    setPanelMode("closed");
    setSelectedTeacher(null);
    setEmail("");
    setFullName("");
    setSchoolId("");
    setPassword("");
    setUseInvite(false);
    setNewSchoolName("");
    setNewPassword("");
    setError("");
    setSuccess("");
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");
    setSuccess("");

    try {
      let result;
      if (useInvite) {
        result = await createTeacherWithInvite(email, fullName, schoolId);
      } else {
        if (!password) {
          setError("Password is required");
          setIsSubmitting(false);
          return;
        }
        result = await createTeacherWithPassword(email, fullName, schoolId, password);
      }

      if (result.success && result.teacher) {
        setSuccess(useInvite ? `Invite sent to ${email}` : `Account created for ${email}`);
        router.refresh();
        setTimeout(closePanel, 1500);
      } else {
        setError(result.error || "Failed to create teacher");
      }
    } catch {
      setError("An unexpected error occurred");
    }
    setIsSubmitting(false);
  };

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const result = await createSchool(newSchoolName);
      if (result.success && result.school) {
        setSchools([...schools, result.school]);
        setSuccess(`School "${newSchoolName}" created`);
        router.refresh();
        setTimeout(closePanel, 1500);
      } else {
        setError(result.error || "Failed to create school");
      }
    } catch {
      setError("An unexpected error occurred");
    }
    setIsSubmitting(false);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTeacher) return;
    setIsSubmitting(true);
    setError("");

    try {
      const result = await resetTeacherPassword(selectedTeacher.id, newPassword);
      if (result.success) {
        setSuccess(`Password reset for ${selectedTeacher.email}`);
        setTimeout(closePanel, 1500);
      } else {
        setError(result.error || "Failed to reset password");
      }
    } catch {
      setError("An unexpected error occurred");
    }
    setIsSubmitting(false);
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    if (teacher.id === currentUser.id) {
      alert("You cannot delete your own account");
      return;
    }
    if (!confirm(`Delete ${teacher.full_name}? This will also delete their assessments.`)) {
      return;
    }
    const result = await deleteTeacher(teacher.id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || "Failed to delete teacher");
    }
  };

  const handleToggleRole = async (teacher: Teacher) => {
    if (teacher.id === currentUser.id) {
      alert("You cannot change your own role");
      return;
    }
    const result = teacher.role === "admin"
      ? await demoteToTeacher(teacher.id)
      : await promoteToAdmin(teacher.id);
    if (result.success) {
      router.refresh();
    } else {
      alert(result.error || "Failed to update role");
    }
  };

  const adminCount = teachers.filter((t) => t.role === "admin").length;
  const teacherCount = teachers.filter((t) => t.role === "teacher").length;

  return (
    <div className="min-h-screen bg-cream">
      {/* Compact Header */}
      <header className="bg-paper border-b border-mist">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold bg-ink text-paper px-2 py-0.5 rounded">
              ADMIN
            </span>
            <span className="text-sm text-ink">{currentUser.full_name}</span>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/admin/analytics" className="text-stone hover:text-ink">
              AI Analytics
            </Link>
            <Link
              href="/dashboard"
              className="bg-accent-blue/10 text-accent-blue px-3 py-1 rounded hover:bg-accent-blue/20 transition-colors"
            >
              → Dashboard
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-stone hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Stats Row */}
        <div className="flex items-center gap-8 mb-8 text-sm">
          <div>
            <span className="text-2xl font-semibold text-ink">{teachers.length}</span>
            <span className="text-stone ml-2">users</span>
          </div>
          <div className="w-px h-6 bg-mist" />
          <div>
            <span className="text-2xl font-semibold text-ink">{schools.length}</span>
            <span className="text-stone ml-2">schools</span>
          </div>
          <div className="w-px h-6 bg-mist" />
          <div>
            <span className="text-2xl font-semibold text-ink">{adminCount}</span>
            <span className="text-stone ml-2">admins</span>
          </div>
          <div className="flex-1" />
          <Button
            onClick={() => setPanelMode("add-teacher")}
            size="sm"
            className="bg-accent-blue text-paper hover:bg-accent-blue/90"
          >
            + Add User
          </Button>
          <Button
            onClick={() => setPanelMode("add-school")}
            variant="outline"
            size="sm"
          >
            + Add School
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-mist">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "users"
                ? "border-ink text-ink"
                : "border-transparent text-stone hover:text-ink"
            }`}
          >
            Users ({teachers.length})
          </button>
          <button
            onClick={() => setActiveTab("schools")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === "schools"
                ? "border-ink text-ink"
                : "border-transparent text-stone hover:text-ink"
            }`}
          >
            Schools ({schools.length})
          </button>
        </div>

        {/* Users Tab */}
        {activeTab === "users" && (
          <div className="bg-paper rounded-lg border border-mist overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mist bg-mist/30">
                  <th className="text-left px-4 py-2.5 font-medium text-stone">Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-stone">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-stone">School</th>
                  <th className="text-left px-4 py-2.5 font-medium text-stone">Role</th>
                  <th className="text-right px-4 py-2.5 font-medium text-stone">Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id} className="border-b border-mist/50 last:border-0 hover:bg-mist/20">
                    <td className="px-4 py-2.5 font-medium text-ink">{teacher.full_name}</td>
                    <td className="px-4 py-2.5 text-stone">{teacher.email}</td>
                    <td className="px-4 py-2.5 text-stone">{teacher.schools?.name || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                        teacher.role === "admin"
                          ? "bg-accent-blue/10 text-accent-blue"
                          : "bg-mist text-stone"
                      }`}>
                        {teacher.role}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <button
                          onClick={() => { setSelectedTeacher(teacher); setPanelMode("reset-password"); }}
                          className="text-accent-blue hover:underline"
                        >
                          Reset
                        </button>
                        <button
                          onClick={() => handleToggleRole(teacher)}
                          className="text-stone hover:text-ink disabled:opacity-30"
                          disabled={teacher.id === currentUser.id}
                        >
                          {teacher.role === "admin" ? "Demote" : "Promote"}
                        </button>
                        <button
                          onClick={() => handleDeleteTeacher(teacher)}
                          className="text-alert hover:underline disabled:opacity-30"
                          disabled={teacher.id === currentUser.id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Schools Tab */}
        {activeTab === "schools" && (
          <div className="bg-paper rounded-lg border border-mist overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mist bg-mist/30">
                  <th className="text-left px-4 py-2.5 font-medium text-stone">School Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-stone">Teachers</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school) => {
                  const schoolTeachers = teachers.filter(t => t.school_id === school.id);
                  return (
                    <tr key={school.id} className="border-b border-mist/50 last:border-0 hover:bg-mist/20">
                      <td className="px-4 py-2.5 font-medium text-ink">{school.name}</td>
                      <td className="px-4 py-2.5 text-stone">{schoolTeachers.length}</td>
                    </tr>
                  );
                })}
                {schools.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-stone">
                      No schools yet. Add your first school above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Slide-in Panel */}
      <AnimatePresence>
        {panelMode !== "closed" && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="fixed inset-0 bg-ink/20 z-40"
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-paper shadow-xl z-50 overflow-y-auto"
            >
              <div className="p-5">
                <button onClick={closePanel} className="absolute top-4 right-4 text-stone hover:text-ink">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Add Teacher */}
                {panelMode === "add-teacher" && (
                  <form onSubmit={handleAddTeacher} className="space-y-4">
                    <h2 className="font-semibold text-ink text-lg">Add User</h2>
                    {error && <p className="text-sm text-alert bg-alert/10 px-3 py-2 rounded">{error}</p>}
                    {success && <p className="text-sm text-success bg-success/10 px-3 py-2 rounded">{success}</p>}
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" required />
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required />
                    <select
                      value={schoolId}
                      onChange={(e) => setSchoolId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-mist bg-paper text-sm"
                      required
                    >
                      <option value="">Select school</option>
                      {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setUseInvite(false)}
                        className={`flex-1 py-2 text-sm rounded ${!useInvite ? "bg-ink text-paper" : "bg-mist text-stone"}`}>
                        Set Password
                      </button>
                      <button type="button" onClick={() => setUseInvite(true)}
                        className={`flex-1 py-2 text-sm rounded ${useInvite ? "bg-ink text-paper" : "bg-mist text-stone"}`}>
                        Send Invite
                      </button>
                    </div>
                    {!useInvite && (
                      <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required />
                    )}
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-accent-blue text-paper">
                      {isSubmitting ? "Creating..." : useInvite ? "Send Invite" : "Create User"}
                    </Button>
                  </form>
                )}

                {/* Add School */}
                {panelMode === "add-school" && (
                  <form onSubmit={handleAddSchool} className="space-y-4">
                    <h2 className="font-semibold text-ink text-lg">Add School</h2>
                    {error && <p className="text-sm text-alert bg-alert/10 px-3 py-2 rounded">{error}</p>}
                    {success && <p className="text-sm text-success bg-success/10 px-3 py-2 rounded">{success}</p>}
                    <Input value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)} placeholder="School name" required />
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-accent-blue text-paper">
                      {isSubmitting ? "Creating..." : "Create School"}
                    </Button>
                  </form>
                )}

                {/* Reset Password */}
                {panelMode === "reset-password" && selectedTeacher && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <h2 className="font-semibold text-ink text-lg">Reset Password</h2>
                    <p className="text-sm text-stone">For {selectedTeacher.full_name}</p>
                    {error && <p className="text-sm text-alert bg-alert/10 px-3 py-2 rounded">{error}</p>}
                    {success && <p className="text-sm text-success bg-success/10 px-3 py-2 rounded">{success}</p>}
                    <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" required minLength={6} />
                    <Button type="submit" disabled={isSubmitting} className="w-full bg-accent-blue text-paper">
                      {isSubmitting ? "Resetting..." : "Reset Password"}
                    </Button>
                  </form>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
