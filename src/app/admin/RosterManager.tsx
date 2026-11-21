"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  Upload,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldCheck,
  Check,
} from "lucide-react";

export interface SchoolData {
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

interface RawRosterRow {
  rowNumber: number;
  admission_number: string;
  full_name: string;
  class_name: string;
}

interface ValidatedRosterRow {
  rowNumber: number;
  admission_number: string;
  full_name: string;
  class_name: string;
  action: "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";
  errors: string[];
}

interface PreviewResponse {
  totalRows: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  rows: ValidatedRosterRow[];
  rawRows: RawRosterRow[];
  unknownClasses: string[];
  warnings: string[];
  hasMixedAdmissionLengths: boolean;
}

interface ImportHistoryRecord {
  id: string;
  file_name: string;
  new_count: number;
  updated_count: number;
  unchanged_count: number;
  error_count: number;
  total_count: number;
  active_student_count?: number | null;
  expected_total?: number | string | null;
  expected_share?: number | string | null;
  created_at: string;
  user: {
    name: string;
    email: string;
  } | null;
}

interface Props {
  schools: SchoolData[];
}

export default function RosterManager({ schools }: Props) {
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
    schools[0]?.id || "",
  );

  // File state (kept strictly in browser memory)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview & Processing states
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Import options
  const [skipBadRows, setSkipBadRows] = useState<boolean>(false);
  const [createMissingClasses, setCreateMissingClasses] = useState<boolean>(false);
  const [isCompleteList, setIsCompleteList] = useState<boolean>(false);

