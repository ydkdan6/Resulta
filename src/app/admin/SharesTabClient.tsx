"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Download,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  CreditCard,
  Building2,
  TrendingUp,
  Clock,
  ArrowUpRight,
  Filter,
  Check,
  X,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export interface SchoolSummaryItem {
  school_id: string;
  school_name: string;
  active_students: number | null;
  expected_share: number | null;
  students_paid: number;
  earned_share: number;
  received: number;
  outstanding: number;
  pins_generated: number;
}

export interface GlobalSummary {
  expected_share: number;
  earned_share: number;
  received: number;
  outstanding: number;
}

export interface TimeSeriesItem {
  date: string;
  earned: number;
  received: number;
  cumulativeEarned: number;
  cumulativeReceived: number;
}

export interface LedgerEntryItem {
  id: string;
  school_id: string;
  student_id: string | null;
  term_id: string | null;
  type: "SHARE_DUE" | "REVERSAL" | "SETTLEMENT";
  amount: number;
  reference: string | null;
  note: string | null;
  created_at: string;
  school?: { id: string; name: string; slug: string };
  student?: {
    id: string;
    admission_number: string;
    full_name: string;
    class?: { name: string };
  } | null;
  term?: { id: string; session: string; term_number: number } | null;
  marked_by?: { id: string; name: string; email: string } | null;
}

interface Props {
  schools: { id: string; name: string; slug: string }[];
}

