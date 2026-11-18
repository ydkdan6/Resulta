"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CreditCard,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Clock,
  MessageSquare,
  KeyRound,
  Filter,
  Check,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  Download,
  RotateCcw
} from "lucide-react";

interface TermOption {
  id: string;
  name: string;
  session: string;
  term_number: number;
  status: string;
}

interface StudentPaymentRow {
  id: string;
  admission_number: string;
  full_name: string;
  class_name: string;
  fees_paid: boolean;
  result_locked: boolean;
}

interface PaymentBatchItem {
  id: string;
  students_count: number;
  amount_due: string | number;
  amount_received: string | number;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  created_at: string;
  confirmed_at: string | null;
}

interface ComplaintItem {
  id: string;
  message: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  created_at: string;
  student: {
    id: string;
    admission_number: string;
    full_name: string;
    class: { name: string } | null;
  };
}

interface GeneratedPinItem {
  student_id: string;
  admission_number: string;
  full_name: string;
  class_name?: string;
  plain_pin: string;
}

interface Props {
  schoolName: string;
}

export default function PaymentsClient({ schoolName }: Props) {
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [loadingTerms, setLoadingTerms] = useState(true);

  const [students, setStudents] = useState<StudentPaymentRow[]>([]);
  const [batches, setBatches] = useState<PaymentBatchItem[]>([]);
  const [complaints, setComplaints] = useState<ComplaintItem[]>([]);
  const [platformShare, setPlatformShare] = useState<number>(1000);
  const [cardPrice, setCardPrice] = useState<number>(2000);

  const [loadingData, setLoadingData] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters & selection
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPaid, setFilterPaid] = useState<"all" | "paid" | "unpaid">("all");
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState<number>(1);
  const pageSize = 25;

  // PIN generation modal/results
  const [generatedPins, setGeneratedPins] = useState<GeneratedPinItem[] | null>(null);

  // Reprint modal state
  const [reprintTargetStudent, setReprintTargetStudent] = useState<StudentPaymentRow | null>(null);
  const [reprintReason, setReprintReason] = useState("");
  const [reprintResultPin, setReprintResultPin] = useState<{
    admission_number: string;
    full_name: string;
    plain_pin: string;
    card: any;
  } | null>(null);

  // Fetch terms on mount
  useEffect(() => {
    async function fetchTerms() {
      try {
        setLoadingTerms(true);
        const res = await fetch("/api/staff/terms");
        if (!res.ok) throw new Error("Failed to load school terms.");
        const data = await res.json();
        const termList: TermOption[] = data.terms || [];
        setTerms(termList);
        if (termList.length > 0) {
          setSelectedTermId(termList[0].id);
        }
      } catch (err: unknown) {
        setErrorMsg((err as Error).message);
      } finally {
        setLoadingTerms(false);
      }
    }
    fetchTerms();
  }, []);

  // Fetch payments, batches, and complaints whenever selectedTermId changes
  const loadPaymentData = useCallback(async () => {
    if (!selectedTermId) return;
    try {
      setLoadingData(true);
      setErrorMsg(null);

      const [payRes, compRes] = await Promise.all([
        fetch(`/api/staff/payments?termId=${selectedTermId}`),
        fetch(`/api/staff/complaints?termId=${selectedTermId}`),
      ]);

      if (!payRes.ok) {
        const err = await payRes.json();
        throw new Error(err.error || "Failed to load payment tracking data.");
      }
      const payData = await payRes.json();
      setStudents(payData.students || []);
      setBatches(payData.batches || []);
      setPlatformShare(payData.platform_share || 1000);
      setCardPrice(payData.card_price || 2000);
      setSelectedStudentIds(new Set());

      if (compRes.ok) {
        const compData = await compRes.json();
        setComplaints(compData.complaints || []);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoadingData(false);
    }
  }, [selectedTermId]);

  useEffect(() => {
    loadPaymentData();
  }, [loadPaymentData]);

  // Handle Mark as Paid (bulk or single)
  const handleMarkPaid = async (studentIds: string[], createBatch: boolean) => {
    if (studentIds.length === 0 || !selectedTermId) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch("/api/staff/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termId: selectedTermId,
          studentIds,
          createBatch,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update payment status.");

      setSuccessMsg(
        createBatch
          ? `Marked ${data.updated_count} student(s) as paid and created a payment batch.`
          : `Marked ${data.updated_count} student(s) as paid.`
      );
      await loadPaymentData();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Result Withhold Toggle
  const handleToggleWithhold = async (studentId: string, currentLocked: boolean) => {
    if (!selectedTermId) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);

      const res = await fetch("/api/staff/payments/withhold", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          termId: selectedTermId,
          withheld: !currentLocked,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update withholding lock.");

      setStudents((prev) =>
        prev.map((s) => (s.id === studentId ? { ...s, result_locked: !currentLocked } : s))
      );
      setSuccessMsg(
        !currentLocked
          ? "Result withheld (locked) for student."
          : "Result withholding removed (unlocked)."
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Generate Cards (PINs) for confirmed batch or selected students
  const handleGeneratePins = async (studentIds?: string[], batchId?: string) => {
    if (!selectedTermId) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch("/api/staff/pins/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termId: selectedTermId,
          studentIds: studentIds && studentIds.length > 0 ? studentIds : undefined,
          batchId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate PINs.");
      }

      setGeneratedPins(data.pins || []);
      setSuccessMsg(data.message || `Generated ${data.generated_count} PINs.`);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Download PDF of generated PIN cards
  const handleDownloadPdf = async () => {
    if (!generatedPins || generatedPins.length === 0) return;
    try {
      setDownloadingPdf(true);
      const currentTerm = terms.find((t) => t.id === selectedTermId);
      const cards = generatedPins.map((p) => ({
        schoolName,
        studentName: p.full_name,
        admissionNumber: p.admission_number,
        className: p.class_name || "General",
        termName: currentTerm ? currentTerm.name : "Current Term",
        session: currentTerm?.session || "2026/2027",
        pin: p.plain_pin,
        portalUrl: window.location.origin.replace("-staff.", "."),
      }));

      const res = await fetch("/api/staff/pins/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards,
          filename: `pin-cards-${currentTerm?.session || "session"}.pdf`,
        }),
      });

      if (!res.ok) throw new Error("Failed to produce PDF.");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pin-cards-${currentTerm?.session?.replace("/", "-") || "term"}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Handle Reprint PIN
  const handleExecuteReprint = async () => {
    if (!reprintTargetStudent || !selectedTermId || !reprintReason.trim()) return;
    try {
      setActionLoading(true);
      setErrorMsg(null);

      const res = await fetch("/api/staff/pins/reprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: reprintTargetStudent.id,
          termId: selectedTermId,
          reason: reprintReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reprint PIN.");

      setReprintResultPin({
        admission_number: data.admission_number,
        full_name: data.full_name,
        plain_pin: data.plain_pin,
        card: data.card,
      });
      setSuccessMsg(data.message);
      setReprintReason("");
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Resolve Complaint
  const handleResolveComplaint = async (complaintId: string, status: "RESOLVED" | "DISMISSED") => {
    try {
      setActionLoading(true);
      setErrorMsg(null);

      const res = await fetch(`/api/staff/complaints/${complaintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update complaint.");

      setComplaints((prev) =>
        prev.map((c) => (c.id === complaintId ? { ...c, status } : c))
      );
      setSuccessMsg(`Complaint marked as ${status.toLowerCase()}.`);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Filtering students
  const filteredStudents = useMemo<StudentPaymentRow[]>(() => {
    return students.filter((s: StudentPaymentRow) => {
      const matchesSearch =
        s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.admission_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.class_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPaid =
        filterPaid === "all" ? true : filterPaid === "paid" ? s.fees_paid : !s.fees_paid;

      return matchesSearch && matchesPaid;
    });
  }, [students, searchQuery, filterPaid]);

  const totalPages = Math.max(1, Math.ceil(filteredStudents.length / pageSize));
  const paginatedStudents = useMemo<StudentPaymentRow[]>(() => {
    return filteredStudents.slice((page - 1) * pageSize, page * pageSize);
  }, [filteredStudents, page, pageSize]);

  const toggleSelectStudent = (id: string) => {
    const next = new Set(selectedStudentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedStudentIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedStudentIds.size === filteredStudents.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(filteredStudents.map((s: StudentPaymentRow) => s.id)));
    }
  };

  const paidCount = students.filter((s) => s.fees_paid).length;
  const amountOwed = paidCount * platformShare;
  const confirmedBatches = batches.filter((b) => b.status === "CONFIRMED");
  const hasConfirmedBatch = confirmedBatches.length > 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Notification */}
      {errorMsg && (
        <div className="p-4 bg-[#FBEBEB] border border-[#E0B4B4] rounded-sm text-[#671B24] text-xs font-mono flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-[#F2F6F3] border border-[#BACBBF] rounded-sm text-[#3F4E40] text-xs font-mono flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex-1">{successMsg}</div>
        </div>
      )}

      {/* Header & Term Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E9E4D9]">
        <div>
          <h2 className="text-xl font-serif text-[#2C2825]">Payment Tracking & PIN Engine</h2>
          <p className="text-xs font-mono text-[#6B645D] mt-1">
            Mark student fees as paid, manage billing batches, generate print-ready PIN cards, and reprint replacements.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-[#6B645D]">Academic Term:</label>
          <select
            value={selectedTermId}
            onChange={(e) => setSelectedTermId(e.target.value)}
            disabled={loadingTerms || actionLoading}
            className="border border-[#D1CCC2] bg-white px-3 py-1.5 text-xs font-mono rounded-sm text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
          >
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadPaymentData}
            disabled={loadingData || actionLoading}
            className="p-1.5 border border-[#D1CCC2] bg-white text-[#6B645D] hover:text-[#2C2825] rounded-sm text-xs"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingData ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
          <div className="text-xs font-mono text-[#6B645D]">Total Enrolled</div>
          <div className="text-2xl font-serif text-[#2C2825] mt-1">{students.length}</div>
          <div className="text-[11px] font-mono text-[#6B645D] mt-1">Active students this session</div>
        </div>

        <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
          <div className="text-xs font-mono text-[#6B645D]">Marked as Paid</div>
          <div className="text-2xl font-serif text-[#3F4E40] mt-1">{paidCount}</div>
          <div className="text-[11px] font-mono text-[#6B645D] mt-1">
            {students.length > 0 ? Math.round((paidCount / students.length) * 100) : 0}% clearance
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
          <div className="text-xs font-mono text-[#6B645D]">Amount Owed to Provider</div>
          <div className="text-2xl font-serif text-[#2C2825] mt-1">
            ₦{amountOwed.toLocaleString()}
          </div>
          <div className="text-[11px] font-mono text-[#6B645D] mt-1">
            {paidCount} paid × ₦{platformShare.toLocaleString()} share
          </div>
        </div>

        <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
          <div className="text-xs font-mono text-[#6B645D]">PIN Generation Status</div>
          <div className="mt-1 flex items-center gap-1.5">
            {hasConfirmedBatch ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium bg-[#F2F6F3] text-[#3F4E40] rounded-sm border border-[#BACBBF]">
                <CheckCircle2 className="w-3 h-3" /> Batch Confirmed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium bg-[#FFF8E7] text-[#91660A] rounded-sm border border-[#F0D59A]">
                <Clock className="w-3 h-3" /> Awaiting Confirmation
              </span>
            )}
          </div>
          <div className="text-[11px] font-mono text-[#6B645D] mt-1">
            {hasConfirmedBatch
              ? "Platform approved PIN generation"
              : "PINs locked until batch confirmed"}
          </div>
        </div>
      </div>

      {/* Generated PINs Modal / Print PDF Banner */}
      {generatedPins && (
        <div className="p-5 bg-white border-2 border-[#3F4E40] rounded-sm shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E9E4D9] pb-3">
            <div>
              <h3 className="text-base font-serif text-[#2C2825]">
                Generated PIN Cards ({generatedPins.length})
              </h3>
              <p className="text-xs font-mono text-[#671B24] font-medium mt-0.5">
                Critical: Plain PINs are never saved in the database or server logs. Download the print-ready PDF now; this download cannot be repeated.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="px-3.5 py-1.5 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono rounded-sm flex items-center gap-1.5 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                {downloadingPdf ? "Generating PDF..." : "Download Print-Ready PDF"}
              </button>
              <button
                type="button"
                onClick={() => setGeneratedPins(null)}
                className="text-xs font-mono px-3 py-1.5 bg-[#FAF8F3] border border-[#D1CCC2] rounded-sm hover:bg-gray-100"
              >
                Dismiss
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border border-[#E9E4D9] rounded-sm">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D] sticky top-0">
                <tr>
                  <th className="py-2 px-3">Admission No</th>
                  <th className="py-2 px-3">Full Name</th>
                  <th className="py-2 px-3">10-Character PIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E4D9]">
                {generatedPins.map((p) => (
                  <tr key={p.student_id} className="hover:bg-yellow-50">
                    <td className="py-2 px-3 font-semibold">{p.admission_number}</td>
                    <td className="py-2 px-3">{p.full_name}</td>
                    <td className="py-2 px-3 font-mono font-bold text-[#3F4E40] tracking-wider text-sm">
                      {p.plain_pin}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reprint Result Banner */}
      {reprintResultPin && (
        <div className="p-4 bg-[#F2F6F3] border border-[#BACBBF] rounded-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#3F4E40]" />
              <h4 className="text-xs font-mono font-bold text-[#3F4E40]">
                New PIN Generated for {reprintResultPin.full_name} ({reprintResultPin.admission_number})
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setReprintResultPin(null)}
              className="text-[11px] font-mono text-[#6B645D] underline"
            >
              Close
            </button>
          </div>
          <div className="p-3 bg-white border border-[#BACBBF] rounded-sm flex items-center justify-between">
            <div>
              <div className="text-[11px] font-mono text-[#6B645D]">New 10-Character Access PIN:</div>
              <div className="text-base font-mono font-bold text-[#2C2825] tracking-widest mt-0.5">
                {reprintResultPin.plain_pin}
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/staff/pins/pdf", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    cards: [reprintResultPin.card],
                    filename: `reprint-${reprintResultPin.admission_number}.pdf`,
                  }),
                });
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `reprint-${reprintResultPin.admission_number}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
              className="px-3 py-1 bg-[#3F4E40] text-white text-xs font-mono rounded-sm flex items-center gap-1"
            >
              <Download className="w-3 h-3" /> Download Card PDF
            </button>
          </div>
        </div>
      )}

      {/* Reprint Modal Dialog */}
      {reprintTargetStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-[#D1CCC2] rounded-sm max-w-md w-full p-5 space-y-4 shadow-lg">
            <div className="border-b border-[#E9E4D9] pb-3">
              <h3 className="text-base font-serif text-[#2C2825]">Reprint Student PIN Card</h3>
              <p className="text-xs font-mono text-[#6B645D] mt-1">
                Student: <span className="font-semibold text-[#2C2825]">{reprintTargetStudent.full_name}</span> ({reprintTargetStudent.admission_number})
              </p>
            </div>

            <div className="text-xs font-mono text-[#671B24] bg-[#FBEBEB] p-3 rounded-sm border border-[#E0B4B4]">
              Notice: A reprint replaces the previous PIN with a new random 10-character code and revokes access under the old PIN. A formal reason is mandatory and will be recorded in the audit log.
            </div>

            <div>
              <label className="block text-xs font-mono text-[#2C2825] mb-1">
                Reason for Replacement / Reprint:
              </label>
              <textarea
                value={reprintReason}
                onChange={(e) => setReprintReason(e.target.value)}
                placeholder="e.g. Parent reported lost original card / Damaged physical card"
                rows={3}
                className="w-full text-xs font-mono p-2 border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E9E4D9]">
              <button
                type="button"
                onClick={() => {
                  setReprintTargetStudent(null);
                  setReprintReason("");
                }}
                disabled={actionLoading}
                className="px-3 py-1.5 border border-[#D1CCC2] text-xs font-mono rounded-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleExecuteReprint();
                  setReprintTargetStudent(null);
                }}
                disabled={actionLoading || reprintReason.trim().length < 5}
                className="px-3 py-1.5 bg-[#671B24] hover:bg-[#52151D] text-white text-xs font-mono rounded-sm font-medium disabled:opacity-40"
              >
                {actionLoading ? "Processing..." : "Confirm & Generate Replacement PIN"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Student Table with Bulk Actions */}
      <div className="bg-white border border-[#E9E4D9] rounded-sm overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-[#E9E4D9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Search student or admission no..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-mono border border-[#D1CCC2] rounded-sm w-64 focus:outline-none focus:border-[#3F4E40]"
            />
            <select
              value={filterPaid}
              onChange={(e) => {
                setFilterPaid(e.target.value as "all" | "paid" | "unpaid");
                setPage(1);
              }}
              className="px-3 py-1.5 text-xs font-mono border border-[#D1CCC2] rounded-sm text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            >
              <option value="all">All Payment Statuses</option>
              <option value="paid">Paid Only</option>
              <option value="unpaid">Unpaid Only</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={selectedStudentIds.size === 0 || actionLoading}
              onClick={() => handleMarkPaid(Array.from(selectedStudentIds), false)}
              className="px-3 py-1.5 bg-[#FAF8F3] hover:bg-[#F0ECE1] text-[#2C2825] border border-[#D1CCC2] text-xs font-mono rounded-sm disabled:opacity-40"
            >
              Mark Selected Paid ({selectedStudentIds.size})
            </button>

            <button
              type="button"
              disabled={
                selectedStudentIds.size === 0 ||
                actionLoading ||
                Array.from(selectedStudentIds).some(
                  (id) => students.find((s) => s.id === id)?.fees_paid
                )
              }
              onClick={() => handleMarkPaid(Array.from(selectedStudentIds), true)}
              title={
                Array.from(selectedStudentIds).some(
                  (id) => students.find((s) => s.id === id)?.fees_paid
                )
                  ? "Selected list contains student(s) already marked as paid. Deselect paid students to create a new batch."
                  : "Mark selected unpaid students as paid and create a new payment batch"
              }
              className="px-3 py-1.5 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono rounded-sm disabled:opacity-40 font-medium"
            >
              Mark Paid + Create Batch ({selectedStudentIds.size})
            </button>

            <button
              type="button"
              disabled={selectedStudentIds.size === 0 || actionLoading || !hasConfirmedBatch}
              onClick={() => handleGeneratePins(Array.from(selectedStudentIds))}
              title={
                !hasConfirmedBatch
                  ? "PIN generation is locked until the provider confirms a payment batch."
                  : "Generate PINs for selected paid students"
              }
              className="px-3 py-1.5 bg-[#671B24] hover:bg-[#52151D] text-white text-xs font-mono rounded-sm disabled:opacity-40 font-medium flex items-center gap-1.5"
            >
              <KeyRound className="w-3.5 h-3.5" /> Generate Selected PINs
            </button>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
              <tr>
                <th className="py-2.5 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      filteredStudents.length > 0 &&
                      selectedStudentIds.size === filteredStudents.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded-sm text-[#3F4E40]"
                  />
                </th>
                <th className="py-2.5 px-3">Admission No</th>
                <th className="py-2.5 px-3">Full Name</th>
                <th className="py-2.5 px-3">Class</th>
                <th className="py-2.5 px-3">Fee Status</th>
                <th className="py-2.5 px-3">Results Lock</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E4D9]">
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#6B645D] font-mono text-xs">
                    {loadingData ? "Loading payment records..." : "No student records found."}
                  </td>
                </tr>
              ) : (
                paginatedStudents.map((s: StudentPaymentRow) => (
                  <tr key={s.id} className="hover:bg-[#FAF8F3]">
                    <td className="py-2 px-3">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.has(s.id)}
                        onChange={() => toggleSelectStudent(s.id)}
                        className="rounded-sm text-[#3F4E40]"
                      />
                    </td>
                    <td className="py-2 px-3 font-semibold text-[#2C2825]">{s.admission_number}</td>
                    <td className="py-2 px-3 text-[#2C2825]">{s.full_name}</td>
                    <td className="py-2 px-3 text-[#6B645D]">{s.class_name}</td>
                    <td className="py-2 px-3">
                      {s.fees_paid ? (
                        <span className="inline-flex items-center gap-1 text-[#3F4E40] font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#6B645D]">
                          <Clock className="w-3.5 h-3.5" /> Unpaid
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {s.result_locked ? (
                        <span className="inline-flex items-center gap-1 text-[#671B24] font-medium">
                          <Lock className="w-3.5 h-3.5" /> Withheld
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[#6B645D]">
                          <Unlock className="w-3.5 h-3.5" /> Visible
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right space-x-1.5">
                      {!s.fees_paid ? (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleMarkPaid([s.id], false)}
                          className="px-2 py-1 bg-white border border-[#D1CCC2] hover:bg-[#FAF8F3] text-[11px] rounded-sm text-[#3F4E40]"
                        >
                          Mark Paid
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => setReprintTargetStudent(s)}
                          className="px-2 py-1 bg-white border border-[#D1CCC2] hover:bg-[#FAF8F3] text-[11px] rounded-sm text-[#2C2825] inline-flex items-center gap-1"
                          title="Generate a replacement PIN for lost or damaged card"
                        >
                          <RotateCcw className="w-3 h-3 text-[#6B645D]" /> Reprint
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => handleToggleWithhold(s.id, s.result_locked)}
                        className={`px-2 py-1 border text-[11px] rounded-sm ${
                          s.result_locked
                            ? "border-[#BACBBF] bg-[#F2F6F3] text-[#3F4E40] hover:bg-white"
                            : "border-[#E0B4B4] bg-[#FBEBEB] text-[#671B24] hover:bg-white"
                        }`}
                      >
                        {s.result_locked ? "Release" : "Withhold"}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {filteredStudents.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t border-[#E9E4D9] text-xs font-mono text-[#6B645D]">
            <div>
              Showing {Math.min((page - 1) * pageSize + 1, filteredStudents.length)} to{" "}
              {Math.min(page * pageSize, filteredStudents.length)} of {filteredStudents.length} students
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1 border border-[#D1CCC2] bg-white rounded-xs text-[#2C2825] disabled:opacity-40 hover:bg-[#FAF8F3] cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[#2C2825] font-semibold">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1 border border-[#D1CCC2] bg-white rounded-xs text-[#2C2825] disabled:opacity-40 hover:bg-[#FAF8F3] cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Grid: Payment Batches & Complaints Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Batches Section */}
        <div className="bg-white border border-[#E9E4D9] rounded-sm p-5 space-y-4">
          <div className="border-b border-[#E9E4D9] pb-3">
            <h3 className="text-base font-serif text-[#2C2825]">Payment Batches</h3>
            <p className="text-xs font-mono text-[#6B645D] mt-0.5">
              Batches submitted to the platform provider. Click 'Generate Cards' once confirmed to produce PIN cards.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
                <tr>
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Students</th>
                  <th className="py-2 px-3">Amount Due</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E4D9]">
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-[#6B645D]">
                      No payment batches created yet for this term.
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2 px-3 text-[#6B645D]">
                        {new Date(b.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 px-3 font-semibold text-[#2C2825]">
                        {b.students_count}
                      </td>
                      <td className="py-2 px-3 text-[#2C2825]">
                        ₦{Number(b.amount_due).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        {b.status === "CONFIRMED" ? (
                          <span className="inline-flex items-center gap-1 text-[#3F4E40] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed
                          </span>
                        ) : b.status === "REJECTED" ? (
                          <span className="inline-flex items-center gap-1 text-[#671B24] font-medium">
                            <AlertCircle className="w-3.5 h-3.5" /> Rejected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[#91660A] font-medium">
                            <Clock className="w-3.5 h-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {b.status === "CONFIRMED" ? (
                          <button
                            type="button"
                            disabled={actionLoading}
                            onClick={() => handleGeneratePins(undefined, b.id)}
                            className="px-2.5 py-1 bg-[#3F4E40] hover:bg-[#344035] text-white text-[11px] font-mono rounded-sm font-medium"
                          >
                            Generate Cards
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#6B645D]">Locked</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Complaints Queue Section */}
        <div className="bg-white border border-[#E9E4D9] rounded-sm p-5 space-y-4">
          <div className="border-b border-[#E9E4D9] pb-3">
            <h3 className="text-base font-serif text-[#2C2825]">Parent Complaints Queue</h3>
            <p className="text-xs font-mono text-[#6B645D] mt-0.5">
              Parents reporting 'I have paid' from the result portal.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
                <tr>
                  <th className="py-2 px-3">Student</th>
                  <th className="py-2 px-3">Message</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E9E4D9]">
                {complaints.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-[#6B645D]">
                      No complaints submitted for this term.
                    </td>
                  </tr>
                ) : (
                  complaints.map((c) => (
                    <tr key={c.id}>
                      <td className="py-2 px-3">
                        <div className="font-semibold text-[#2C2825]">
                          {c.student.admission_number}
                        </div>
                        <div className="text-[11px] text-[#6B645D]">{c.student.full_name}</div>
                      </td>
                      <td className="py-2 px-3 text-[#2C2825] max-w-xs truncate" title={c.message}>
                        {c.message}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`text-[11px] px-1.5 py-0.5 rounded-sm ${
                            c.status === "RESOLVED"
                              ? "bg-[#F2F6F3] text-[#3F4E40]"
                              : c.status === "DISMISSED"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-[#FFF8E7] text-[#91660A]"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right space-x-1">
                        {c.status === "PENDING" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleResolveComplaint(c.id, "RESOLVED")}
                              className="px-2 py-0.5 bg-[#FAF8F3] border border-[#BACBBF] text-[#3F4E40] text-[10px] rounded-sm"
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolveComplaint(c.id, "DISMISSED")}
                              className="px-2 py-0.5 bg-white border border-[#D1CCC2] text-gray-500 text-[10px] rounded-sm"
                            >
                              Dismiss
                            </button>
                          </>
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
    </div>
  );
}
