"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformConfig } from "@/lib/config";
import {
  Building2,
  UserPlus,
  GraduationCap,
  BookMarked,
  LogOut,
  Plus,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check
} from "lucide-react";

interface SchoolData {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string | null }[];
  users: { id: string; name: string; email: string; role: string }[];
  _count: { classes: number; subjects: number; students: number };
}

interface TeacherData {
  id: string;
  name: string;
  email: string;
  school_id: string | null;
  school: { id: string; name: string; slug: string } | null;
  must_change_password: boolean;
  teacherAssignments: {
    id: string;
    class: { id: string; name: string };
    subject: { id: string; name: string; code: string | null };
  }[];
}

interface Props {
  adminName: string;
  adminEmail: string;
  initialSchools: SchoolData[];
  initialTeachers: TeacherData[];
}

export default function AdminDashboardClient({
  adminName,
  adminEmail,
  initialSchools,
  initialTeachers,
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"schools" | "create-school" | "create-admin" | "create-teacher" | "assign-teacher">("schools");

  // Form states
  const [schoolName, setSchoolName] = useState("");
  const [schoolSlug, setSchoolSlug] = useState("");
  const [schoolLogo, setSchoolLogo] = useState("");

  const [adminSchoolId, setAdminSchoolId] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmailInput, setAdminEmailInput] = useState("");

  const [teacherSchoolId, setTeacherSchoolId] = useState("");
  const [teacherFullName, setTeacherFullName] = useState("");
  const [teacherEmailInput, setTeacherEmailInput] = useState("");

  const [assignSchoolId, setAssignSchoolId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");

  // Feedback states
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [createdCredential, setCreatedCredential] = useState<{ email: string; pass: string; role: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedAssignSchool = initialSchools.find((s) => s.id === assignSchoolId);
  const availableTeachersForSchool = initialTeachers.filter((t) => t.school_id === assignSchoolId);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. Create School
  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/schools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: schoolName,
          slug: schoolSlug,
          logo_url: schoolLogo || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create school.");

      setMessage({ text: `School "${data.school.name}" created successfully.`, type: "success" });
      setSchoolName("");
      setSchoolSlug("");
      setSchoolLogo("");
      router.refresh();
      setActiveTab("schools");
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 2. Create First School Admin
  const handleCreateSchoolAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setCreatedCredential(null);

    try {
      const res = await fetch(`/api/admin/schools/${adminSchoolId}/admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: adminFullName,
          email: adminEmailInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create school administrator.");

      setCreatedCredential({
        email: data.user.email,
        pass: data.temporaryPassword,
        role: "School Administrator",
      });
      setMessage({ text: `School admin created for ${data.user.name}.`, type: "success" });
      setAdminFullName("");
      setAdminEmailInput("");
      router.refresh();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 3. Create Teacher Account
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setCreatedCredential(null);

    try {
      const res = await fetch("/api/admin/teachers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: teacherSchoolId,
          name: teacherFullName,
          email: teacherEmailInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create teacher.");

      setCreatedCredential({
        email: data.teacher.email,
        pass: data.temporaryPassword,
        role: "Teacher",
      });
      setMessage({
        text: `Teacher "${data.teacher.name}" created with a temporary password. Provide this credential to the teacher.`,
        type: "success",
      });
      setTeacherFullName("");
      setTeacherEmailInput("");
      router.refresh();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // 4. Create Teacher Assignment
  const handleAssignTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/teachers/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: assignSchoolId,
          teacher_id: assignTeacherId,
          class_id: assignClassId,
          subject_id: assignSubjectId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to assign teacher.");

      setMessage({ text: "Teacher assignment saved successfully.", type: "success" });
      router.refresh();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-[#E9E4D9] bg-[#FFFFFF]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#671B24] text-white flex items-center justify-center font-serif font-bold text-sm">
              {platformConfig.name.charAt(0)}
            </div>
            <div>
              <span className="font-semibold text-base text-[#2C2825] block leading-tight">
                {platformConfig.name} Platform Administration
              </span>
              <span className="text-[11px] font-mono text-[#6B645D]">
                Platform Admin: {adminName} ({adminEmail})
              </span>
            </div>
          </div>

          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 text-xs text-[#6B645D] hover:text-[#671B24] font-mono transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </form>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-6xl mx-auto px-6 py-8 w-full flex-1">
        {/* Navigation Tabs */}
        <div className="border-b border-[#E9E4D9] mb-6 flex items-center justify-between">
          <div className="flex space-x-1">
            <button
              onClick={() => { setActiveTab("schools"); setMessage(null); }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "schools"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              Schools & Teachers Overview
            </button>
            <button
              onClick={() => { setActiveTab("create-school"); setMessage(null); }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "create-school"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              + Create School
            </button>
            <button
              onClick={() => { setActiveTab("create-admin"); setMessage(null); }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "create-admin"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              + Add School Admin
            </button>
            <button
              onClick={() => { setActiveTab("create-teacher"); setMessage(null); }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "create-teacher"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              + Create Teacher
            </button>
            <button
              onClick={() => { setActiveTab("assign-teacher"); setMessage(null); }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "assign-teacher"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              + Assign Teacher
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {message && (
          <div
            className={`mb-6 p-4 rounded-sm border flex items-start gap-2.5 text-xs ${
              message.type === "success"
                ? "bg-[#E5EDE5] border-[#D3DDD3] text-[#3F4E40]"
                : "bg-[#F6EBEB] border-[#F0D5D5] text-[#671B24]"
            }`}
          >
            {message.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* Created Temporary Credential Alert */}
        {createdCredential && (
          <div className="mb-6 p-5 bg-[#FAF8F3] border border-[#671B24] rounded-sm">
            <span className="text-xs font-mono uppercase tracking-wider text-[#671B24] block font-semibold mb-1">
              New Account Temporary Credentials Generated
            </span>
            <p className="text-xs text-[#47423D] mb-3">
              Copy and provide these temporary credentials to the {createdCredential.role}. The user will be required to change their password upon signing in.
            </p>
            <div className="p-3 bg-white border border-[#E9E4D9] rounded-sm font-mono text-xs flex items-center justify-between">
              <div>
                <span className="text-[#6B645D] block">Email: <strong className="text-[#2C2825]">{createdCredential.email}</strong></span>
                <span className="text-[#6B645D] block mt-1">Temp Password: <strong className="text-[#671B24]">{createdCredential.pass}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(`Email: ${createdCredential.email}\nTemporary Password: ${createdCredential.pass}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-[#671B24] text-white text-xs font-mono hover:bg-[#52151D] cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied" : "Copy Credentials"}
              </button>
            </div>
          </div>
        )}

        {/* TAB 1: Schools & Teachers Overview */}
        {activeTab === "schools" && (
          <div className="space-y-8">
            {/* Schools Table */}
            <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
              <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#671B24]" /> Registered Schools ({initialSchools.length})
                </span>
                <span className="text-[11px] font-mono text-[#6B645D]">Multi-Tenant Isolation Enforced</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                      <th className="py-2.5 px-5 font-medium">School Name</th>
                      <th className="py-2.5 px-5 font-medium">Subdomain Slug</th>
                      <th className="py-2.5 px-5 font-medium">Staff Portal Address</th>
                      <th className="py-2.5 px-5 font-medium text-center">Classes</th>
                      <th className="py-2.5 px-5 font-medium text-center">Students</th>
                      <th className="py-2.5 px-5 font-medium">Staff Members</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F0E6]">
                    {initialSchools.map((s) => (
                      <tr key={s.id} className="hover:bg-[#FAF8F3]">
                        <td className="py-3 px-5 font-semibold text-[#2C2825]">{s.name}</td>
                        <td className="py-3 px-5 font-mono text-[#671B24]">{s.slug}</td>
                        <td className="py-3 px-5 font-mono text-[11px] text-[#3F4E40]">
                          {platformConfig.getSchoolStaffUrl(s.slug)}
                        </td>
                        <td className="py-3 px-5 text-center font-mono">{s._count.classes}</td>
                        <td className="py-3 px-5 text-center font-mono">{s._count.students}</td>
                        <td className="py-3 px-5">
                          <span className="text-[11px] text-[#6B645D]">
                            {s.users.filter((u) => u.role === "school_admin").length} Admins,{" "}
                            {s.users.filter((u) => u.role === "teacher").length} Teachers
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Teachers Table */}
            <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
              <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D] flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-[#3F4E40]" /> Registered Teachers & Class Assignments
                </span>
                <span className="text-[11px] font-mono text-[#6B645D]">
                  Managed Strictly by Platform Admin
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                      <th className="py-2.5 px-5 font-medium">Teacher Name</th>
                      <th className="py-2.5 px-5 font-medium">Email</th>
                      <th className="py-2.5 px-5 font-medium">Assigned School</th>
                      <th className="py-2.5 px-5 font-medium">Assigned Classes & Subjects</th>
                      <th className="py-2.5 px-5 font-medium text-right">Password Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F0E6]">
                    {initialTeachers.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-[#6B645D]">
                          No teachers registered yet. Use the "+ Create Teacher" tab to add teachers.
                        </td>
                      </tr>
                    ) : (
                      initialTeachers.map((t) => (
                        <tr key={t.id} className="hover:bg-[#FAF8F3]">
                          <td className="py-3 px-5 font-semibold text-[#2C2825]">{t.name}</td>
                          <td className="py-3 px-5 font-mono text-[#47423D]">{t.email}</td>
                          <td className="py-3 px-5 font-mono text-[#671B24]">
                            {t.school?.name || "Unassigned"}
                          </td>
                          <td className="py-3 px-5">
                            {t.teacherAssignments.length === 0 ? (
                              <span className="text-[11px] text-[#B8B0A5] italic">No assignments yet</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {t.teacherAssignments.map((a) => (
                                  <span
                                    key={a.id}
                                    className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]"
                                  >
                                    {a.class.name}: {a.subject.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-5 text-right font-mono text-[11px]">
                            {t.must_change_password ? (
                              <span className="text-[#671B24] font-medium">Temp Password</span>
                            ) : (
                              <span className="text-[#3F4E40]">Personalized</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Create School */}
        {activeTab === "create-school" && (
          <div className="max-w-xl mx-auto bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <div className="border-b border-[#E9E4D9] pb-4 mb-5">
              <h2 className="text-base font-serif font-bold text-[#2C2825] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#671B24]" /> Register New School
              </h2>
              <p className="text-xs text-[#6B645D] mt-1">
                Creates the school entity, generates its subdomain slug, and sets card pricing rules.
              </p>
            </div>

            <form onSubmit={handleCreateSchool} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Corona Secondary School"
                  value={schoolName}
                  onChange={(e) => {
                    setSchoolName(e.target.value);
                    if (!schoolSlug) {
                      setSchoolSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Subdomain Slug (Unique Identifier)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. corona-school"
                  value={schoolSlug}
                  onChange={(e) => setSchoolSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] font-mono"
                />
                <span className="text-[11px] text-[#6B645D] block mt-1">
                  Staff URL: {platformConfig.getSchoolStaffUrl(schoolSlug || "slug")}
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Logo URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={schoolLogo}
                  onChange={(e) => setSchoolLogo(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#671B24] hover:bg-[#52151D] cursor-pointer transition-colors mt-4 disabled:opacity-50"
              >
                {loading ? "Registering..." : "Create School"}
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: Create School Admin */}
        {activeTab === "create-admin" && (
          <div className="max-w-xl mx-auto bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <div className="border-b border-[#E9E4D9] pb-4 mb-5">
              <h2 className="text-base font-serif font-bold text-[#2C2825] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#671B24]" /> Create First School Administrator
              </h2>
              <p className="text-xs text-[#6B645D] mt-1">
                Assigns the primary school administrator who will oversee school operations, students, and payment verification.
              </p>
            </div>

            <form onSubmit={handleCreateSchoolAdmin} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Select School
                </label>
                <select
                  required
                  value={adminSchoolId}
                  onChange={(e) => setAdminSchoolId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                >
                  <option value="">-- Choose School --</option>
                  {initialSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Administrator Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Ngozi Okoye"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Administrator Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@school.edu.ng"
                  value={adminEmailInput}
                  onChange={(e) => setAdminEmailInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#671B24] hover:bg-[#52151D] cursor-pointer transition-colors mt-4 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create School Administrator"}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: Create Teacher */}
        {activeTab === "create-teacher" && (
          <div className="max-w-xl mx-auto bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <div className="border-b border-[#E9E4D9] pb-4 mb-5">
              <h2 className="text-base font-serif font-bold text-[#2C2825] flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-[#3F4E40]" /> Create Teacher Account
              </h2>
              <p className="text-xs text-[#6B645D] mt-1">
                Teachers are created by platform_admin with a temporary password they can change upon signing in.
              </p>
            </div>

            <form onSubmit={handleCreateTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Target School
                </label>
                <select
                  required
                  value={teacherSchoolId}
                  onChange={(e) => setTeacherSchoolId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                >
                  <option value="">-- Choose School --</option>
                  {initialSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Teacher Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mr. Olumide Johnson"
                  value={teacherFullName}
                  onChange={(e) => setTeacherFullName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Teacher Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="teacher@school.edu.ng"
                  value={teacherEmailInput}
                  onChange={(e) => setTeacherEmailInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#3F4E40] hover:bg-[#2E3A2F] cursor-pointer transition-colors mt-4 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Teacher Account with Temp Password"}
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: Assign Teacher */}
        {activeTab === "assign-teacher" && (
          <div className="max-w-xl mx-auto bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <div className="border-b border-[#E9E4D9] pb-4 mb-5">
              <h2 className="text-base font-serif font-bold text-[#2C2825] flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-[#3F4E40]" /> Assign Teacher to Class & Subject
              </h2>
              <p className="text-xs text-[#6B645D] mt-1">
                Assigns a teacher to a specific class and subject. Teachers will see ONLY their assigned classes on their portal.
              </p>
            </div>

            <form onSubmit={handleAssignTeacher} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  School
                </label>
                <select
                  required
                  value={assignSchoolId}
                  onChange={(e) => {
                    setAssignSchoolId(e.target.value);
                    setAssignTeacherId("");
                    setAssignClassId("");
                    setAssignSubjectId("");
                  }}
                  className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                >
                  <option value="">-- Choose School --</option>
                  {initialSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedAssignSchool && (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                      Teacher
                    </label>
                    <select
                      required
                      value={assignTeacherId}
                      onChange={(e) => setAssignTeacherId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                    >
                      <option value="">-- Choose Teacher --</option>
                      {availableTeachersForSchool.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                      Class
                    </label>
                    <select
                      required
                      value={assignClassId}
                      onChange={(e) => setAssignClassId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                    >
                      <option value="">-- Choose Class --</option>
                      {selectedAssignSchool.classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                      Subject
                    </label>
                    <select
                      required
                      value={assignSubjectId}
                      onChange={(e) => setAssignSubjectId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                    >
                      <option value="">-- Choose Subject --</option>
                      {selectedAssignSchool.subjects.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} {sub.code ? `(${sub.code})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#3F4E40] hover:bg-[#2E3A2F] cursor-pointer transition-colors mt-4 disabled:opacity-50"
                  >
                    {loading ? "Assigning..." : "Assign Teacher"}
                  </button>
                </>
              )}
            </form>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E9E4D9] bg-[#FFFFFF] py-4 text-xs text-[#6B645D]">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <span>{platformConfig.name} Platform Administration</span>
          <span className="font-mono text-[11px]">Authorized Access Only</span>
        </div>
      </footer>
    </div>
  );
}