export default function SharesTabClient({ schools }: Props) {
  // Filter states
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("");
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Ledger-specific filters & pagination
  const [ledgerType, setLedgerType] = useState<string>("");
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const ledgerPageSize = 25;

  // Data states
  const [schoolsSummary, setSchoolsSummary] = useState<SchoolSummaryItem[]>([]);
  const [globalSummary, setGlobalSummary] = useState<GlobalSummary>({
    expected_share: 0,
    earned_share: 0,
    received: 0,
    outstanding: 0,
  });
  const [timeSeries, setTimeSeries] = useState<TimeSeriesItem[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntryItem[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState<number>(0);
  const [ledgerTotalPages, setLedgerTotalPages] = useState<number>(1);

  // Loading and feedback states
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // "Record payment received" Modal state
  const [settlementModalOpen, setSettlementModalOpen] = useState<boolean>(false);
  const [settleSchoolId, setSettleSchoolId] = useState<string>("");
  const [settleAmount, setSettleAmount] = useState<string>("");
  const [settleDate, setSettleDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [settleReference, setSettleReference] = useState<string>("");
  const [settleNote, setSettleNote] = useState<string>("");

  // Load Summary
  const loadSummary = useCallback(async () => {
    try {
      setLoadingSummary(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (selectedSchoolId) params.set("schoolId", selectedSchoolId);
      if (selectedTermId) params.set("termId", selectedTermId);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const res = await fetch(`/api/admin/share-ledger/summary?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load share summary.");
      }
      const data = await res.json();
      setSchoolsSummary(data.schools || []);
      setGlobalSummary(
        data.global || {
          expected_share: 0,
          earned_share: 0,
          received: 0,
          outstanding: 0,
        }
      );
      setTimeSeries(data.timeSeries || []);
    } catch (e: unknown) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoadingSummary(false);
    }
  }, [selectedSchoolId, selectedTermId, startDate, endDate]);

  // Load Ledger Entries
  const loadLedger = useCallback(async () => {
    try {
      setLoadingLedger(true);
      setErrorMsg(null);
      const params = new URLSearchParams();
      if (selectedSchoolId) params.set("schoolId", selectedSchoolId);
      if (selectedTermId) params.set("termId", selectedTermId);
      if (ledgerType) params.set("type", ledgerType);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      params.set("page", String(ledgerPage));
      params.set("pageSize", String(ledgerPageSize));

      const res = await fetch(`/api/admin/share-ledger?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to load share ledger entries.");
      }
      const data = await res.json();
      setLedgerEntries(data.entries || []);
      setLedgerTotal(data.total || 0);
      setLedgerTotalPages(data.totalPages || 1);
    } catch (e: unknown) {
      setErrorMsg((e as Error).message);
    } finally {
      setLoadingLedger(false);
    }
  }, [selectedSchoolId, selectedTermId, ledgerType, startDate, endDate, ledgerPage]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  // Handle CSV Export
  const handleDownloadCsv = () => {
    const params = new URLSearchParams();
    if (selectedSchoolId) params.set("schoolId", selectedSchoolId);
    if (selectedTermId) params.set("termId", selectedTermId);
    if (ledgerType) params.set("type", ledgerType);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("format", "csv");
    window.location.href = `/api/admin/share-ledger?${params.toString()}`;
  };

  // Open Settlement Modal
  const openSettlementForSchool = (schoolId: string) => {
    setSettleSchoolId(schoolId);
    setSettleAmount("");
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleReference("");
    setSettleNote("");
    setSettlementModalOpen(true);
  };

  // Submit Settlement
  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settleSchoolId || !settleAmount || Number(settleAmount) <= 0) {
      setErrorMsg("Please enter a valid positive settlement amount.");
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      const res = await fetch("/api/admin/share-ledger/settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: settleSchoolId,
          amount: Number(settleAmount),
          date: settleDate,
          reference: settleReference.trim() || undefined,
          note: settleNote.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record payment received.");
      }

      setSuccessMsg(
        `Successfully recorded settlement payment of ₦${Number(settleAmount).toLocaleString()}.`
      );
      setSettlementModalOpen(false);
      await Promise.all([loadSummary(), loadLedger()]);
    } catch (e: unknown) {
      setErrorMsg((e as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Selected school summary vs Global
  const selectedSchoolMetrics = useMemo(() => {
    if (!selectedSchoolId) {
      return {
        expected: globalSummary.expected_share,
        earned: globalSummary.earned_share,
        received: globalSummary.received,
        outstanding: globalSummary.outstanding,
      };
    }
    const found = schoolsSummary.find((s) => s.school_id === selectedSchoolId);
    return {
      expected: found?.expected_share ?? 0,
      earned: found?.earned_share ?? 0,
      received: found?.received ?? 0,
      outstanding: found?.outstanding ?? 0,
    };
  }, [selectedSchoolId, schoolsSummary, globalSummary]);

  // Memoised grouped data for chart (b)
  const groupedChartData = useMemo(() => {
    return schoolsSummary.map((s) => ({
      name: s.school_name.length > 15 ? s.school_name.slice(0, 14) + "…" : s.school_name,
      expected: s.expected_share ?? 0,
      earned: s.earned_share,
      received: s.received,
    }));
  }, [schoolsSummary]);

  return (
    <div className="space-y-6">
      {/* Top Banner Notifications */}
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

      {/* Header & Filter Bar */}
      <div className="bg-white border border-[#E9E4D9] p-5 rounded-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E9E4D9] pb-3">
          <div>
            <h2 className="text-lg font-serif text-[#2C2825]">Payments & Platform Shares</h2>
            <p className="text-xs font-mono text-[#6B645D] mt-0.5">
              Live tracking of expected share, earned card revenue, bank settlements, and school accounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                loadSummary();
                loadLedger();
              }}
              disabled={loadingSummary || loadingLedger}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FAF8F3] hover:bg-[#F0ECE1] text-[#2C2825] border border-[#D1CCC2] text-xs font-mono rounded-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loadingSummary || loadingLedger ? "animate-spin" : ""}`}
              />
              Refresh Data
            </button>
            <button
              type="button"
              onClick={handleDownloadCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#3F4E40] hover:bg-[#2C382D] text-white text-xs font-mono rounded-sm cursor-pointer font-medium"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-mono text-[#6B645D] mb-1">
              Filter by School:
            </label>
            <select
              value={selectedSchoolId}
              onChange={(e) => {
                setSelectedSchoolId(e.target.value);
                setLedgerPage(1);
              }}
              className="w-full text-xs font-mono px-2.5 py-1.5 border border-[#D1CCC2] bg-white rounded-sm text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            >
              <option value="">All Schools</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#6B645D] mb-1">
              Start Date:
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setLedgerPage(1);
              }}
              className="w-full text-xs font-mono px-2.5 py-1.5 border border-[#D1CCC2] bg-white rounded-sm text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono text-[#6B645D] mb-1">
              End Date:
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setLedgerPage(1);
              }}
              className="w-full text-xs font-mono px-2.5 py-1.5 border border-[#D1CCC2] bg-white rounded-sm text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setSelectedSchoolId("");
                setSelectedTermId("");
                setStartDate("");
                setEndDate("");
                setLedgerType("");
                setLedgerPage(1);
              }}
              className="w-full text-xs font-mono px-3 py-1.5 bg-[#FAF8F3] hover:bg-[#F0ECE1] border border-[#D1CCC2] text-[#6B645D] rounded-sm cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards: Selected vs Across All Schools */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-medium text-[#6B645D] uppercase tracking-wider">
            {selectedSchoolId
              ? `Metrics for ${schools.find((s) => s.id === selectedSchoolId)?.name}`
              : "Overview Across All Schools"}
          </h3>
          {selectedSchoolId && (
            <span className="text-[11px] font-mono text-[#3F4E40]">
              Filtered scope active
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
            <div className="text-xs font-mono text-[#6B645D]">Expected Share</div>
            <div className="text-2xl font-serif text-[#2C2825] mt-1">
              ₦{Number(selectedSchoolMetrics.expected).toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-[#6B645D] mt-1">
              From active student roster snapshot
            </div>
          </div>

          <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
            <div className="text-xs font-mono text-[#6B645D]">Earned Share</div>
            <div className="text-2xl font-serif text-[#3F4E40] mt-1">
              ₦{Number(selectedSchoolMetrics.earned).toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-[#6B645D] mt-1">
              Marked paid students × platform share
            </div>
          </div>

          <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
            <div className="text-xs font-mono text-[#6B645D]">Received (Settled)</div>
            <div className="text-2xl font-serif text-[#2B4C7E] mt-1">
              ₦{Number(selectedSchoolMetrics.received).toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-[#6B645D] mt-1">
              Confirmed payments via settlements
            </div>
          </div>

          <div className="p-4 bg-white border border-[#E9E4D9] rounded-sm">
            <div className="text-xs font-mono text-[#6B645D]">Outstanding Balance</div>
            <div
              className={`text-2xl font-serif mt-1 ${
                selectedSchoolMetrics.outstanding > 0 ? "text-[#671B24]" : "text-[#3F4E40]"
              }`}
            >
              ₦{Number(selectedSchoolMetrics.outstanding).toLocaleString()}
            </div>
            <div className="text-[11px] font-mono text-[#6B645D] mt-1">
              Earned share minus received
            </div>
          </div>
        </div>

        {/* If a single school is selected, also show Global Totals underneath for reference */}
        {selectedSchoolId && (
          <div className="p-3 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm flex flex-wrap items-center justify-between text-xs font-mono text-[#6B645D] gap-2">
            <span className="font-semibold text-[#2C2825]">
              Global Totals (All Schools):
            </span>
            <span>Expected: ₦{globalSummary.expected_share.toLocaleString()}</span>
            <span>Earned: ₦{globalSummary.earned_share.toLocaleString()}</span>
            <span>Received: ₦{globalSummary.received.toLocaleString()}</span>
            <span
              className={
                globalSummary.outstanding > 0 ? "text-[#671B24] font-medium" : "text-[#3F4E40]"
              }
            >
              Outstanding: ₦{globalSummary.outstanding.toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {/* Visual Analytics / Charts Section */}
      <div className="bg-white border border-[#E9E4D9] p-5 rounded-sm space-y-6">
        <div className="border-b border-[#E9E4D9] pb-3">
          <h3 className="text-base font-serif text-[#2C2825]">Visual Share Analytics</h3>
          <p className="text-xs font-mono text-[#6B645D] mt-0.5">
            Real-time daily revenue trends, school performance comparisons, and cumulative cash settlements.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart (a): Daily Earned Share Bar Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-[#2C2825]">(a) Earned Share Over Time</span>
              <span className="text-[#6B645D]">Daily aggregation</span>
            </div>
            <div className="border border-[#E9E4D9] rounded-sm p-3 bg-white">
              {timeSeries.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-xs font-mono text-[#6B645D] bg-[#FAF8F3]">
                  No share entries recorded for the selected filter range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={timeSeries} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0ECE1" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#6B645D" }}
                      label={{ value: "Date", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6B645D" }}
                      tickFormatter={(val) => `₦${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(val: any) => [`₦${Number(val).toLocaleString()}`, "Earned Share"]}
                      contentStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace" }} verticalAlign="top" />
                    <Bar dataKey="earned" name="Earned Share" fill="#3F4E40" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Chart (c): Cumulative Earned vs Received Line Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="font-semibold text-[#2C2825]">(c) Cumulative Earned vs Received</span>
              <span className="text-[#6B645D]">Running trend</span>
            </div>
            <div className="border border-[#E9E4D9] rounded-sm p-3 bg-white">
              {timeSeries.length === 0 ? (
                <div className="h-60 flex items-center justify-center text-xs font-mono text-[#6B645D] bg-[#FAF8F3]">
                  No settlement or share records for cumulative curve.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={timeSeries} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0ECE1" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#6B645D" }}
                      label={{ value: "Date", position: "insideBottom", offset: -10, fontSize: 10 }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#6B645D" }}
                      tickFormatter={(val) => `₦${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(val: any, name: any) => [`₦${Number(val).toLocaleString()}`, name]}
                      contentStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace" }} verticalAlign="top" />
                    <Line
                      type="monotone"
                      dataKey="cumulativeEarned"
                      name="Cumulative Earned"
                      stroke="#3F4E40"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="cumulativeReceived"
                      name="Cumulative Received"
                      stroke="#2B4C7E"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* Chart (b): Grouped Bar Chart per School */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-semibold text-[#2C2825]">
              (b) Expected vs Earned vs Received by School
            </span>
            <span className="text-[#6B645D]">Institutional comparison</span>
          </div>
          <div className="border border-[#E9E4D9] rounded-sm p-3 bg-white">
            {groupedChartData.length === 0 ? (
              <div className="h-60 flex items-center justify-center text-xs font-mono text-[#6B645D] bg-[#FAF8F3]">
                No schools available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={groupedChartData} margin={{ top: 10, right: 10, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0ECE1" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#6B645D" }}
                    label={{ value: "School", position: "insideBottom", offset: -10, fontSize: 10 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#6B645D" }}
                    tickFormatter={(val) => `₦${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: any, name: any) => [`₦${Number(val).toLocaleString()}`, name]}
                    contentStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px", fontFamily: "monospace" }} verticalAlign="top" />
                  <Bar dataKey="expected" name="Expected Share" fill="#91660A" />
                  <Bar dataKey="earned" name="Earned Share" fill="#3F4E40" />
                  <Bar dataKey="received" name="Received" fill="#2B4C7E" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Per-School Table */}
      <div className="bg-white border border-[#E9E4D9] rounded-sm overflow-hidden">
        <div className="p-4 border-b border-[#E9E4D9] flex items-center justify-between">
          <div>
            <h3 className="text-base font-serif text-[#2C2825]">School Share Statements</h3>
            <p className="text-xs font-mono text-[#6B645D] mt-0.5">
              Breakdown by school. Discrepancies where active PIN count exceeds paid students are highlighted.
            </p>
          </div>
          <span className="text-xs font-mono text-[#6B645D]">
            {schoolsSummary.length} school{schoolsSummary.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
              <tr>
                <th className="py-2.5 px-3">School Name</th>
                <th className="py-2.5 px-3 text-center">Active Students</th>
                <th className="py-2.5 px-3 text-right">Expected Share</th>
                <th className="py-2.5 px-3 text-center">Students Paid</th>
                <th className="py-2.5 px-3 text-right">Earned Share</th>
                <th className="py-2.5 px-3 text-right">Received</th>
                <th className="py-2.5 px-3 text-right">Outstanding</th>
                <th className="py-2.5 px-3 text-center">PINs Generated</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E4D9]">
              {loadingSummary ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#6B645D]">
                    Loading school share data...
                  </td>
                </tr>
              ) : schoolsSummary.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#6B645D]">
                    No schools found.
                  </td>
                </tr>
              ) : (
                schoolsSummary.map((s) => {
                  const hasDiscrepancy = s.pins_generated > s.students_paid;

                  return (
                    <tr
                      key={s.school_id}
                      className={`hover:bg-[#FAF8F3] ${
                        hasDiscrepancy ? "bg-[#FFFDF5] border-l-4 border-l-[#91660A]" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-[#2C2825]">{s.school_name}</div>
                        {hasDiscrepancy && (
                          <div className="inline-flex items-center gap-1 text-[10px] text-[#91660A] mt-0.5 font-medium">
                            <AlertTriangle className="w-3 h-3 text-[#91660A]" />
                            Discrepancy: PINs ({s.pins_generated}) &gt; Paid ({s.students_paid})
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center text-[#2C2825]">
                        {s.active_students ?? "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#6B645D]">
                        {s.expected_share != null
                          ? `₦${s.expected_share.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center font-medium text-[#2C2825]">
                        {s.students_paid}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#3F4E40] font-medium">
                        ₦{s.earned_share.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[#2B4C7E]">
                        ₦{s.received.toLocaleString()}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-medium ${
                          s.outstanding > 0 ? "text-[#671B24]" : "text-[#3F4E40]"
                        }`}
                      >
                        ₦{s.outstanding.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[11px] font-mono ${
                            hasDiscrepancy
                              ? "bg-[#FFF8E7] text-[#91660A] font-bold border border-[#F0D59A]"
                              : "text-[#2C2825]"
                          }`}
                        >
                          {s.pins_generated}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => openSettlementForSchool(s.school_id)}
                          className="px-2.5 py-1 bg-white hover:bg-[#FAF8F3] text-[#3F4E40] border border-[#D1CCC2] rounded-sm text-[11px] font-medium cursor-pointer"
                        >
                          Record Payment
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ledger Table with Filters & Pagination */}
      <div className="bg-white border border-[#E9E4D9] rounded-sm overflow-hidden space-y-3">
        <div className="p-4 border-b border-[#E9E4D9] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-serif text-[#2C2825]">Detailed Share Ledger</h3>
            <p className="text-xs font-mono text-[#6B645D] mt-0.5">
              Append-only audit ledger of every SHARE_DUE, REVERSAL, and SETTLEMENT transaction.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={ledgerType}
              onChange={(e) => {
                setLedgerType(e.target.value);
                setLedgerPage(1);
              }}
              className="text-xs font-mono px-2.5 py-1.5 border border-[#D1CCC2] bg-white rounded-sm text-[#2C2825]"
            >
              <option value="">All Entry Types</option>
              <option value="SHARE_DUE">SHARE_DUE (Paid student)</option>
              <option value="REVERSAL">REVERSAL (Unmarked)</option>
              <option value="SETTLEMENT">SETTLEMENT (Payment received)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
              <tr>
                <th className="py-2.5 px-3">Date & Time</th>
                <th className="py-2.5 px-3">School</th>
                <th className="py-2.5 px-3">Student</th>
                <th className="py-2.5 px-3">Class</th>
                <th className="py-2.5 px-3">Term</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Amount</th>
                <th className="py-2.5 px-3">Marked By</th>
                <th className="py-2.5 px-3">Reference / Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E9E4D9]">
              {loadingLedger ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#6B645D]">
                    Loading ledger records...
                  </td>
                </tr>
              ) : ledgerEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[#6B645D]">
                    No ledger transactions matching filters.
                  </td>
                </tr>
              ) : (
                ledgerEntries.map((e) => {
                  const d = new Date(e.created_at);
                  const dateStr = d.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  });
                  const timeStr = d.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr key={e.id} className="hover:bg-[#FAF8F3]">
                      <td className="py-2 px-3 whitespace-nowrap text-[#6B645D]">
                        <div>{dateStr}</div>
                        <div className="text-[10px] text-[#A0988E]">{timeStr}</div>
                      </td>
                      <td className="py-2 px-3 font-medium text-[#2C2825]">
                        {e.school?.name || "—"}
                      </td>
                      <td className="py-2 px-3">
                        {e.student ? (
                          <>
                            <div className="font-semibold text-[#2C2825]">
                              {e.student.admission_number}
                            </div>
                            <div className="text-[11px] text-[#6B645D]">
                              {e.student.full_name}
                            </div>
                          </>
                        ) : (
                          <span className="text-[#A0988E]">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-[#6B645D]">
                        {e.student?.class?.name || "—"}
                      </td>
                      <td className="py-2 px-3 text-[#6B645D]">
                        {e.term ? `${e.term.session} T${e.term.term_number}` : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {e.type === "SHARE_DUE" ? (
                          <span className="px-1.5 py-0.5 text-[10px] bg-[#F2F6F3] text-[#3F4E40] border border-[#BACBBF] rounded-sm font-semibold">
                            SHARE_DUE
                          </span>
                        ) : e.type === "REVERSAL" ? (
                          <span className="px-1.5 py-0.5 text-[10px] bg-[#FBEBEB] text-[#671B24] border border-[#E0B4B4] rounded-sm font-semibold">
                            REVERSAL
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] bg-[#EBF3FB] text-[#2B4C7E] border border-[#B4CCE0] rounded-sm font-semibold">
                            SETTLEMENT
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-medium">
                        <span
                          className={
                            e.type === "SHARE_DUE"
                              ? "text-[#3F4E40]"
                              : e.type === "REVERSAL"
                              ? "text-[#671B24]"
                              : "text-[#2B4C7E]"
                          }
                        >
                          {e.type === "REVERSAL" ? "-" : "+"}₦
                          {Number(e.amount).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[#6B645D]">
                        {e.marked_by?.name || e.marked_by?.email || "System"}
                      </td>
                      <td className="py-2 px-3 text-[#6B645D] max-w-xs truncate">
                        {e.reference ? (
                          <div className="font-mono text-[11px] text-[#2C2825]">
                            Ref: {e.reference}
                          </div>
                        ) : null}
                        {e.note ? (
                          <div className="text-[11px] italic text-[#A0988E]">{e.note}</div>
                        ) : null}
                        {!e.reference && !e.note ? "—" : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {ledgerTotal > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t border-[#E9E4D9] text-xs font-mono text-[#6B645D]">
            <div>
              Showing {Math.min((ledgerPage - 1) * ledgerPageSize + 1, ledgerTotal)} to{" "}
              {Math.min(ledgerPage * ledgerPageSize, ledgerTotal)} of {ledgerTotal} entries
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                disabled={ledgerPage <= 1}
                className="px-2.5 py-1 border border-[#D1CCC2] bg-white rounded-sm text-[#2C2825] disabled:opacity-40 hover:bg-[#FAF8F3] cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[#2C2825] font-semibold">
                Page {ledgerPage} of {ledgerTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setLedgerPage((p) => Math.min(ledgerTotalPages, p + 1))}
                disabled={ledgerPage >= ledgerTotalPages}
                className="px-2.5 py-1 border border-[#D1CCC2] bg-white rounded-sm text-[#2C2825] disabled:opacity-40 hover:bg-[#FAF8F3] cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Record Payment Received Modal */}
      {settlementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white border border-[#D1CCC2] rounded-sm max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-3">
              <div>
                <h3 className="text-base font-serif text-[#2C2825]">Record Payment Received</h3>
                <p className="text-xs font-mono text-[#6B645D] mt-0.5">
                  School:{" "}
                  <span className="font-semibold text-[#2C2825]">
                    {schools.find((s) => s.id === settleSchoolId)?.name}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettlementModalOpen(false)}
                className="text-[#6B645D] hover:text-[#2C2825] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitSettlement} className="space-y-3">
              <div>
                <label className="block text-xs font-mono text-[#2C2825] mb-1">
                  Amount Received (NGN) <span className="text-[#671B24]">*</span>:
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  step="0.01"
                  value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full text-xs font-mono p-2 border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#2C2825] mb-1">
                  Payment Date <span className="text-[#671B24]">*</span>:
                </label>
                <input
                  type="date"
                  required
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                  className="w-full text-xs font-mono p-2 border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#2C2825] mb-1">
                  Bank Reference / Teller Number (Optional):
                </label>
                <input
                  type="text"
                  value={settleReference}
                  onChange={(e) => setSettleReference(e.target.value)}
                  placeholder="e.g. GTB/TRF/2026/0491"
                  className="w-full text-xs font-mono p-2 border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#2C2825] mb-1">
                  Notes / Description (Optional):
                </label>
                <textarea
                  rows={2}
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                  placeholder="e.g. 1st installment payment received via direct transfer"
                  className="w-full text-xs font-mono p-2 border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E9E4D9]">
                <button
                  type="button"
                  onClick={() => setSettlementModalOpen(false)}
                  disabled={actionLoading}
                  className="px-3 py-1.5 border border-[#D1CCC2] text-xs font-mono rounded-sm hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-1.5 bg-[#3F4E40] hover:bg-[#2C382D] text-white text-xs font-mono rounded-sm font-medium cursor-pointer disabled:opacity-50"
                >
                  {actionLoading ? "Recording..." : "Confirm & Save Settlement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
