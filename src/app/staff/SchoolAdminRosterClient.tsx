"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowRightLeft,
  UserX,
  Check,
} from "lucide-react";

export interface ClassItem {
  id: string;
  name: string;
}

export interface StudentRecord {
  id: string;
  admission_number: string;
  full_name: string;
  status: "ACTIVE" | "INACTIVE" | "TRANSFERRED" | "GRADUATED" | "LEFT";
  class_id: string;
  not_in_latest_upload: boolean;
  updated_at: string;
  class: {
    id: string;
    name: string;
  } | null;
}

interface Props {
  classes: ClassItem[];
  schoolName: string;
}

export default function SchoolAdminRosterClient({ classes, schoolName }: Props) {
  const [students, setStudents] = useState<StudentRecord[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 20;

  // Filter & Search states
  const [search, setSearch] = useState<string>("");
  const [searchInput, setSearchInput] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  // Confirmation panel states
  const [rosterConfirmedAt, setRosterConfirmedAt] = useState<string | null>(null);
  const [rosterConfirmedCount, setRosterConfirmedCount] = useState<number | null>(null);
  const [changedSinceConfirmed, setChangedSinceConfirmed] = useState<boolean>(false);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState<boolean>(false);
  const [isConfirmingRoster, setIsConfirmingRoster] = useState<boolean>(false);

  // Loading & Error states
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Add Student modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addAdmissionNumber, setAddAdmissionNumber] = useState<string>("");
  const [addFullName, setAddFullName] = useState<string>("");
  const [addClassId, setAddClassId] = useState<string>(classes[0]?.id || "");
  const [addLoading, setAddLoading] = useState<boolean>(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Student modal states
  const [editingStudent, setEditingStudent] = useState<StudentRecord | null>(null);
  const [editFullName, setEditFullName] = useState<string>("");
  const [editClassId, setEditClassId] = useState<string>("");
  const [editStatus, setEditStatus] = useState<StudentRecord["status"]>("ACTIVE");
  const [editLoading, setEditLoading] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Quick action in-flight state
  const [actionInProgressId, setActionInProgressId] = useState<string | null>(null);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    if (search.trim()) params.set("search", search.trim());
    if (selectedClassId) params.set("classId", selectedClassId);
    if (selectedStatus) params.set("status", selectedStatus);

    try {
      const res = await fetch(`/api/staff/students?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to load students.");
      }

      setStudents(data.students || []);
      setTotal(data.total || 0);
      setRosterConfirmedAt(data.roster_confirmed_at);
      setRosterConfirmedCount(data.roster_confirmed_count);
      setChangedSinceConfirmed(Boolean(data.changed_since_confirmed));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error loading students";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedClassId, selectedStatus]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  }

  function handleResetFilters() {
    setSearchInput("");
    setSearch("");
    setSelectedClassId("");
    setSelectedStatus("");
    setPage(1);
  }

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    if (!addAdmissionNumber.trim()) {
      setAddError("Admission number is required.");
      return;
    }
    if (!addFullName.trim()) {
      setAddError("Full name is required.");
      return;
    }
    if (!addClassId) {
      setAddError("Please select a class.");
      return;
    }

    setAddLoading(true);
    try {
      const res = await fetch("/api/staff/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          admissionNumber: addAdmissionNumber.trim(),
          fullName: addFullName.trim(),
          classId: addClassId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to add student.");
      }

      setSuccessMessage(`Student ${data.full_name} (${data.admission_number}) added successfully.`);
      setIsAddModalOpen(false);
      setAddAdmissionNumber("");
      setAddFullName("");
      fetchStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error creating student";
      setAddError(msg);
    } finally {
      setAddLoading(false);
    }
  }

  function openEditModal(student: StudentRecord) {
    setEditingStudent(student);
    setEditFullName(student.full_name);
    setEditClassId(student.class_id);
    setEditStatus(student.status);
    setEditError(null);
  }

  async function handleEditStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!editingStudent) return;
    setEditError(null);

    if (!editFullName.trim()) {
      setEditError("Full name is required.");
      return;
    }
    if (!editClassId) {
      setEditError("Class is required.");
      return;
    }

    setEditLoading(true);
    try {
      const res = await fetch(`/api/staff/students/${editingStudent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editFullName.trim(),
          classId: editClassId,
          status: editStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update student.");
      }

      setSuccessMessage(`Student ${data.admission_number} updated successfully.`);
      setEditingStudent(null);
      fetchStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error updating student";
      setEditError(msg);
    } finally {
      setEditLoading(false);
    }
  }

  async function handleQuickStatusChange(
    studentId: string,
    newStatus: "TRANSFERRED" | "LEFT",
    studentName: string,
  ) {
    setActionInProgressId(studentId);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/staff/students/${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update status.");
      }

      setSuccessMessage(`Student ${studentName} marked as ${newStatus}.`);
      fetchStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update student status";
      setError(msg);
    } finally {
      setActionInProgressId(null);
    }
  }

  async function handleConfirmRoster() {
    setIsConfirmingRoster(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch("/api/staff/roster/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to confirm roster.");
      }

      setRosterConfirmedAt(data.roster_confirmed_at);
      setRosterConfirmedCount(data.roster_confirmed_count);
      setChangedSinceConfirmed(false);
      setIsConfirmDialogOpen(false);
      setSuccessMessage(
        `Roster confirmed with ${data.roster_confirmed_count} active students.`,
      );
      fetchStudents();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to confirm roster";
      setError(msg);
      setIsConfirmDialogOpen(false);
    } finally {
      setIsConfirmingRoster(false);
    }
  }

  function formatDisplayDate(val: string | null): string {
    if (!val) return "";
    const d = new Date(val);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Active count across the school
  const activeStudentsInCurrentView = students.filter((s) => s.status === "ACTIVE").length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* 1. Roster Confirmation Panel */}
      <div className="bg-white border border-[#E9E4D9] p-5 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded bg-[#FAF8F3] border border-[#E9E4D9] flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-4 h-4 text-[#3F4E40]" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B645D] block">
              Official Roster Confirmation Status
            </span>

            {/* Requirement 3: Exact plain-text strings */}
            {!rosterConfirmedAt && (
              <p className="text-sm font-semibold text-[#6B645D] mt-0.5">
                Roster not confirmed yet
              </p>
            )}

            {rosterConfirmedAt && !changedSinceConfirmed && (
              <p className="text-sm font-semibold text-[#3F4E40] mt-0.5">
                Roster confirmed ({rosterConfirmedCount} students on {formatDisplayDate(rosterConfirmedAt)})
              </p>
            )}

            {rosterConfirmedAt && changedSinceConfirmed && (
              <p className="text-sm font-semibold text-[#8C6D1F] mt-0.5">
                Roster changed since confirmed (now {total}, was {rosterConfirmedCount})
              </p>
            )}

            <p className="text-[11px] text-[#6B645D] mt-1 font-mono">
              Confirming locks the student count for official result processing and verification.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsConfirmDialogOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono transition-colors rounded-sm cursor-pointer shrink-0"
        >
          <Check className="w-3.5 h-3.5" />
          Confirm Roster
        </button>
      </div>

      {/* Global Notifications */}
      {successMessage && (
        <div className="p-3 bg-[#EDF5ED] border border-[#D3E4D3] text-[#3F4E40] text-xs flex items-center justify-between rounded-sm font-mono">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#3F4E40] shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-[#6B645D] hover:text-[#2C2825]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FDF2F2] border border-[#F5C2C2] text-[#671B24] text-xs flex items-center justify-between rounded-sm font-mono">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-[#671B24] shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-[#6B645D] hover:text-[#671B24]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Search, Filters & Action Bar */}
      <div className="bg-white border border-[#E9E4D9] p-4 rounded-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#6B645D]" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name or admission number..."
                className="w-full bg-[#FAF8F3] border border-[#D5CFC4] pl-9 pr-3 py-2 text-xs text-[#2C2825] rounded-sm focus:outline-none focus:border-[#3F4E40] transition-colors"
              />
            </div>
            <button
              type="submit"
              className="px-3.5 py-2 bg-[#3F4E40] text-white text-xs font-mono hover:bg-[#2C382D] transition-colors rounded-sm cursor-pointer"
            >
              Search
            </button>
          </form>

          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono transition-colors rounded-sm cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Student
          </button>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#E9E4D9] text-xs">
          <div className="flex items-center gap-1.5 text-[#6B645D] font-mono text-[11px]">
            <Filter className="w-3 h-3" />
            <span>Filters:</span>
          </div>

          <select
            value={selectedClassId}
            onChange={(e) => {
              setSelectedClassId(e.target.value);
              setPage(1);
            }}
            className="bg-[#FAF8F3] border border-[#D5CFC4] px-2.5 py-1.5 text-xs text-[#2C2825] rounded-sm focus:outline-none focus:border-[#3F4E40]"
          >
            <option value="">All Classes ({classes.length})</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="bg-[#FAF8F3] border border-[#D5CFC4] px-2.5 py-1.5 text-xs text-[#2C2825] rounded-sm focus:outline-none focus:border-[#3F4E40]"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="TRANSFERRED">TRANSFERRED</option>
            <option value="LEFT">LEFT</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="GRADUATED">GRADUATED</option>
          </select>

          {(search || selectedClassId || selectedStatus) && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-[11px] font-mono text-[#671B24] hover:underline cursor-pointer"
            >
              Reset Filters
            </button>
          )}

          <span className="ml-auto text-[11px] font-mono text-[#6B645D]">
            Total: {total} student(s)
          </span>
        </div>
      </div>

      {/* 3. Paginated Students Table */}
      <div className="bg-white border border-[#E9E4D9] rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D] font-mono text-[11px]">
                <th className="py-2.5 px-4 font-medium">Admission No.</th>
                <th className="py-2.5 px-4 font-medium">Full Name</th>
                <th className="py-2.5 px-4 font-medium">Class</th>
                <th className="py-2.5 px-4 font-medium">Status</th>
                <th className="py-2.5 px-4 font-medium">Upload Flag</th>
                <th className="py-2.5 px-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F0E6]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs font-mono text-[#6B645D]">
                    Loading student roster...
                  </td>
                </tr>
              ) : students.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs font-mono text-[#6B645D]">
                    No students found matching your filters.
                  </td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FAF8F3]">
                    <td className="py-3 px-4 font-mono font-semibold text-[#2C2825]">
                      {s.admission_number}
                    </td>
                    <td className="py-3 px-4 font-medium text-[#2C2825]">{s.full_name}</td>
                    <td className="py-3 px-4 font-mono text-[#47423D]">
                      {s.class?.name || "Unassigned"}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase ${
                          s.status === "ACTIVE"
                            ? "bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]"
                            : s.status === "TRANSFERRED"
                            ? "bg-[#E8EFF8] text-[#2B4C7E] border border-[#D2E0F2]"
                            : s.status === "LEFT"
                            ? "bg-[#FDF2F2] text-[#671B24] border border-[#F5C2C2]"
                            : "bg-[#F2EFE9] text-[#6B645D] border border-[#E2DDD3]"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {s.not_in_latest_upload ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono bg-[#FFFBF0] text-[#8C6D1F] border border-[#F0E6C8]">
                          not in latest upload
                        </span>
                      ) : (
                        <span className="text-[#6B645D] font-mono text-[10px]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(s)}
                          className="p-1 text-[#6B645D] hover:text-[#3F4E40] transition-colors rounded hover:bg-[#E9E4D9] cursor-pointer"
                          title="Edit student details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>

                        {s.status !== "TRANSFERRED" && (
                          <button
                            type="button"
                            disabled={actionInProgressId === s.id}
                            onClick={() =>
                              handleQuickStatusChange(s.id, "TRANSFERRED", s.full_name)
                            }
                            className="px-2 py-0.5 text-[10px] font-mono border border-[#D2E0F2] bg-[#FAF8F3] text-[#2B4C7E] hover:bg-[#2B4C7E] hover:text-white transition-colors rounded cursor-pointer disabled:opacity-40"
                            title="Mark student as transferred"
                          >
                            Transferred
                          </button>
                        )}

                        {s.status !== "LEFT" && (
                          <button
                            type="button"
                            disabled={actionInProgressId === s.id}
                            onClick={() => handleQuickStatusChange(s.id, "LEFT", s.full_name)}
                            className="px-2 py-0.5 text-[10px] font-mono border border-[#F5C2C2] bg-[#FAF8F3] text-[#671B24] hover:bg-[#671B24] hover:text-white transition-colors rounded cursor-pointer disabled:opacity-40"
                            title="Mark student as left"
                          >
                            Left
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="bg-[#FAF8F3] border-t border-[#E9E4D9] px-4 py-3 flex items-center justify-between text-xs text-[#6B645D] font-mono">
            <span>
              Page {page} of {totalPages} ({total} total students)
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1 rounded hover:bg-[#E9E4D9] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2">{page}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1 rounded hover:bg-[#E9E4D9] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Add Student Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9E4D9] max-w-md w-full p-6 rounded-sm space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-3">
              <h3 className="font-serif text-base font-bold text-[#2C2825]">
                Add Student to {schoolName}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#6B645D] hover:text-[#2C2825]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-2.5 bg-[#FDF2F2] border border-[#F5C2C2] text-[#671B24] text-xs rounded-sm font-mono">
                {addError}
              </div>
            )}

            <form onSubmit={handleAddStudent} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Admission Number <span className="text-[#671B24]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addAdmissionNumber}
                  onChange={(e) => setAddAdmissionNumber(e.target.value)}
                  placeholder="e.g. 2026/0145"
                  className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Full Name <span className="text-[#671B24]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  placeholder="e.g. Amina Mohammed"
                  className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Class Assignment <span className="text-[#671B24]">*</span>
                </label>
                <select
                  required
                  value={addClassId}
                  onChange={(e) => setAddClassId(e.target.value)}
                  className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-[#3F4E40]"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E9E4D9]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  disabled={addLoading}
                  className="px-3.5 py-1.5 text-xs font-mono text-[#6B645D] hover:text-[#2C2825]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="px-4 py-1.5 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono rounded-sm transition-colors disabled:opacity-50"
                >
                  {addLoading ? "Saving..." : "Add Student"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9E4D9] max-w-md w-full p-6 rounded-sm space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-3">
              <h3 className="font-serif text-base font-bold text-[#2C2825]">Edit Student</h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-[#6B645D] hover:text-[#2C2825]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editError && (
              <div className="p-2.5 bg-[#FDF2F2] border border-[#F5C2C2] text-[#671B24] text-xs rounded-sm font-mono">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditStudent} className="space-y-3.5 text-xs">
              {/* Requirement 2: Admission number is read-only */}
              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Admission Number (Read-Only)
                </label>
                <input
                  type="text"
                  disabled
                  readOnly
                  value={editingStudent.admission_number}
                  className="w-full bg-[#EFECE6] border border-[#D5CFC4] px-3 py-2 text-xs font-mono text-[#6B645D] rounded-sm cursor-not-allowed"
                />
                <span className="text-[10px] text-[#6B645D] font-mono mt-0.5 block">
                  Admission number cannot be changed once assigned.
                </span>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Full Name <span className="text-[#671B24]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Class <span className="text-[#671B24]">*</span>
                </label>
                <select
                  required
                  value={editClassId}
                  onChange={(e) => setEditClassId(e.target.value)}
                  className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-[#3F4E40]"
                >
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-[#6B645D] mb-1">
                  Enrollment Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as StudentRecord["status"])}
                  className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3 py-2 text-xs rounded-sm focus:outline-none focus:border-[#3F4E40]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="TRANSFERRED">TRANSFERRED</option>
                  <option value="LEFT">LEFT</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="GRADUATED">GRADUATED</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E9E4D9]">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  disabled={editLoading}
                  className="px-3.5 py-1.5 text-xs font-mono text-[#6B645D] hover:text-[#2C2825]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-4 py-1.5 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono rounded-sm transition-colors disabled:opacity-50"
                >
                  {editLoading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Confirm Roster Modal */}
      {isConfirmDialogOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9E4D9] max-w-sm w-full p-6 rounded-sm space-y-4 shadow-lg">
            <div className="border-b border-[#E9E4D9] pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#3F4E40] block">
                Official Certification
              </span>
              <h3 className="font-serif text-base font-bold text-[#2C2825] mt-0.5">
                Confirm Student Roster
              </h3>
            </div>

            <p className="text-xs text-[#2C2825] leading-relaxed">
              Are you sure you want to confirm the official student roster for{" "}
              <strong>{schoolName}</strong> with <strong>{total}</strong> active students?
            </p>

            <p className="text-[11px] font-mono text-[#6B645D]">
              This timestamp and count will be certified for all subsequent term reporting and card generation.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E4D9]">
              <button
                type="button"
                onClick={() => setIsConfirmDialogOpen(false)}
                disabled={isConfirmingRoster}
                className="px-3 py-1.5 text-xs font-mono text-[#6B645D] hover:text-[#2C2825]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRoster}
                disabled={isConfirmingRoster}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono rounded-sm transition-colors disabled:opacity-50"
              >
                {isConfirmingRoster ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Confirm Roster
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
