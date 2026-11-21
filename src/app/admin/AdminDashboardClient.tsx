"use client";

import { useState, useEffect, useCallback } from "react";
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
  Users,
  RefreshCw,
  Layers,
  Edit2
} from "lucide-react";
import RosterManager from "./RosterManager";
import SharesTabClient from "./SharesTabClient";
import AuditLogViewer from "@/components/AuditLogViewer";
import WaitlistAdminTab from "./WaitlistAdminTab";

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
    department?: { id: string; name: string } | null;
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

export interface AdminBatchData {
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
}

interface Props {
  adminName: string;
  adminEmail: string;
  initialSchools: SchoolData[];
  initialTeachers: TeacherData[];
  initialBatches?: AdminBatchData[];
}

export default function AdminDashboardClient({
  adminName,
  adminEmail,
  initialSchools,
  initialTeachers,
  initialBatches = [],
}: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"schools" | "create-school" | "create-admin" | "create-teacher" | "assign-teacher" | "departments" | "grading-schemes" | "student-roster" | "payments-and-shares" | "waitlist" | "audit-logs">("schools");



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
  const [adminPasswordInput, setAdminPasswordInput] = useState("");

  const [teacherSchoolId, setTeacherSchoolId] = useState("");
  const [teacherFullName, setTeacherFullName] = useState("");
  const [teacherEmailInput, setTeacherEmailInput] = useState("");
  const [teacherPasswordInput, setTeacherPasswordInput] = useState("");

  const [assignSchoolId, setAssignSchoolId] = useState("");
  const [assignTeacherId, setAssignTeacherId] = useState("");
  const [assignClassId, setAssignClassId] = useState("");
  const [assignSubjectId, setAssignSubjectId] = useState("");
  const [assignAllDepartments, setAssignAllDepartments] = useState(true);
  const [assignDepartmentIds, setAssignDepartmentIds] = useState<string[]>([]);
  const [schoolDepartments, setSchoolDepartments] = useState<any[]>([]);
  const [loadingSchoolDepartments, setLoadingSchoolDepartments] = useState(false);

  // Departments tab state
  const [deptSchoolId, setDeptSchoolId] = useState<string>("");
  const [deptList, setDeptList] = useState<any[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [newDeptName, setNewDeptName] = useState("");
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editDeptName, setEditDeptName] = useState("");
  const [editDeptSubjects, setEditDeptSubjects] = useState<string[]>([]);
  const [editDeptArchived, setEditDeptArchived] = useState(false);

  // Student Department assign state
  const [studentSearchAdm, setStudentSearchAdm] = useState("");
  const [searchedStudent, setSearchedStudent] = useState<any | null>(null);
  const [searchingStudent, setSearchingStudent] = useState(false);
  const [assignStudentDeptId, setAssignStudentDeptId] = useState("");

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
          ...(adminPasswordInput.trim() ? { password: adminPasswordInput.trim() } : {}),
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
      setAdminPasswordInput("");
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
          ...(teacherPasswordInput.trim() ? { password: teacherPasswordInput.trim() } : {}),
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
      setTeacherPasswordInput("");
      router.refresh();
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Fetch departments for a school
  const fetchDepartmentsForSchool = async (schoolId: string) => {
    if (!schoolId) {
      setDeptList([]);
      return;
    }
    setLoadingDepts(true);
    try {
      const res = await fetch(`/api/admin/departments?schoolId=${schoolId}`);
      if (!res.ok) throw new Error("Failed to load departments.");
      const data = await res.json();
      setDeptList(data.departments || []);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoadingDepts(false);
    }
  };

  const handleSelectDeptSchool = (schoolId: string) => {
    setDeptSchoolId(schoolId);
    setEditingDeptId(null);
    setSearchedStudent(null);
    fetchDepartmentsForSchool(schoolId);
  };

  // Fetch departments for assignment screen
  const fetchAssignSchoolDepartments = async (schoolId: string) => {
    if (!schoolId) {
      setSchoolDepartments([]);
      return;
    }
    setLoadingSchoolDepartments(true);
    try {
      const res = await fetch(`/api/admin/departments?schoolId=${schoolId}`);
      if (res.ok) {
        const data = await res.json();
        setSchoolDepartments(data.departments || []);
      }
    } finally {
      setLoadingSchoolDepartments(false);
    }
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptSchoolId || !newDeptName.trim()) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: deptSchoolId,
          name: newDeptName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create department.");
      setMessage({ text: `Department "${data.department.name}" created successfully.`, type: "success" });
      setNewDeptName("");
      fetchDepartmentsForSchool(deptSchoolId);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDepartment = async (deptId: string) => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/departments/${deptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editDeptName.trim() || undefined,
          subject_ids: editDeptSubjects,
          is_archived: editDeptArchived,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update department.");
      setMessage({ text: "Department updated successfully.", type: "success" });
      setEditingDeptId(null);
      fetchDepartmentsForSchool(deptSchoolId);
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Search student for department assignment
  const handleSearchStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptSchoolId || !studentSearchAdm.trim()) return;
    setSearchingStudent(true);
    setSearchedStudent(null);
    try {
      const res = await fetch(`/api/staff/students?search=${encodeURIComponent(studentSearchAdm.trim())}`);
      const data = await res.json();
      const match = (data.students || []).find((s: any) =>
        s.admission_number.toLowerCase() === studentSearchAdm.trim().toLowerCase()
      );
      if (match) {
        setSearchedStudent(match);
        setAssignStudentDeptId(match.department_id || "");
      } else {
        setMessage({ text: `No student found with admission number "${studentSearchAdm}".`, type: "error" });
      }
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : "Search error", type: "error" });
    } finally {
      setSearchingStudent(false);
    }
  };

  const handleAssignStudentDept = async () => {
    if (!searchedStudent) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/students/${searchedStudent.id}/department`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: assignStudentDeptId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update student department.");
      setMessage({ text: "Student department updated successfully.", type: "success" });
      setSearchedStudent({
        ...searchedStudent,
        department_id: assignStudentDeptId || null,
        department: deptList.find((d: any) => d.id === assignStudentDeptId) || null,
      });
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

    // Client-side verification: reject subject if chosen department does not offer it
    if (!assignAllDepartments && assignDepartmentIds.length > 0) {
      for (const deptId of assignDepartmentIds) {
        const dept = schoolDepartments.find((d) => d.id === deptId);
        if (dept) {
          const offeredSubjIds = new Set((dept.departmentSubjects || []).map((ds: any) => ds.subject_id || ds.subject?.id));
          if (!offeredSubjIds.has(assignSubjectId)) {
            setLoading(false);
            setMessage({
              text: `Subject is not offered by department "${dept.name}". Please select an offered subject or update department offerings.`,
              type: "error",
            });
            return;
          }
        }
      }
    }

    try {
      const res = await fetch("/api/admin/teachers/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: assignSchoolId,
          teacher_id: assignTeacherId,
          class_id: assignClassId,
          subject_id: assignSubjectId,
          all_departments: assignAllDepartments,
          department_ids: assignAllDepartments ? undefined : assignDepartmentIds,
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
                setActiveTab("departments");
                setMessage(null);
                if (initialSchools.length > 0 && !deptSchoolId) {
                  handleSelectDeptSchool(initialSchools[0].id);
                }
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "departments"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              Departments
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
                setActiveTab("payments-and-shares");
                setMessage(null);
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-all active:scale-95 border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "payments-and-shares"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              <span>Payments & Shares</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("waitlist");
                setMessage(null);
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
                activeTab === "waitlist"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              <span>Waitlist</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("audit-logs");
                setMessage(null);
              }}
              className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
                activeTab === "audit-logs"
                  ? "border-[#671B24] text-[#671B24]"
                  : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
              }`}
            >
              Audit Logs
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
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]"
                                  >
                                    <span>
                                      {a.class.name}: {a.subject.name}
                                      {a.department ? ` (${a.department.name})` : " (All depts)"}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!confirm(`Remove assignment ${a.class.name} - ${a.subject.name}?`)) return;
                                        try {
                                          const res = await fetch(`/api/admin/teachers/assignments/${a.id}`, {
                                            method: "DELETE",
                                          });
                                          if (!res.ok) {
                                            const data = await res.json().catch(() => ({}));
                                            throw new Error(data.error || "Failed to remove assignment.");
                                          }
                                          setMessage({ text: "Assignment removed successfully.", type: "success" });
                                          router.refresh();
                                        } catch (err: unknown) {
                                          setMessage({ text: err instanceof Error ? err.message : "Error", type: "error" });
                                        }
                                      }}
                                      title="Remove assignment"
                                      className="text-[#671B24] hover:text-[#52151D] cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
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

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Initial Password <span className="text-[#8C827A] normal-case">(Optional - leave blank to auto-generate)</span>
                </label>
                <input
                  type="password"
                  placeholder="Auto-generated temporary password if blank"
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  minLength={6}
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

              <div>
                <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                  Initial Password <span className="text-[#8C827A] normal-case">(Optional - leave blank to auto-generate)</span>
                </label>
                <input
                  type="password"
                  placeholder="Auto-generated temporary password if blank"
                  value={teacherPasswordInput}
                  onChange={(e) => setTeacherPasswordInput(e.target.value)}
                  minLength={6}
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
                    const sid = e.target.value;
                    setAssignSchoolId(sid);
                    setAssignTeacherId("");
                    setAssignClassId("");
                    setAssignSubjectId("");
                    setAssignDepartmentIds([]);
                    fetchAssignSchoolDepartments(sid);
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

                  {/* Department scoping */}
                  <div className="border border-[#E9E4D9] bg-[#FAF8F3] p-3 rounded-sm space-y-2">
                    <span className="block text-xs font-mono uppercase text-[#47423D] font-medium">
                      Department Assignment Scope
                    </span>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[#2C2825]">
                      <input
                        type="checkbox"
                        checked={assignAllDepartments}
                        onChange={(e) => {
                          setAssignAllDepartments(e.target.checked);
                          if (e.target.checked) setAssignDepartmentIds([]);
                        }}
                        className="rounded border-[#D5CFC4] text-[#3F4E40]"
                      />
                      <span className="font-medium">All Departments (Covers all students whose dept offers the subject + students with no department)</span>
                    </label>

                    {!assignAllDepartments && (
                      <div className="pl-5 pt-1 space-y-1.5 border-t border-[#E9E4D9] mt-2">
                        <span className="text-[11px] text-[#6B645D] block">
                          Tick one or more departments (one assignment line will be created per department):
                        </span>
                        {loadingSchoolDepartments ? (
                          <span className="text-xs font-mono text-[#6B645D]">Loading school departments...</span>
                        ) : schoolDepartments.filter((d) => !d.is_archived).length === 0 ? (
                          <span className="text-xs text-[#6B645D] italic">No active departments found. Create departments under the Departments tab first.</span>
                        ) : (
                          schoolDepartments.filter((d) => !d.is_archived).map((dept) => {
                            const offersSubject = (dept.departmentSubjects || []).some(
                              (ds: any) => (ds.subject_id || ds.subject?.id) === assignSubjectId
                            );
                            return (
                              <label key={dept.id} className="flex items-center gap-2 cursor-pointer text-xs text-[#2C2825]">
                                <input
                                  type="checkbox"
                                  checked={assignDepartmentIds.includes(dept.id)}
                                  disabled={assignSubjectId ? !offersSubject : false}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setAssignDepartmentIds([...assignDepartmentIds, dept.id]);
                                    } else {
                                      setAssignDepartmentIds(assignDepartmentIds.filter((id) => id !== dept.id));
                                    }
                                  }}
                                  className="rounded border-[#D5CFC4] text-[#3F4E40] disabled:opacity-40"
                                />
                                <span className={!offersSubject && assignSubjectId ? "text-[#8C827A] line-through" : ""}>
                                  {dept.name}
                                </span>
                                {assignSubjectId && !offersSubject && (
                                  <span className="text-[10px] text-[#A33D29] font-mono">(Does not offer subject)</span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
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

        {/* TAB: Departments Management */}
        {activeTab === "departments" && (
          <div className="space-y-8">
            <div className="border border-[#E9E4D9] bg-[#FFFFFF] p-5 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#671B24]" /> Manage School Departments & Offered Subjects
                </span>
                <p className="text-xs text-[#6B645D] mt-1">
                  Create departments (e.g. Science, Arts, Commercial) and tick the subjects each department offers.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-mono text-[#47423D]">School:</label>
                <select
                  value={deptSchoolId}
                  onChange={(e) => handleSelectDeptSchool(e.target.value)}
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

            {deptSchoolId && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left: Department List & Subjects */}
                <div className="space-y-4">
                  <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
                    <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                        Departments ({deptList.length})
                      </span>
                      <span className="text-[11px] font-mono text-[#6B645D]">Archived departments cannot be deleted</span>
                    </div>

                    <div className="p-5 space-y-4">
                      {loadingDepts ? (
                        <p className="text-xs font-mono text-[#6B645D]">Loading departments...</p>
                      ) : deptList.length === 0 ? (
                        <p className="text-xs text-[#6B645D] italic">
                          No departments created for this school yet. Use the form below to create one.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {deptList.map((d: any) => {
                            const isEditing = editingDeptId === d.id;
                            const currentSchool = initialSchools.find((s) => s.id === deptSchoolId);
                            const offeredSubjects = (d.departmentSubjects || []).map((ds: any) => ds.subject);

                            return (
                              <div
                                key={d.id}
                                className={`p-4 border rounded-sm transition-all ${
                                  d.is_archived
                                    ? "bg-[#F7F5F0] border-[#E2DDD3] opacity-75"
                                    : "bg-white border-[#E9E4D9]"
                                }`}
                              >
                                {isEditing ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                      <input
                                        type="text"
                                        value={editDeptName}
                                        onChange={(e) => setEditDeptName(e.target.value)}
                                        className="text-sm font-semibold px-2 py-1 border border-[#D9D3C7] rounded bg-[#FAF8F3] text-[#2C2825]"
                                      />
                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          disabled={loading}
                                          onClick={() => handleUpdateDepartment(d.id)}
                                          className="px-2.5 py-1 text-xs font-mono bg-[#3F4E40] text-white rounded cursor-pointer hover:bg-[#2C382D]"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setEditingDeptId(null)}
                                          className="px-2.5 py-1 text-xs font-mono text-[#6B645D] hover:text-[#2C2825]"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>

                                    <div>
                                      <span className="text-xs font-mono uppercase text-[#47423D] block mb-1">
                                        Tick Offered Subjects:
                                      </span>
                                      <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-2 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm">
                                        {(currentSchool?.subjects || []).map((subj: any) => (
                                          <label key={subj.id} className="flex items-center gap-1.5 text-xs cursor-pointer text-[#2C2825]">
                                            <input
                                              type="checkbox"
                                              checked={editDeptSubjects.includes(subj.id)}
                                              onChange={(e) => {
                                                if (e.target.checked) {
                                                  setEditDeptSubjects([...editDeptSubjects, subj.id]);
                                                } else {
                                                  setEditDeptSubjects(editDeptSubjects.filter((id) => id !== subj.id));
                                                }
                                              }}
                                              className="rounded border-[#D5CFC4] text-[#3F4E40]"
                                            />
                                            <span className="truncate">{subj.name}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[#2C2825]">
                                      <input
                                        type="checkbox"
                                        checked={editDeptArchived}
                                        onChange={(e) => setEditDeptArchived(e.target.checked)}
                                        className="rounded border-[#D5CFC4] text-[#671B24]"
                                      />
                                      <span>Archive department (departments are archived, never deleted)</span>
                                    </label>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-[#2C2825]">{d.name}</span>
                                        {d.is_archived && (
                                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#E9E4D9] text-[#6B645D]">
                                            Archived
                                          </span>
                                        )}
                                        <span className="text-[11px] font-mono text-[#6B645D]">
                                          ({d._count?.students || 0} students)
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingDeptId(d.id);
                                          setEditDeptName(d.name);
                                          setEditDeptSubjects((d.departmentSubjects || []).map((ds: any) => ds.subject_id || ds.subject?.id));
                                          setEditDeptArchived(d.is_archived);
                                        }}
                                        className="text-xs font-mono text-[#671B24] hover:underline flex items-center gap-1 cursor-pointer"
                                      >
                                        <Edit2 className="w-3 h-3" /> Edit & Subjects
                                      </button>
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {offeredSubjects.length === 0 ? (
                                        <span className="text-[11px] text-[#A33D29] italic">No subjects offered yet</span>
                                      ) : (
                                        offeredSubjects.map((s: any) => (
                                          <span
                                            key={s.id}
                                            className="px-1.5 py-0.5 text-[10px] font-mono bg-[#E8EFF8] text-[#2B4C7E] rounded border border-[#D2E0F2]"
                                          >
                                            {s.name}
                                          </span>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Create New Department Form */}
                      <form onSubmit={handleCreateDepartment} className="pt-3 border-t border-[#E9E4D9] space-y-3">
                        <span className="text-xs font-mono uppercase font-semibold text-[#47423D] block">
                          + Add New Department
                        </span>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            required
                            placeholder="e.g. Science, Arts, Commercial"
                            value={newDeptName}
                            onChange={(e) => setNewDeptName(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                          />
                          <button
                            type="submit"
                            disabled={loading || !newDeptName.trim()}
                            className="px-4 py-1.5 bg-[#671B24] text-white text-xs font-mono rounded-sm hover:bg-[#52151D] disabled:opacity-50 cursor-pointer"
                          >
                            Create
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Right: Assign Student Department Record */}
                <div className="space-y-4">
                  <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm p-5 space-y-4">
                    <div className="border-b border-[#E9E4D9] pb-3">
                      <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D] block">
                        Assign Student Department
                      </span>
                      <p className="text-xs text-[#6B645D] mt-1">
                        Look up any student by admission number to assign or update their department record.
                      </p>
                    </div>

                    <form onSubmit={handleSearchStudent} className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Student Admission Number (e.g. ADM001)"
                        value={studentSearchAdm}
                        onChange={(e) => setStudentSearchAdm(e.target.value)}
                        className="flex-1 px-3 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] font-mono"
                      />
                      <button
                        type="submit"
                        disabled={searchingStudent || !studentSearchAdm.trim()}
                        className="px-4 py-1.5 bg-[#3F4E40] text-white text-xs font-mono rounded-sm hover:bg-[#2C382D] disabled:opacity-50 cursor-pointer"
                      >
                        {searchingStudent ? "Searching..." : "Lookup"}
                      </button>
                    </form>

                    {searchedStudent && (
                      <div className="p-4 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm space-y-3 text-xs">
                        <div className="flex justify-between items-center border-b border-[#E9E4D9] pb-2">
                          <div>
                            <span className="font-semibold text-sm text-[#2C2825] block">{searchedStudent.full_name}</span>
                            <span className="font-mono text-[#6B645D] text-[11px]">{searchedStudent.admission_number} ({searchedStudent.class?.name})</span>
                          </div>
                          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#E5EDE5] text-[#3F4E40]">
                            {searchedStudent.department?.name || "No Department"}
                          </span>
                        </div>

                        <div>
                          <label className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                            Assign Department:
                          </label>
                          <select
                            value={assignStudentDeptId}
                            onChange={(e) => setAssignStudentDeptId(e.target.value)}
                            className="w-full px-3 py-2 text-xs font-mono bg-white border border-[#D9D3C7] rounded-sm text-[#2C2825]"
                          >
                            <option value="">-- No Department (All Class Subjects) --</option>
                            {deptList.filter((d: any) => !d.is_archived).map((d: any) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleAssignStudentDept}
                          className="w-full py-2 bg-[#671B24] text-white text-xs font-mono rounded-sm hover:bg-[#52151D] disabled:opacity-50 cursor-pointer"
                        >
                          {loading ? "Updating..." : "Update Student Department"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
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

        {/* TAB 8: Payments & Shares */}
        {activeTab === "payments-and-shares" && (
          <SharesTabClient schools={initialSchools} />
        )}

        {/* TAB 9: Waitlist */}
        {activeTab === "waitlist" && (
          <WaitlistAdminTab />
        )}

        {activeTab === "audit-logs" && (
          <AuditLogViewer
            portalType="admin"
            schools={initialSchools.map((s) => ({
              id: s.id,
              name: s.name,
              slug: s.slug,
            }))}
          />
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
