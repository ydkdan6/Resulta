"use client";

import { useEffect, useState } from "react";
import { X, Download, FileText, Loader2 } from "lucide-react";

interface SubjectResult {
  subject: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schoolName: string;
  schoolLogoUrl?: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  termName: string;
  session: string;
  termId: string;
  subjects: SubjectResult[];
}


export default function ReportCardPreviewModal({
  isOpen,
  onClose,
  schoolName,
  schoolLogoUrl,
  studentName,
  admissionNumber,
  className,
  termName,
  session,
  termId,
  subjects,
}: Props) {

  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const totalScore = subjects.reduce((sum, s) => sum + (s.total ? Number(s.total) : 0), 0);
  const scoredCount = subjects.filter((s) => s.total !== null).length;
  const average = scoredCount > 0 ? (totalScore / scoredCount).toFixed(1) : "0";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white border border-[#D1CCC2] rounded-md max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E9E4D9] flex items-center justify-between bg-[#FAF8F3]">
          <div className="flex items-center gap-2">
            {schoolLogoUrl && (
              <img src={schoolLogoUrl} alt="School Logo" className="h-8 w-8 object-contain" />
            )}
            <FileText className="w-5 h-5 text-[#3F4E40]" />
            <div>
              <h3 className="text-sm font-serif font-bold text-[#2C2825]">Report Card Preview</h3>
              <p className="text-[11px] font-mono text-[#6B645D]">
                {schoolName} • {session} ({termName})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#6B645D] hover:text-[#2C2825] rounded hover:bg-[#E9E4D9] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Preview */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 font-mono text-xs">
          {/* Metadata Card */}
          <div className="p-4 bg-[#FAF8F3] border border-[#E9E4D9] rounded flex flex-wrap justify-between gap-3 text-xs">
            <div>
              <span className="text-[#6B645D]">Student: </span>
              <strong className="text-[#2C2825]">{studentName}</strong>
            </div>
            <div>
              <span className="text-[#6B645D]">Admission No: </span>
              <strong className="text-[#2C2825]">{admissionNumber}</strong>
            </div>
            <div>
              <span className="text-[#6B645D]">Class: </span>
              <strong className="text-[#2C2825]">{className}</strong>
            </div>
            <div>
              <span className="text-[#6B645D]">Session: </span>
              <strong className="text-[#2C2825]">{session}</strong>
            </div>
          </div>

          {/* Table */}
          <div className="border border-[#E9E4D9] rounded overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#3F4E40] text-white text-[11px]">
                  <th className="py-2 px-3 font-semibold">Subject</th>
                  <th className="py-2 px-2 text-center font-semibold">CA</th>
                  <th className="py-2 px-2 text-center font-semibold">Exam</th>
                  <th className="py-2 px-2 text-center font-semibold">Total</th>
                  <th className="py-2 px-2 text-center font-semibold">Grade</th>
                  <th className="py-2 px-3 font-semibold">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E4D9]">
                {subjects.map((s, idx) => (
                  <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-[#FAF8F3]/50"}>
                    <td className="py-2 px-3 font-medium text-[#2C2825]">{s.subject}</td>
                    <td className="py-2 px-2 text-center text-[#6B645D]">{s.ca_score ?? "-"}</td>
                    <td className="py-2 px-2 text-center text-[#6B645D]">{s.exam_score ?? "-"}</td>
                    <td className="py-2 px-2 text-center font-bold text-[#2C2825]">{s.total ?? "-"}</td>
                    <td className="py-2 px-2 text-center font-bold text-[#3F4E40]">{s.grade ?? "-"}</td>
                    <td className="py-2 px-3 text-[#6B645D]">{s.remark ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Aggregate */}
          <div className="p-3 bg-[#F2F6F3] border border-[#BACBBF] rounded flex items-center justify-between text-xs text-[#3F4E40] font-bold">
            <span>Aggregate: {totalScore}</span>
            <span>Average: {average}%</span>
            <span>Subjects: {scoredCount}</span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-[#D1CCC2] text-xs font-mono rounded text-[#2C2825] hover:bg-white"
          >
            Close Preview
          </button>
          <a
            href={`/api/parent/report-pdf?termId=${termId}`}
            download
            className="px-4 py-2 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono font-medium rounded flex items-center gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" /> Download Official PDF
          </a>
        </div>
      </div>
    </div>
  );
}
