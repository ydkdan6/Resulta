"use client";

import { useState, useEffect } from "react";
import { ShieldCheck, Search, Filter, RefreshCw, Calendar, User, FileText, ChevronDown, ChevronRight } from "lucide-react";

interface AuditLogEntry {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  reason: string | null;
  timestamp: string;
  school?: { id: string; name: string; slug: string } | null;
  user?: { id: string; name: string; email: string; role: string } | null;
}

interface Props {
  portalType: "admin" | "staff";
  schoolId?: string;
  schools?: { id: string; name: string; slug: string }[];
}

export default function AuditLogViewer({ portalType, schoolId, schools = [] }: Props) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchool] = useState<string>(schoolId || "");
  const [selectedAction, setSelectedAction] = useState<string>("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = portalType === "admin" ? "/api/admin/audit-logs" : "/api/staff/audit-logs";
      const params = new URLSearchParams();
      if (portalType === "admin" && selectedSchool) {
        params.set("schoolId", selectedSchool);
      }
      if (selectedAction) {
        params.set("action", selectedAction);
      }
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));

      const res = await fetch(`${endpoint}?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load audit logs");
      }
      const data = await res.json();
      setLogs(data.auditLogs || []);
      setTotal(data.total || 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading audit records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedSchool, selectedAction, page]);

  return (
    <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[#F4F0E6]">
        <div>
          <h2 className="text-base font-serif font-bold text-[#2C2825] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#671B24]" />
            Security & Compliance Audit Trail
          </h2>
          <p className="text-xs text-[#6B645D] mt-0.5">
            Immutable log of system modifications, roster changes, scores, and PIN activities (NDPA compliant)
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-xs border border-[#D9D3C7] bg-[#FAF8F3] hover:bg-[#F0EDE6] text-[#2C2825] cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 py-4 text-xs font-mono">
        {portalType === "admin" && schools.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[#6B645D]">School:</span>
            <select
              value={selectedSchool}
              onChange={(e) => {
                setSelectedSchool(e.target.value);
                setPage(1);
              }}
              className="px-2.5 py-1.5 bg-[#FAF8F3] border border-[#D9D3C7] rounded-xs text-[#2C2825] focus:outline-hidden"
            >
              <option value="">All Schools</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[#6B645D]">Filter Action:</span>
          <select
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-[#FAF8F3] border border-[#D9D3C7] rounded-xs text-[#2C2825] focus:outline-hidden"
          >
            <option value="">All Actions</option>
            <option value="ROSTER_CONFIRM">ROSTER_CONFIRM</option>
            <option value="GENERATE_PINS">GENERATE_PINS</option>
            <option value="REPRINT_PIN">REPRINT_PIN</option>
            <option value="MARK_STUDENTS_PAID">MARK_STUDENTS_PAID</option>
            <option value="CONFIRM_PAYMENT_BATCH">CONFIRM_PAYMENT_BATCH</option>
            <option value="LOCK_RESULT">LOCK_RESULT</option>
            <option value="UNLOCK_SCORES">UNLOCK_SCORES</option>
            <option value="DATA_EXPORT_NDPA">DATA_EXPORT_NDPA</option>
            <option value="DATA_DELETE_STUDENT_NDPA">DATA_DELETE_STUDENT_NDPA</option>
          </select>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-3 bg-[#FDF2F2] border border-[#F8D7DA] text-[#671B24] text-xs rounded-xs mb-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-[#E9E4D9] rounded-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D] font-mono">
              <th className="py-2.5 px-3 w-8"></th>
              <th className="py-2.5 px-3">Timestamp</th>
              <th className="py-2.5 px-3">Action</th>
              {portalType === "admin" && <th className="py-2.5 px-3">School</th>}
              <th className="py-2.5 px-3">Actor</th>
              <th className="py-2.5 px-3">Entity</th>
              <th className="py-2.5 px-3">Reason / Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F4F0E6]">
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-[#6B645D] font-mono">
                  Loading audit logs...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-[#6B645D] font-mono">
                  No audit log records found matching the criteria.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                return (
                  <tr
                    key={log.id}
                    className="hover:bg-[#FAF8F3] transition-colors cursor-pointer"
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  >
                    <td className="py-2.5 px-3 text-[#6B645D]">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#47423D] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-[#2C2825]">
                      <span className="px-2 py-0.5 rounded-xs bg-[#E9E4D9] text-[#47423D] text-[10px]">
                        {log.action}
                      </span>
                    </td>
                    {portalType === "admin" && (
                      <td className="py-2.5 px-3 text-[#47423D]">
                        {log.school?.name || "-"}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-[#47423D]">
                      {log.user ? (
                        <span>
                          {log.user.name}{" "}
                          <span className="text-[#6B645D] font-mono text-[10px]">
                            ({log.user.role})
                          </span>
                        </span>
                      ) : (
                        <span className="text-[#8C827A] italic">System</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[#6B645D]">
                      {log.entity}
                    </td>
                    <td className="py-2.5 px-3 text-[#47423D] max-w-xs truncate">
                      {log.reason ? (
                        <span className="italic">"{log.reason}"</span>
                      ) : log.new_values ? (
                        <span className="font-mono text-[10px] text-[#6B645D]">
                          {JSON.stringify(log.new_values).slice(0, 60)}...
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[#E9E4D9] text-xs font-mono text-[#6B645D]">
          <div>
            Showing {Math.min((page - 1) * pageSize + 1, total)} to{" "}
            {Math.min(page * pageSize, total)} of {total} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="px-2.5 py-1 border border-[#D1CCC2] bg-white rounded-xs text-[#2C2825] disabled:opacity-40 hover:bg-[#FAF8F3] cursor-pointer"
            >
              Previous
            </button>
            <span className="text-[#2C2825] font-semibold">
              Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * pageSize >= total || loading}
              className="px-2.5 py-1 border border-[#D1CCC2] bg-white rounded-xs text-[#2C2825] disabled:opacity-40 hover:bg-[#FAF8F3] cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Expanded details view */}
      {expandedLogId && (
        <div className="mt-4 p-4 bg-[#FAF8F3] border border-[#E9E4D9] rounded-xs text-xs font-mono">
          <div className="flex justify-between items-center mb-2 font-bold text-[#2C2825]">
            <span>Audit Entry Details: {expandedLogId}</span>
            <button
              onClick={() => setExpandedLogId(null)}
              className="text-[#671B24] hover:underline cursor-pointer"
            >
              Close
            </button>
          </div>
          {(() => {
            const activeLog = logs.find((l) => l.id === expandedLogId);
            if (!activeLog) return null;
            return (
              <div className="space-y-2 text-[#47423D]">
                {activeLog.reason && (
                  <div>
                    <span className="text-[#6B645D]">Reason:</span> {activeLog.reason}
                  </div>
                )}
                {activeLog.old_values && (
                  <div>
                    <span className="text-[#6B645D]">Previous Values:</span>
                    <pre className="mt-1 p-2 bg-white border border-[#E9E4D9] rounded-xs overflow-x-auto text-[11px]">
                      {JSON.stringify(activeLog.old_values, null, 2)}
                    </pre>
                  </div>
                )}
                {activeLog.new_values && (
                  <div>
                    <span className="text-[#6B645D]">New / Current Values:</span>
                    <pre className="mt-1 p-2 bg-white border border-[#E9E4D9] rounded-xs overflow-x-auto text-[11px]">
                      {JSON.stringify(activeLog.new_values, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