  // Import execution states
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // History state
  const [historyList, setHistoryList] = useState<ImportHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Table pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 50;

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId);

  // Load history when selected school changes
  useEffect(() => {
    if (!selectedSchoolId) return;
    loadImportHistory(selectedSchoolId);
    // Reset file and preview on school change
    clearFileSelection();
  }, [selectedSchoolId]);

  async function loadImportHistory(schoolId: string) {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const res = await fetch(`/api/admin/schools/${schoolId}/roster/history`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load import history.");
      }
      const data = await res.json();
      setHistoryList(data.imports || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error loading history";
      setHistoryError(msg);
    } finally {
      setLoadingHistory(false);
    }
  }

  function handleFileChange(file: File | null) {
    setPreviewError(null);
    setImportError(null);
    setImportSuccess(null);
    setPreviewData(null);
    setCurrentPage(1);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
      setPreviewError("Unsupported file type. Only .csv and .xlsx files are accepted.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPreviewError("File size exceeds maximum allowed size of 5 MB.");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
    generatePreview(file);
  }

  function clearFileSelection() {
    setSelectedFile(null);
    setPreviewData(null);
    setPreviewError(null);
    setImportError(null);
    setImportSuccess(null);
    setCurrentPage(1);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function generatePreview(file: File) {
    if (!selectedSchoolId) return;
    setIsPreviewing(true);
    setPreviewError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/admin/schools/${selectedSchoolId}/roster/preview`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to parse and preview roster file.");
      }

      setPreviewData(data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Server rejected the roster file.";
      setPreviewError(msg);
      setPreviewData(null);
    } finally {
      setIsPreviewing(false);
    }
  }

  function downloadErrorReportCsv() {
    if (!previewData || previewData.rows.length === 0) return;
    const errorRows = previewData.rows.filter((r) => r.errors && r.errors.length > 0);
    if (errorRows.length === 0) return;

    function escapeCell(val: string): string {
      if (!val) return "";
      const str = String(val);
      const first = str.charAt(0);
      let safe = str;
      if (first === "=" || first === "+" || first === "-" || first === "@") {
        safe = `'${str}`;
      }
      if (safe.includes(",") || safe.includes('"') || safe.includes("\n")) {
        return `"${safe.replace(/"/g, '""')}"`;
      }
      return safe;
    }

    const headers = ["Row", "Admission_Number", "Full_Name", "Class", "Errors"].map(escapeCell).join(",");
    const lines = errorRows.map((r) => {
      return [
        String(r.rowNumber),
        r.admission_number,
        r.full_name,
        r.class_name,
        r.errors.join("; "),
      ]
        .map(escapeCell)
        .join(",");
    });

    const csvContent = [headers, ...lines].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `roster-errors-${selectedSchool?.slug || "school"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function executeImport() {
    if (!previewData || !selectedSchoolId || !selectedFile) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const res = await fetch(`/api/admin/schools/${selectedSchoolId}/roster/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          rows: previewData.rawRows,
          skipBadRows,
          createMissingClasses,
          isCompleteList,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Roster import failed.");
      }

      // Success
      let summaryMsg = `Import completed successfully: ${data.newImported} new students created, ${data.updatedImported} updated, ${data.unchangedImported} unchanged.`;
      if (data.active_student_count !== undefined && data.active_student_count !== null) {
        summaryMsg += ` (${data.active_student_count} active students, total card amount ₦${Number(data.expected_total || 0).toLocaleString()}, your expected share ₦${Number(data.expected_share || 0).toLocaleString()}, school share ₦${Number(data.school_share || 0).toLocaleString()})`;
      }
      if (data.flaggedNotInUploadCount > 0) {
        summaryMsg += ` ${data.flaggedNotInUploadCount} unlisted students flagged as not in latest upload.`;
      }
      setImportSuccess(summaryMsg);

      // Clear preview and selected file so it cannot be imported twice
      clearFileSelection();
      setIsConfirmModalOpen(false);

      // Refresh history list
      loadImportHistory(selectedSchoolId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Roster import failed.";
      setImportError(msg);
      setIsConfirmModalOpen(false);
    } finally {
      setIsImporting(false);
    }
  }

  // Format date helper
  function formatRosterDate(val: string | Date | null | undefined): string {
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

  // Pagination slice
  const displayedRows = previewData
    ? previewData.rows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
    : [];
  const totalPages = previewData ? Math.ceil(previewData.rows.length / rowsPerPage) : 1;

  return (
    <div className="space-y-8">
      {/* 1. School Selector & Roster Confirmation Card */}
      <div className="bg-white border border-[#E9E4D9] p-6 rounded-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-[#6B645D] mb-1.5 font-medium">
              Target School
            </label>
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              className="w-full bg-[#FAF8F3] border border-[#D5CFC4] px-3.5 py-2.5 text-xs text-[#2C2825] rounded-sm focus:outline-none focus:border-[#3F4E40] transition-colors"
            >
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.slug})
                </option>
              ))}
            </select>
            <span className="text-[11px] text-[#6B645D] block mt-1 font-mono">
              Enrolled students: {selectedSchool?._count.students ?? 0} across {selectedSchool?.classes.length ?? 0} classes
            </span>
          </div>

          <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-4 rounded-sm">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6B645D] block mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#3F4E40]" />
              School Admin Roster Confirmation
            </span>
            {selectedSchool?.roster_confirmed_at ? (
              <div>
                <p className="text-xs text-[#2C2825] font-medium">
                  Confirmed on {formatRosterDate(selectedSchool.roster_confirmed_at)}
                </p>
                <p className="text-[11px] font-mono text-[#3F4E40] mt-0.5">
                  Count at confirmation: {selectedSchool.roster_confirmed_count ?? 0} students
                </p>
              </div>
            ) : (
              <p className="text-xs text-[#6B645D] italic">
                Roster not yet confirmed by school admin.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 2. Template Download & Instructions */}
      <div className="bg-white border border-[#E9E4D9] p-6 rounded-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-base font-semibold text-[#2C2825]">
              Upload Student Roster
            </h3>
            <p className="text-xs text-[#6B645D] mt-0.5">
              Upload the student register file provided by the school (.csv or .xlsx).
            </p>
            <p className="text-[11px] text-[#6B645D] mt-1.5 font-mono">
              Note: The admission_number column must be formatted as text in Excel to prevent leading zeros from being dropped.
            </p>
          </div>

          <a
            href={selectedSchoolId ? `/api/admin/schools/${selectedSchoolId}/roster/template` : "#"}
            className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#3F4E40] text-[#3F4E40] hover:bg-[#3F4E40] hover:text-white text-xs font-mono transition-colors rounded-sm shrink-0"
            download="roster-template.csv"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV Template
          </a>
        </div>

        {/* 3. File Upload Area */}
        <div className="mt-6">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFileChange(e.dataTransfer.files[0]);
              }
            }}
            className="border-2 border-dashed border-[#D5CFC4] bg-[#FAF8F3] hover:bg-[#F5F1E8] transition-colors p-8 rounded-sm text-center cursor-pointer relative"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, .xlsx"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            <Upload className="w-8 h-8 text-[#6B645D] mx-auto mb-2.5" />
            <p className="text-xs font-medium text-[#2C2825]">
              Click or drag and drop roster file here
            </p>
            <p className="text-[11px] text-[#6B645D] mt-1 font-mono">
              Accepts .csv and .xlsx up to 5 MB (maximum 3,000 rows)
            </p>
          </div>

          {selectedFile && (
            <div className="mt-3 flex items-center justify-between bg-[#FAF8F3] border border-[#E9E4D9] px-4 py-2.5 rounded-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#3F4E40]" />
                <span className="text-xs font-mono font-medium text-[#2C2825]">
                  {selectedFile.name}
                </span>
                <span className="text-[11px] font-mono text-[#6B645D]">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <button
                type="button"
                onClick={clearFileSelection}
                disabled={isImporting || isPreviewing}
                className="text-xs text-[#6B645D] hover:text-[#671B24] font-mono flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          )}

          {/* Server Error Message Banner */}
          {previewError && (
            <div className="mt-4 p-3 bg-[#FDF2F2] border border-[#F5C2C2] text-[#671B24] text-xs flex items-start gap-2.5 rounded-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block font-mono">Preview Failed</span>
                <span className="text-[11px]">{previewError}</span>
              </div>
            </div>
          )}

          {isPreviewing && (
            <div className="mt-4 p-4 text-center text-xs font-mono text-[#6B645D] bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm">
              Analyzing file and validating students...
            </div>
          )}
        </div>
      </div>

      {/* 4. Preview Breakdown & Warnings */}
      {previewData && (
        <div className="bg-white border border-[#E9E4D9] p-6 rounded-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E9E4D9] pb-4">
            <div>
              <h3 className="font-serif text-base font-semibold text-[#2C2825]">
                Roster Preview & Analysis
              </h3>
              <p className="text-xs text-[#6B645D] mt-0.5">
                Review verified student records and address any errors before importing.
              </p>
            </div>

            {previewData.errorCount > 0 && (
              <button
                type="button"
                onClick={downloadErrorReportCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F3] border border-[#671B24] text-[#671B24] hover:bg-[#671B24] hover:text-white text-xs font-mono transition-colors rounded-sm cursor-pointer shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download Error Report ({previewData.errorCount})
              </button>
            )}
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-3 rounded-sm">
              <span className="text-[10px] font-mono uppercase text-[#6B645D] block">
                Total Rows
              </span>
              <span className="text-xl font-serif font-bold text-[#2C2825] mt-0.5 block">
                {previewData.totalRows}
              </span>
            </div>

            <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-3 rounded-sm">
              <span className="text-[10px] font-mono uppercase text-[#3F4E40] block">
                New Students
              </span>
              <span className="text-xl font-serif font-bold text-[#3F4E40] mt-0.5 block">
                {previewData.newCount}
              </span>
            </div>

            <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-3 rounded-sm">
              <span className="text-[10px] font-mono uppercase text-[#2B4C7E] block">
                Updated Rows
              </span>
              <span className="text-xl font-serif font-bold text-[#2B4C7E] mt-0.5 block">
                {previewData.updatedCount}
              </span>
            </div>

            <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-3 rounded-sm">
              <span className="text-[10px] font-mono uppercase text-[#6B645D] block">
                Unchanged
              </span>
              <span className="text-xl font-serif font-bold text-[#6B645D] mt-0.5 block">
                {previewData.unchangedCount}
              </span>
            </div>

            <div className={`p-3 rounded-sm border ${
              previewData.errorCount > 0
                ? "bg-[#FDF2F2] border-[#F5C2C2]"
                : "bg-[#FAF8F3] border-[#E9E4D9]"
            }`}>
              <span className={`text-[10px] font-mono uppercase block ${
                previewData.errorCount > 0 ? "text-[#671B24]" : "text-[#6B645D]"
              }`}>
                Errors
              </span>
              <span className={`text-xl font-serif font-bold mt-0.5 block ${
                previewData.errorCount > 0 ? "text-[#671B24]" : "text-[#6B645D]"
              }`}>
                {previewData.errorCount}
              </span>
            </div>
          </div>

          {/* Requirement 4: Warnings shown directly above preview table, NOT collapsed */}
          <div className="space-y-2">
            {previewData.hasMixedAdmissionLengths && (
              <div className="p-3 bg-[#FFFBF0] border border-[#F0E6C8] text-[#8C6D1F] text-xs flex items-start gap-2.5 rounded-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#8C6D1F]" />
                <div>
                  <span className="font-semibold block font-mono">Mixed Admission Number Lengths</span>
                  <span className="text-[11px]">
                    Warning: Admission numbers in this file have mixed character lengths. Ensure the column is formatted as text in Excel to prevent leading zeros from being dropped.
                  </span>
                </div>
              </div>
            )}

            {previewData.unknownClasses.length > 0 && (
              <div className="p-3 bg-[#FFFBF0] border border-[#F0E6C8] text-[#8C6D1F] text-xs flex items-start gap-2.5 rounded-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#8C6D1F]" />
                <div>
                  <span className="font-semibold block font-mono">Unknown Classes Detected</span>
                  <span className="text-[11px]">
                    The following classes do not exist in {selectedSchool?.name}:{" "}
                    <strong>{previewData.unknownClasses.join(", ")}</strong>. Check &quot;Create missing classes&quot; below if you wish to auto-create them.
                  </span>
                </div>
              </div>
            )}

            {previewData.warnings && previewData.warnings
              .filter(
                (w) =>
                  !w.includes("mixed lengths") &&
                  !w.includes("Unknown classes"),
              )
              .map((w, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-[#FAF8F3] border border-[#E9E4D9] text-[#6B645D] text-xs flex items-start gap-2 rounded-sm font-mono text-[11px]"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
          </div>

          {/* Preview Table */}
          <div className="border border-[#E9E4D9] rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D] font-mono text-[11px]">
                    <th className="py-2.5 px-4 font-medium w-16">Row</th>
                    <th className="py-2.5 px-4 font-medium">Admission No.</th>
                    <th className="py-2.5 px-4 font-medium">Full Name</th>
                    <th className="py-2.5 px-4 font-medium">Class</th>
                    <th className="py-2.5 px-4 font-medium w-24">Status</th>
                    <th className="py-2.5 px-4 font-medium">Notes / Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F0E6]">
                  {displayedRows.map((r, idx) => {
                    const isError = r.action === "ERROR" || (r.errors && r.errors.length > 0);
                    return (
                      <tr
                        key={idx}
                        className={isError ? "bg-[#FFF9F9] hover:bg-[#FFF3F3]" : "hover:bg-[#FAF8F3]"}
                      >
                        <td className="py-2 px-4 font-mono text-[#6B645D]">{r.rowNumber}</td>
                        <td className="py-2 px-4 font-mono font-medium text-[#2C2825]">
                          {r.admission_number || "—"}
                        </td>
                        <td className="py-2 px-4 text-[#2C2825]">{r.full_name || "—"}</td>
                        <td className="py-2 px-4 font-mono text-[#2C2825]">{r.class_name || "—"}</td>
                        <td className="py-2 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase ${
                              r.action === "NEW"
                                ? "bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]"
                                : r.action === "UPDATE"
                                ? "bg-[#E8EFF8] text-[#2B4C7E] border border-[#D2E0F2]"
                                : r.action === "UNCHANGED"
                                ? "bg-[#F2EFE9] text-[#6B645D] border border-[#E2DDD3]"
                                : "bg-[#FDF2F2] text-[#671B24] border border-[#F5C2C2]"
                            }`}
                          >
                            {r.action}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-[11px] text-[#671B24]">
                          {r.errors && r.errors.length > 0 ? (
                            <span className="font-mono">{r.errors.join("; ")}</span>
                          ) : (
                            <span className="text-[#6B645D] font-mono text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="bg-[#FAF8F3] border-t border-[#E9E4D9] px-4 py-2.5 flex items-center justify-between text-xs text-[#6B645D] font-mono">
                <span>
                  Showing {(currentPage - 1) * rowsPerPage + 1} to{" "}
                  {Math.min(currentPage * rowsPerPage, previewData.rows.length)} of {previewData.rows.length} rows
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded hover:bg-[#E9E4D9] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded hover:bg-[#E9E4D9] disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 5. Import Options Checkboxes */}
          <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-4 rounded-sm space-y-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D] block">
              Import Configuration Options
            </span>

            <div className="space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#2C2825]">
                <input
                  type="checkbox"
                  checked={skipBadRows}
                  onChange={(e) => setSkipBadRows(e.target.checked)}
                  className="mt-0.5 rounded border-[#D5CFC4] text-[#3F4E40] focus:ring-[#3F4E40]"
                />
                <div>
                  <span className="font-medium block">Skip rows with errors</span>
                  <span className="text-[11px] text-[#6B645D]">
                    Proceed with importing valid rows even if some rows contain validation errors.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#2C2825]">
                <input
                  type="checkbox"
                  checked={createMissingClasses}
                  onChange={(e) => setCreateMissingClasses(e.target.checked)}
                  className="mt-0.5 rounded border-[#D5CFC4] text-[#3F4E40] focus:ring-[#3F4E40]"
                />
                <div>
                  <span className="font-medium block">Create missing classes</span>
                  <span className="text-[11px] text-[#6B645D]">
                    Automatically register any class names present in this file that do not currently exist in the school.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#2C2825]">
                <input
                  type="checkbox"
                  checked={isCompleteList}
                  onChange={(e) => setIsCompleteList(e.target.checked)}
                  className="mt-0.5 rounded border-[#D5CFC4] text-[#3F4E40] focus:ring-[#3F4E40]"
                />
                <div>
                  <span className="font-medium block">This file is the complete student list</span>
                  <span className="text-[11px] text-[#6B645D]">
                    Students in this school who are not in this upload will be marked as not in latest upload. Use this when uploading a school-wide register at the start of a term.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Server Error / Success on Import */}
          {importError && (
            <div className="p-3 bg-[#FDF2F2] border border-[#F5C2C2] text-[#671B24] text-xs flex items-start gap-2.5 rounded-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block font-mono">Import Rejected</span>
                <span className="text-[11px]">{importError}</span>
              </div>
            </div>
          )}

          {/* 6. Confirm and Import Action Button */}
          <div className="flex items-center justify-between border-t border-[#E9E4D9] pt-4">
            <span className="text-xs font-mono text-[#6B645D]">
              {previewData.newCount + previewData.updatedCount + previewData.unchangedCount} row(s) ready to import
            </span>

            <button
              type="button"
              onClick={() => setIsConfirmModalOpen(true)}
              disabled={
                isImporting ||
                isPreviewing ||
                (!skipBadRows && previewData.errorCount > 0) ||
                (!createMissingClasses && previewData.unknownClasses.length > 0)
              }
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono transition-colors rounded-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              Confirm and Import Roster
            </button>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {importSuccess && (
        <div className="p-4 bg-[#EDF5ED] border border-[#D3E4D3] text-[#3F4E40] text-xs flex items-start gap-2.5 rounded-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#3F4E40]" />
          <div>
            <span className="font-semibold block font-mono">Import Completed</span>
            <span className="text-[11px]">{importSuccess}</span>
          </div>
        </div>
      )}

      {/* 6. Confirmation Modal */}
      {isConfirmModalOpen && previewData && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white border border-[#E9E4D9] max-w-lg w-full p-6 rounded-sm space-y-5 shadow-lg">
            <div className="border-b border-[#E9E4D9] pb-3">
              <span className="text-xs font-mono uppercase tracking-wider text-[#3F4E40] block">
                Execute Transaction
              </span>
              <h3 className="font-serif text-lg font-bold text-[#2C2825] mt-0.5">
                Confirm Roster Import for {selectedSchool?.name}
              </h3>
            </div>

            <div className="space-y-3 text-xs text-[#2C2825]">
              <div className="bg-[#FAF8F3] border border-[#E9E4D9] p-3 rounded-sm space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#6B645D]">File Name:</span>
                  <span className="font-semibold">{selectedFile?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B645D]">New Students to Create:</span>
                  <span className="text-[#3F4E40] font-semibold">+{previewData.newCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B645D]">Existing Students to Update:</span>
                  <span className="text-[#2B4C7E] font-semibold">{previewData.updatedCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#6B645D]">Unchanged Students:</span>
                  <span className="text-[#6B645D]">{previewData.unchangedCount}</span>
                </div>
                {previewData.errorCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-[#671B24]">Rows with Errors (Skipped):</span>
                    <span className="text-[#671B24] font-semibold">{previewData.errorCount}</span>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-[#6B645D] space-y-1 font-mono">
                <p>• Skip bad rows: {skipBadRows ? "Yes" : "No"}</p>
                <p>• Create missing classes: {createMissingClasses ? "Yes" : "No"}</p>
                <p>• Complete student list: {isCompleteList ? "Yes (missing students flagged)" : "No"}</p>
              </div>

              <p className="text-[11px] text-[#6B645D] italic">
                This import runs in an atomic database transaction. Any critical failure will rollback all changes.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E9E4D9]">
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isImporting}
                className="px-4 py-2 text-xs font-mono text-[#6B645D] hover:text-[#2C2825] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeImport}
                disabled={isImporting}
                className="inline-flex items-center gap-2 px-5 py-2 bg-[#3F4E40] text-white hover:bg-[#2C382D] text-xs font-mono transition-colors rounded-sm cursor-pointer disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    Confirm & Execute
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Import History Table */}
      <div className="bg-white border border-[#E9E4D9] p-6 rounded-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-3">
          <div>
            <h3 className="font-serif text-base font-semibold text-[#2C2825]">
              Import History for {selectedSchool?.name}
            </h3>
            <p className="text-xs text-[#6B645D] mt-0.5">
              Previous roster uploads and summary counts (no personal student data stored in history logs).
            </p>
          </div>

          <button
            type="button"
            onClick={() => selectedSchoolId && loadImportHistory(selectedSchoolId)}
            disabled={loadingHistory}
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[#6B645D] hover:text-[#3F4E40] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {historyError && (
          <div className="p-3 bg-[#FDF2F2] border border-[#F5C2C2] text-[#671B24] text-xs flex items-start gap-2 rounded-sm font-mono text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{historyError}</span>
          </div>
        )}

        <div className="border border-[#E9E4D9] rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D] font-mono text-[11px]">
                  <th className="py-2.5 px-4 font-medium">Upload Date</th>
                  <th className="py-2.5 px-4 font-medium">File Name</th>
                  <th className="py-2.5 px-4 font-medium">Uploaded By</th>
                  <th className="py-2.5 px-4 font-medium text-center">New</th>
                  <th className="py-2.5 px-4 font-medium text-center">Updated</th>
                  <th className="py-2.5 px-4 font-medium text-center">Unchanged</th>
                  <th className="py-2.5 px-4 font-medium text-center">Errors</th>
                  <th className="py-2.5 px-4 font-medium text-right">Total</th>
                  <th className="py-2.5 px-4 font-medium text-center">Active</th>
                  <th className="py-2.5 px-4 font-medium text-right">Card Total</th>
                  <th className="py-2.5 px-4 font-medium text-right">Expected Share</th>
                  <th className="py-2.5 px-4 font-medium text-right">School Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F0E6]">
                {loadingHistory ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-xs font-mono text-[#6B645D]">
                      Loading import history...
                    </td>
                  </tr>
                ) : historyList.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-xs font-mono text-[#6B645D]">
                      No previous roster imports recorded for this school.
                    </td>
                  </tr>
                ) : (
                  historyList.map((h) => {
                    const expectedTotalNum = h.expected_total != null ? Number(h.expected_total) : null;
                    const expectedShareNum = h.expected_share != null ? Number(h.expected_share) : null;
                    const schoolShareNum =
                      expectedTotalNum != null && expectedShareNum != null
                        ? expectedTotalNum - expectedShareNum
                        : null;

                    return (
                      <tr key={h.id} className="hover:bg-[#FAF8F3]">
                        <td className="py-2.5 px-4 font-mono text-[#6B645D] whitespace-nowrap">
                          {formatRosterDate(h.created_at)}
                        </td>
                        <td className="py-2.5 px-4 font-mono font-medium text-[#2C2825]">
                          {h.file_name}
                        </td>
                        <td className="py-2.5 px-4 text-[#47423D]">
                          {h.user ? `${h.user.name} (${h.user.email})` : "System / Platform Admin"}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-[#3F4E40] font-medium">
                          +{h.new_count}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-[#2B4C7E]">
                          {h.updated_count}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-[#6B645D]">
                          {h.unchanged_count}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-[#671B24]">
                          {h.error_count}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-semibold text-[#2C2825]">
                          {h.total_count}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-[#2C2825]">
                          {h.active_student_count != null ? h.active_student_count : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#2C2825]">
                          {expectedTotalNum != null ? `₦${expectedTotalNum.toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#3F4E40] font-medium">
                          {expectedShareNum != null ? `₦${expectedShareNum.toLocaleString()}` : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-[#2B4C7E]">
                          {schoolShareNum != null ? `₦${schoolShareNum.toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
