"use client";

import { useState } from "react";
import Link from "next/link";
import { Shield, Download, Trash2, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";

interface Props {
  schoolName: string;
}

export default function DataProtectionPanel({ schoolName }: Props) {
  const [studentId, setStudentId] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleExport = async () => {
    try {
      setExporting(true);
      setStatusMsg(null);
      const res = await fetch("/api/staff/data-protection/export");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ndpa-school-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setStatusMsg({ text: "Data export completed successfully.", type: "success" });
    } catch (err: unknown) {
      setStatusMsg({ text: err instanceof Error ? err.message : "Export failed", type: "error" });
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId || !deleteReason) {
      setStatusMsg({ text: "Student ID and deletion reason are required.", type: "error" });
      return;
    }

    if (!confirm(`Are you sure you want to permanently erase all records for student ID "${studentId}" under NDPA Right to Erasure? This action is irreversible.`)) {
      return;
    }

    try {
      setDeleting(true);
      setStatusMsg(null);
      const res = await fetch("/api/staff/data-protection/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "STUDENT",
          studentId: studentId.trim(),
          reason: deleteReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deletion failed");

      setStatusMsg({ text: data.message || "Student data permanently erased.", type: "success" });
      setStudentId("");
      setDeleteReason("");
    } catch (err: unknown) {
      setStatusMsg({ text: err instanceof Error ? err.message : "Deletion failed", type: "error" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notice & Status banner */}
      {statusMsg && (
        <div
          className={`p-3.5 border rounded-xs text-xs font-mono flex items-center gap-2 ${
            statusMsg.type === "success"
              ? "bg-[#F2F6F3] border-[#BACBBF] text-[#3F4E40]"
              : "bg-[#FDF2F2] border-[#F8D7DA] text-[#671B24]"
          }`}
        >
          {statusMsg.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Overview Card */}
      <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded bg-[#3F4E40] text-white flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#3F4E40] block">
              Compliance & Legal
            </span>
            <h2 className="text-base font-serif font-bold text-[#2C2825]">
              NDPA 2023 Data Protection Management
            </h2>
          </div>
        </div>
        <p className="text-xs text-[#6B645D] leading-relaxed">
          As an educational institution operating under the Nigeria Data Protection Act (NDPA) 2023, {schoolName} is obligated to ensure transparency, data portability, and the right to erasure for registered students and families.
        </p>

        <div className="mt-4 pt-4 border-t border-[#F4F0E6] flex items-center justify-between">
          <span className="text-xs text-[#47423D]">
            Official Privacy Notice & Policy:
          </span>
          <Link
            href="/privacy"
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[#3F4E40] hover:underline"
          >
            <FileText className="w-3.5 h-3.5" />
            View Public NDPA Privacy Notice &rarr;
          </Link>
        </div>
      </div>

      {/* Grid of NDPA tools: Export & Delete */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export / Portability */}
        <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-[#3F4E40] font-serif font-bold text-sm">
              <Download className="w-4 h-4" />
              <h3>Data Portability (Export)</h3>
            </div>
            <p className="text-xs text-[#6B645D] mb-4 leading-relaxed">
              Generate a structured JSON export of all student academic records, classes, subjects, and terms for {schoolName}. All passwords and PIN hashes are stripped for confidentiality.
            </p>
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xs text-xs font-mono font-medium text-white bg-[#3F4E40] hover:bg-[#2E3A2F] disabled:opacity-50 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Generating Export..." : "Export Complete School Data (JSON)"}
          </button>
        </div>

        {/* Right to Erasure / Delete */}
        <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
          <div className="flex items-center gap-2 mb-2 text-[#671B24] font-serif font-bold text-sm">
            <Trash2 className="w-4 h-4" />
            <h3>Right to Erasure (Delete Student)</h3>
          </div>
          <p className="text-xs text-[#6B645D] mb-4 leading-relaxed">
            Permanently delete a departed student's personal record, scores, and PIN history upon valid NDPA erasure request. An audit trail of the reason is permanently maintained.
          </p>

          <form onSubmit={handleDelete} className="space-y-3">
            <div>
              <label className="block text-[11px] font-mono text-[#47423D] mb-1 uppercase">
                Student ID
              </label>
              <input
                type="text"
                required
                placeholder="UUID of student"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-xs text-[#2C2825]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#47423D] mb-1 uppercase">
                Erasure Reason (Required under NDPA)
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Parent request following school withdrawal"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-xs text-[#2C2825]"
              />
            </div>

            <button
              type="submit"
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xs text-xs font-mono font-medium text-white bg-[#671B24] hover:bg-[#52151D] disabled:opacity-50 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {deleting ? "Erasing Record..." : "Permanently Erase Student Data"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
