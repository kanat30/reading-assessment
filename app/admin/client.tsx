"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function AdminClient({ currentUser, teachers: initialTeachers, schools: initialSchools }: AdminClientProps) {
  const router = useRouter();
  const [teachers, setTeachers] = useState(initialTeachers);
  const [schools, setSchools] = useState(initialSchools);
  const [panelMode, setPanelMode] = useState<PanelMode>("closed");
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  // Add teacher form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [password, setPassword] = useState("");
  const [useInvite, setUseInvite] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Add school form state
  const [newSchoolName, setNewSchoolName] = useState("");

  // Reset password state
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
        setSuccess(
          useInvite
            ? `Invite sent to ${email}. They will receive an email to set their password.`
            : `Account created for ${email}. They can log in with the password you set.`
        );
        router.refresh();
        setTimeout(closePanel, 2000);
      } else {
        setError(result.error || "Failed to create teacher");
      }
    } catch (err) {
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
    } catch (err) {
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
    } catch (err) {
      setError("An unexpected error occurred");
    }

    setIsSubmitting(false);
  };

  const handleDeleteTeacher = async (teacher: Teacher) => {
    if (teacher.id === currentUser.id) {
      alert("You cannot delete your own account");
      return;
    }
    if (!confirm(`Are you sure you want to delete ${teacher.full_name}? This will also delete all their assessments.`)) {
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

  return (
    <div className="min-h-screen bg-paper">
      {/* Header */}
      <header className="border-b border-mist px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-xs font-medium bg-accent-blue/10 text-accent-blue px-2 py-1 rounded">
              Admin
            </span>
            <div>
              <p className="font-medium text-ink">{currentUser.full_name}</p>
              <p className="text-sm text-stone">{currentUser.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-sm text-accent-blue hover:underline">
              Teacher Dashboard
            </a>
            <form action={signOut}>
              <button type="submit" className="text-sm text-stone hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Actions */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-serif text-2xl font-semibold text-ink">User Management</h1>
          <div className="flex gap-3">
            <Button
              onClick={() => setPanelMode("add-school")}
              variant="outline"
              className="border-mist"
            >
              Add School
            </Button>
            <Button
              onClick={() => setPanelMode("add-teacher")}
              className="bg-accent-blue text-paper hover:bg-accent-blue/90"
            >
              Add Teacher
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-mist/30 rounded-lg p-4">
            <p className="text-2xl font-semibold text-ink">{teachers.length}</p>
            <p className="text-sm text-stone">Teachers</p>
          </div>
          <div className="bg-mist/30 rounded-lg p-4">
            <p className="text-2xl font-semibold text-ink">{schools.length}</p>
            <p className="text-sm text-stone">Schools</p>
          </div>
          <div className="bg-mist/30 rounded-lg p-4">
            <p className="text-2xl font-semibold text-ink">
              {teachers.filter((t) => t.role === "admin").length}
            </p>
            <p className="text-sm text-stone">Admins</p>
          </div>
        </div>

        {/* Teachers table */}
        <div className="bg-paper border border-mist rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-mist bg-mist/20">
                <th className="text-left p-4 text-sm font-medium text-stone">Name</th>
                <th className="text-left p-4 text-sm font-medium text-stone">Email</th>
                <th className="text-left p-4 text-sm font-medium text-stone">School</th>
                <th className="text-left p-4 text-sm font-medium text-stone">Role</th>
                <th className="text-right p-4 text-sm font-medium text-stone">Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => (
                <tr key={teacher.id} className="border-b border-mist last:border-0 hover:bg-mist/10">
                  <td className="p-4">
                    <p className="font-medium text-ink">{teacher.full_name}</p>
                  </td>
                  <td className="p-4 text-stone">{teacher.email}</td>
                  <td className="p-4 text-stone">{teacher.schools?.name || "—"}</td>
                  <td className="p-4">
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded ${
                        teacher.role === "admin"
                          ? "bg-accent-blue/10 text-accent-blue"
                          : "bg-mist text-stone"
                      }`}
                    >
                      {teacher.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setSelectedTeacher(teacher);
                          setPanelMode("reset-password");
                        }}
                        className="text-xs text-accent-blue hover:underline"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => handleToggleRole(teacher)}
                        className="text-xs text-stone hover:text-ink"
                        disabled={teacher.id === currentUser.id}
                      >
                        {teacher.role === "admin" ? "Demote" : "Promote"}
                      </button>
                      <button
                        onClick={() => handleDeleteTeacher(teacher)}
                        className="text-xs text-danger hover:underline"
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
      </main>

      {/* Slide-in panel */}
      <AnimatePresence>
        {panelMode !== "closed" && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePanel}
              className="fixed inset-0 bg-ink/20 z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-paper shadow-xl z-50 overflow-y-auto"
            >
              <div className="p-6">
                {/* Close button */}
                <button
                  onClick={closePanel}
                  className="absolute top-4 right-4 text-stone hover:text-ink"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                {/* Add Teacher Form */}
                {panelMode === "add-teacher" && (
                  <form onSubmit={handleAddTeacher}>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-6">
                      Add Teacher
                    </h2>

                    {error && (
                      <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
                        {error}
                      </div>
                    )}

                    {success && (
                      <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg text-sm text-success">
                        {success}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-ink mb-1">
                          Full Name
                        </label>
                        <Input
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Jane Smith"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-ink mb-1">
                          Email
                        </label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="jane@school.edu"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-ink mb-1">
                          School
                        </label>
                        <select
                          value={schoolId}
                          onChange={(e) => setSchoolId(e.target.value)}
                          className="w-full h-10 px-3 rounded-md border border-mist bg-paper text-ink"
                          required
                        >
                          <option value="">Select a school</option>
                          {schools.map((school) => (
                            <option key={school.id} value={school.id}>
                              {school.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Toggle between invite and password */}
                      <div className="border border-mist rounded-lg p-4">
                        <div className="flex gap-2 mb-4">
                          <button
                            type="button"
                            onClick={() => setUseInvite(false)}
                            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                              !useInvite
                                ? "bg-accent-blue text-paper"
                                : "bg-mist/50 text-stone hover:text-ink"
                            }`}
                          >
                            Set Password
                          </button>
                          <button
                            type="button"
                            onClick={() => setUseInvite(true)}
                            className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                              useInvite
                                ? "bg-accent-blue text-paper"
                                : "bg-mist/50 text-stone hover:text-ink"
                            }`}
                          >
                            Send Invite
                          </button>
                        </div>

                        {useInvite ? (
                          <p className="text-sm text-stone">
                            Teacher will receive an email to set their own password.
                          </p>
                        ) : (
                          <div>
                            <label className="block text-sm font-medium text-ink mb-1">
                              Password
                            </label>
                            <Input
                              type="text"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="Enter a default password"
                              required={!useInvite}
                            />
                            <p className="text-xs text-stone mt-1">
                              Share this password with the teacher. They can change it later.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full mt-6 bg-accent-blue text-paper py-3 h-auto rounded-lg hover:bg-accent-blue/90 disabled:opacity-50"
                    >
                      {isSubmitting
                        ? "Creating..."
                        : useInvite
                        ? "Send Invite"
                        : "Create Account"}
                    </Button>
                  </form>
                )}

                {/* Add School Form */}
                {panelMode === "add-school" && (
                  <form onSubmit={handleAddSchool}>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-6">
                      Add School
                    </h2>

                    {error && (
                      <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
                        {error}
                      </div>
                    )}

                    {success && (
                      <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg text-sm text-success">
                        {success}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">
                        School Name
                      </label>
                      <Input
                        value={newSchoolName}
                        onChange={(e) => setNewSchoolName(e.target.value)}
                        placeholder="Lincoln Elementary"
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full mt-6 bg-accent-blue text-paper py-3 h-auto rounded-lg hover:bg-accent-blue/90 disabled:opacity-50"
                    >
                      {isSubmitting ? "Creating..." : "Create School"}
                    </Button>
                  </form>
                )}

                {/* Reset Password Form */}
                {panelMode === "reset-password" && selectedTeacher && (
                  <form onSubmit={handleResetPassword}>
                    <h2 className="font-serif text-xl font-semibold text-ink mb-2">
                      Reset Password
                    </h2>
                    <p className="text-sm text-stone mb-6">
                      Set a new password for {selectedTeacher.full_name}
                    </p>

                    {error && (
                      <div className="mb-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-sm text-danger">
                        {error}
                      </div>
                    )}

                    {success && (
                      <div className="mb-4 p-3 bg-success/10 border border-success/20 rounded-lg text-sm text-success">
                        {success}
                      </div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-ink mb-1">
                        New Password
                      </label>
                      <Input
                        type="text"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        required
                        minLength={6}
                      />
                      <p className="text-xs text-stone mt-1">
                        Minimum 6 characters. Share this password with the teacher.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full mt-6 bg-accent-blue text-paper py-3 h-auto rounded-lg hover:bg-accent-blue/90 disabled:opacity-50"
                    >
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
