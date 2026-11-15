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
  Check,
  Scale,
  Trash2,
  X,
  Users
} from "lucide-react";
import RosterManager from "./RosterManager";

interface SchoolData {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  classes: { id: string; name: string }[];
  subjects: { id: string; name: string; code: string | null }[];
  users: { id: string; name: string; email: string; role: string }[];
  _count: { classes: number; subjects: number; students: number };
  roster_confirmed_at?: string | Date | null;
  roster_confirmed_count?: number | null;
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

interface SchemePart {
  name: string;
  max: number;
}

interface SchemeBoundary {
  grade: string;
  min: number;
  max: number;
  remark: string;
}

interface GradingSchemeData {
  id: string;
  school_id: string;
  class_level: string | null;
  name: string;
  parts: SchemePart[];
  boundaries: SchemeBoundary[];
  created_at: string;
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
  const [activeTab, setActiveTab] = useState<"schools" | "create-school" | "create-admin" | "create-teacher" | "assign-teacher" | "grading-schemes" | "student-roster" | "payment-batches">("schools");

  // Payment Batches states
  const [adminBatches, setAdminBatches] = useState<{
    id: string;
    school_id: string;
    students_count: number;
    amount_due: string | number;
    amount_received: string | number;
    status: "PENDING" | "CONFIRMED" | "REJECTED";
    created_at: string;
    confirmed_at: string | null;
    school: { id: string; name: string; slug: string; platform_share: string | number };
    term: { id: string; session: string; term_number: number };
    confirmer: { name: string; email: string } | null;
  }[]>([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [confirmingBatchId, setConfirmingBatchId] = useState<string | null>(null);

  const loadAdminBatches = async () => {
    try {
      setLoadingBatches(true);
      const res = await fetch("/api/admin/payment-batches");
      if (res.ok) {
        const data = await res.json();
        setAdminBatches(data.batches || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleConfirmBatch = async (batchId: string) => {
    try {
      setConfirmingBatchId(batchId);
      const res = await fetch(`/api/admin/payment-batches/${batchId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to confirm batch." });
      } else {
        setMessage({ type: "success", text: "Payment batch confirmed. PIN generation is now unlocked for students in this batch." });
        await loadAdminBatches();
      }
    } catch (e: unknown) {
      setMessage({ type: "error", text: (e as Error).message });
    } finally {
      setConfirmingBatchId(null);
    }
  };

  // Grading Scheme states
  const [selectedSchoolForScheme, setSelectedSchoolForScheme] = useState<string>("");
  const [schemesList, setSchemesList] = useState<GradingSchemeData[]>([]);
  const [loadingSchemes, setLoadingSchemes] = useState(false);
  const [editingSchemeId, setEditingSchemeId] = useState<string | null>(null);
  const [schemeName, setSchemeName] = useState("Standard WAEC");
  const [schemeClassLevel, setSchemeClassLevel] = useState("");
  const [schemeParts, setSchemeParts] = useState<SchemePart[]>([
    { name: "CA1", max: 20 },
    { name: "CA2", max: 20 },
    { name: "Exam", max: 60 },
  ]);
  const [schemeBoundaries, setSchemeBoundaries] = useState<SchemeBoundary[]>([
    { grade: "A", min: 70, max: 100, remark: "Excellent" },
    { grade: "B", min: 60, max: 69, remark: "Very Good" },
    { grade: "C", min: 50, max: 59, remark: "Credit" },
    { grade: "D", min: 45, max: 49, remark: "Pass" },
    { grade: "E", min: 40, max: 44, remark: "Fair" },
    { grade: "F", min: 0, max: 39, remark: "Fail" },
  ]);

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

  // 5. Grading Schemes fetch & save
  const fetchSchemesForSchool = async (schoolId: string) => {
    if (!schoolId) {
      setSchemesList([]);
      return;
    }
    setLoadingSchemes(true);
    try {
      const res = await fetch(`/api/admin/grading-scheme?schoolId=${schoolId}`);
      if (!res.ok) throw new Error("Failed to load grading schemes.");
      const data = await res.json();
      setSchemesList(data);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoadingSchemes(false);
    }
  };

  const handleSelectSchemeSchool = (schoolId: string) => {
    setSelectedSchoolForScheme(schoolId);
    setEditingSchemeId(null);
    fetchSchemesForSchool(schoolId);
  };

  const handleSaveScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchoolForScheme) {
      setMessage({ text: "Please select a school first.", type: "error" });
      return;
    }
    // Client-side quick validation checks
    const totalMax = schemeParts.reduce((s, p) => s + Number(p.max || 0), 0);
    if (totalMax !== 100) {
      setMessage({ text: `Part maximums must sum to 100. Current sum: ${totalMax}`, type: "error" });
      return;
    }
    const partNames = schemeParts.map((p) => p.name.trim().toLowerCase());
    if (new Set(partNames).size !== partNames.length) {
      setMessage({ text: "Part names must be unique.", type: "error" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const payload = {
        school_id: selectedSchoolForScheme,
        name: schemeName,
        class_level: schemeClassLevel ? schemeClassLevel.trim() : undefined,
        parts: schemeParts.map((p) => ({ name: p.name.trim(), max: Number(p.max) })),
        boundaries: schemeBoundaries.map((b) => ({
          grade: b.grade.trim(),
          min: Number(b.min),
          max: Number(b.max),
          remark: b.remark.trim(),
        })),
      };

      const url = editingSchemeId
        ? `/api/admin/grading-scheme?id=${editingSchemeId}`
        : "/api/admin/grading-scheme";
      const method = editingSchemeId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save grading scheme.");
      }

      setMessage({
        text: `Grading scheme "${data.name}" saved successfully.`,
        type: "success",
      });
      setEditingSchemeId(null);
      fetchSchemesForSchool(selectedSchoolForScheme);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleEditScheme = (scheme: GradingSchemeData) => {
    setEditingSchemeId(scheme.id);
    setSchemeName(scheme.name);
    setSchemeClassLevel(scheme.class_level || "");
    setSchemeParts(scheme.parts);
    setSchemeBoundaries(scheme.boundaries);
  };

  const handleResetSchemeForm = () => {
    setEditingSchemeId(null);
    setSchemeName("Standard WAEC");
    setSchemeClassLevel("");
    setSchemeParts([
      { name: "CA1", max: 20 },
      { name: "CA2", max: 20 },
      { name: "Exam", max: 60 },
    ]);
    setSchemeBoundaries([
      { grade: "A", min: 70, max: 100, remark: "Excellent" },
      { grade: "B", min: 60, max: 69, remark: "Very Good" },
      { grade: "C", min: 50, max: 59, remark: "Credit" },
      { grade: "D", min: 45, max: 49, remark: "Pass" },
      { grade: "E", min: 40, max: 44, remark: "Fair" },
      { grade: "F", min: 0, max: 39, remark: "Fail" },
    ]);
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
            <button
              onClick={() => {
                setActiveTab("grading-schemes");
                setMessage(null);
                if (initialSchools.length > 0 && !selectedSchoolForScheme) {
                  handleSelectSchemeSchool(initialSchools[0].id);
                }
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "grading-schemes"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              Grading Schemes
            </button>
            <button
              onClick={() => {
                setActiveTab("student-roster");
                setMessage(null);
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "student-roster"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              Student Roster
            </button>
            <button
              onClick={() => {
                setActiveTab("payment-batches");
                setMessage(null);
                loadAdminBatches();
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "payment-batches"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              Payment Batches
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

        {/* TAB 6: Grading Schemes */}
        {activeTab === "grading-schemes" && (
          <div className="space-y-8">
            {/* School Selector Header */}
            <div className="border border-[#E9E4D9] bg-[#FFFFFF] p-5 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D] flex items-center gap-2">
                  <Scale className="w-4 h-4 text-[#671B24]" /> Manage School Grading Schemes
                </span>
                <p className="text-xs text-[#6B645D] mt-1">
                  Select a school to review existing grading schemes or define a new one.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono text-[#47423D]">School:</label>
                <select
                  value={selectedSchoolForScheme}
                  onChange={(e) => handleSelectSchemeSchool(e.target.value)}
                  className="px-3 py-2 text-xs font-mono bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                >
                  <option value="">-- Choose School --</option>
                  {initialSchools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.slug})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedSchoolForScheme && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Existing Schemes List */}
                <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
                  <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                      Existing Schemes ({schemesList.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleResetSchemeForm}
                      className="text-[11px] font-mono text-[#671B24] hover:underline cursor-pointer"
                    >
                      + New Scheme
                    </button>
                  </div>

                  <div className="p-5">
                    {loadingSchemes ? (
                      <p className="text-xs font-mono text-[#6B645D]">Loading schemes...</p>
                    ) : schemesList.length === 0 ? (
                      <p className="text-xs text-[#6B645D] italic">
                        No grading schemes configured for this school yet. Use the form to create one.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {schemesList.map((scheme) => (
                          <div
                            key={scheme.id}
                            className={`p-4 rounded-sm border ${
                              editingSchemeId === scheme.id
                                ? "border-[#671B24] bg-[#FAF8F3]"
                                : "border-[#E9E4D9] bg-white hover:bg-[#FAF8F3]"
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-semibold text-sm text-[#2C2825]">{scheme.name}</h4>
                                <span className="text-[11px] font-mono text-[#671B24] block mt-0.5">
                                  {scheme.class_level ? `Class Level: ${scheme.class_level}` : "School-wide Default"}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleEditScheme(scheme)}
                                className="px-2.5 py-1 text-[11px] font-mono rounded border border-[#D9D3C7] text-[#47423D] hover:bg-white cursor-pointer"
                              >
                                Edit
                              </button>
                            </div>

                            {/* Parts summary */}
                            <div className="mt-3">
                              <span className="text-[10px] font-mono uppercase text-[#6B645D] block mb-1">
                                Score Parts:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {scheme.parts.map((p, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 text-[11px] font-mono bg-[#E5EDE5] text-[#3F4E40] rounded border border-[#D3DDD3]"
                                  >
                                    {p.name}: {p.max}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* Boundaries summary */}
                            <div className="mt-2.5">
                              <span className="text-[10px] font-mono uppercase text-[#6B645D] block mb-1">
                                Grade Boundaries:
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {scheme.boundaries.map((b, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 py-0.5 text-[10px] font-mono bg-[#F4F0E6] text-[#47423D] rounded border border-[#E9E4D9]"
                                  >
                                    {b.grade} ({b.min}–{b.max}): {b.remark}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Form Builder */}
                <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm p-6">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E9E4D9] mb-4">
                    <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                      {editingSchemeId ? "Edit Scheme" : "Create Grading Scheme"}
                    </h3>
                    {editingSchemeId && (
                      <button
                        type="button"
                        onClick={handleResetSchemeForm}
                        className="text-[11px] font-mono text-[#671B24] hover:underline cursor-pointer"
                      >
                        Cancel Editing
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleSaveScheme} className="space-y-4">
                    <div>
                      <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                        Scheme Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={schemeName}
                        onChange={(e) => setSchemeName(e.target.value)}
                        placeholder="e.g. Standard WAEC / Junior Secondary"
                        className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                        Class Level (Optional)
                      </label>
                      <input
                        type="text"
                        value={schemeClassLevel}
                        onChange={(e) => setSchemeClassLevel(e.target.value)}
                        placeholder="e.g. JSS1 or leave blank for school default"
                        className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                      />
                      <span className="text-[11px] text-[#6B645D] block mt-0.5">
                        Leave blank to apply as default for all classes in this school.
                      </span>
                    </div>

                    {/* Score Parts Builder */}
                    <div className="pt-2 border-t border-[#F4F0E6]">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-mono uppercase text-[#47423D] font-medium">
                          Score Parts (Must sum to 100)
                        </label>
                        <span
                          className={`text-xs font-mono font-semibold ${
                            schemeParts.reduce((s, p) => s + Number(p.max || 0), 0) === 100
                              ? "text-[#3F4E40]"
                              : "text-[#671B24]"
                          }`}
                        >
                          Total: {schemeParts.reduce((s, p) => s + Number(p.max || 0), 0)} / 100
                        </span>
                      </div>

                      <div className="space-y-2">
                        {schemeParts.map((part, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <input
                              type="text"
                              required
                              value={part.name}
                              onChange={(e) => {
                                const newParts = [...schemeParts];
                                newParts[index].name = e.target.value;
                                setSchemeParts(newParts);
                              }}
                              placeholder="Part name (e.g. CA1)"
                              className="flex-1 px-2.5 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm"
                            />
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono text-[#6B645D]">Max:</span>
                              <input
                                type="number"
                                required
                                min={1}
                                max={100}
                                value={part.max}
                                onChange={(e) => {
                                  const newParts = [...schemeParts];
                                  newParts[index].max = Number(e.target.value);
                                  setSchemeParts(newParts);
                                }}
                                className="w-20 px-2 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={schemeParts.length <= 1}
                              onClick={() => setSchemeParts(schemeParts.filter((_, i) => i !== index))}
                              className="p-1.5 text-[#671B24] hover:bg-[#F6EBEB] rounded cursor-pointer disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSchemeParts([...schemeParts, { name: `Part ${schemeParts.length + 1}`, max: 10 }])
                        }
                        className="mt-2 text-xs font-mono text-[#3F4E40] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Part
                      </button>
                    </div>

                    {/* Grade Boundaries Builder */}
                    <div className="pt-2 border-t border-[#F4F0E6]">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-mono uppercase text-[#47423D] font-medium">
                          Grade Boundaries (Must cover 0–100 continuously)
                        </label>
                      </div>

                      <div className="space-y-2">
                        {schemeBoundaries.map((b, index) => (
                          <div key={index} className="grid grid-cols-12 gap-1.5 items-center">
                            <input
                              type="text"
                              required
                              value={b.grade}
                              onChange={(e) => {
                                const newB = [...schemeBoundaries];
                                newB[index].grade = e.target.value;
                                setSchemeBoundaries(newB);
                              }}
                              placeholder="Grade"
                              className="col-span-2 px-2 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm font-mono text-center"
                            />
                            <div className="col-span-4 flex items-center gap-1">
                              <input
                                type="number"
                                required
                                min={0}
                                max={100}
                                value={b.min}
                                onChange={(e) => {
                                  const newB = [...schemeBoundaries];
                                  newB[index].min = Number(e.target.value);
                                  setSchemeBoundaries(newB);
                                }}
                                className="w-full px-1.5 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm font-mono text-center"
                              />
                              <span className="text-xs text-[#6B645D]">–</span>
                              <input
                                type="number"
                                required
                                min={0}
                                max={100}
                                value={b.max}
                                onChange={(e) => {
                                  const newB = [...schemeBoundaries];
                                  newB[index].max = Number(e.target.value);
                                  setSchemeBoundaries(newB);
                                }}
                                className="w-full px-1.5 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm font-mono text-center"
                              />
                            </div>
                            <input
                              type="text"
                              required
                              value={b.remark}
                              onChange={(e) => {
                                const newB = [...schemeBoundaries];
                                newB[index].remark = e.target.value;
                                setSchemeBoundaries(newB);
                              }}
                              placeholder="Remark (e.g. Excellent)"
                              className="col-span-5 px-2 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm"
                            />
                            <button
                              type="button"
                              disabled={schemeBoundaries.length <= 1}
                              onClick={() =>
                                setSchemeBoundaries(schemeBoundaries.filter((_, i) => i !== index))
                              }
                              className="col-span-1 p-1.5 text-[#671B24] hover:bg-[#F6EBEB] rounded cursor-pointer disabled:opacity-30"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setSchemeBoundaries([
                            ...schemeBoundaries,
                            { grade: "X", min: 0, max: 0, remark: "New Remark" },
                          ])
                        }
                        className="mt-2 text-xs font-mono text-[#3F4E40] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Boundary
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#671B24] hover:bg-[#52151D] cursor-pointer transition-colors mt-4 disabled:opacity-50"
                    >
                      {loading ? "Saving..." : editingSchemeId ? "Update Grading Scheme" : "Create Grading Scheme"}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 7: Student Roster */}
        {activeTab === "student-roster" && (
          <RosterManager schools={initialSchools} />
        )}

        {/* TAB 8: Payment Batches */}
        {activeTab === "payment-batches" && (
          <div className="bg-[#FFFFFF] border border-[#E9E4D9] rounded-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-4">
              <div>
                <h3 className="text-lg font-serif text-[#2C2825]">School Payment Batches</h3>
                <p className="text-xs font-mono text-[#6B645D] mt-1">
                  Record payments received from schools and confirm batches to approve PIN generation.
                </p>
              </div>
              <button
                type="button"
                onClick={loadAdminBatches}
                disabled={loadingBatches}
                className="px-3 py-1.5 bg-[#FAF8F3] hover:bg-[#F0ECE1] border border-[#D1CCC2] text-xs font-mono text-[#2C2825] rounded-sm"
              >
                {loadingBatches ? "Refreshing..." : "Refresh Batches"}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">School</th>
                    <th className="py-2.5 px-3">Term</th>
                    <th className="py-2.5 px-3">Students</th>
                    <th className="py-2.5 px-3">Amount Due</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {adminBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[#6B645D]">
                        {loadingBatches ? "Loading payment batches..." : "No payment batches found."}
                      </td>
                    </tr>
                  ) : (
                    adminBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-[#FAF8F3]">
                        <td className="py-2.5 px-3 text-[#6B645D]">
                          {new Date(b.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#2C2825]">
                          {b.school.name}
                        </td>
                        <td className="py-2.5 px-3 text-[#6B645D]">
                          Term {b.term.term_number} ({b.term.session})
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#2C2825]">
                          {b.students_count}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#2C2825]">
                          ₦{Number(b.amount_due).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3">
                          {b.status === "CONFIRMED" ? (
                            <span className="inline-flex items-center gap-1 text-[#3F4E40] font-medium bg-[#F2F6F3] px-2 py-0.5 rounded-sm border border-[#BACBBF]">
                              Confirmed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[#91660A] font-medium bg-[#FFF8E7] px-2 py-0.5 rounded-sm border border-[#F0D59A]">
                              Pending Review
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {b.status === "PENDING" ? (
                            <button
                              type="button"
                              disabled={confirmingBatchId === b.id}
                              onClick={() => handleConfirmBatch(b.id)}
                              className="px-3 py-1 bg-[#3F4E40] hover:bg-[#344035] text-white text-[11px] font-mono rounded-sm disabled:opacity-40"
                            >
                              {confirmingBatchId === b.id ? "Confirming..." : "Confirm Payment"}
                            </button>
                          ) : (
                            <span className="text-[11px] text-[#6B645D]">
                              Confirmed by {b.confirmer?.name || "Admin"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
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
