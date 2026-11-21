"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Mail,
  Phone,
  Calendar,
  Trash2,
  Download,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

interface WaitlistEntry {
  id: string;
  school_email: string;
  whatsapp_number1: string;
  whatsapp_number2: string | null;
  created_at: string;
}

export default function WaitlistAdminTab() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = encodeURIComponent(searchTerm.trim());
      const res = await fetch(`/api/admin/waitlist${q ? `?q=${q}` : ""}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to load waitlist entries.");
      }
      setEntries(data.entries || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading waitlist.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleDelete = async (id: string, email: string) => {
    if (!window.confirm(`Are you sure you want to remove ${email} from the waitlist?`)) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch("/api/admin/waitlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete entry.");
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setSuccess(`Removed ${email} from waitlist.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to delete entry.");
    } finally {
      setDeletingId(null);
    }
  };

  const exportCSV = () => {
    if (entries.length === 0) return;
    const headers = ["School Email", "Primary WhatsApp", "Secondary WhatsApp", "Submission Date"];
    const rows = entries.map((e) => [
      `"${e.school_email.replace(/"/g, '""')}"`,
      `"${e.whatsapp_number1.replace(/"/g, '""')}"`,
      `"${(e.whatsapp_number2 || "").replace(/"/g, '""')}"`,
      `"${new Date(e.created_at).toLocaleString()}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `resulta-waitlist-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header and Action toolbar */}
      <div className="border border-[#E9E4D9] bg-white rounded-sm">
        <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#671B24]" />
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
              Early Access Waitlist ({entries.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              disabled={entries.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-[#D9D3C7] bg-white text-xs font-mono text-[#2C2825] hover:bg-[#FAF8F3] transition-colors disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#671B24]" />
              Export CSV
            </button>
            <button
              onClick={() => fetchEntries()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-[#671B24] text-white text-xs font-mono hover:bg-[#52151D] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {error && (
          <div className="m-4 p-3.5 bg-[#FBEBEB] border border-[#E0B4B4] rounded-sm text-[#671B24] text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="m-4 p-3.5 bg-[#EBF3EB] border border-[#BBD4BB] rounded-sm text-[#2C482C] text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#3F6B3F]" />
            <span>{success}</span>
          </div>
        )}

        {/* Search input filter */}
        <div className="p-4 border-b border-[#E9E4D9] bg-white">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#8C847B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by school email or WhatsApp number..."
              className="w-full pl-9 pr-3 py-2 bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-xs font-mono text-[#2C2825] focus:outline-hidden focus:border-[#671B24]"
            />
          </div>
        </div>

        {/* Entries Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                <th className="py-3 px-5">#</th>
                <th className="py-3 px-5">School Email</th>
                <th className="py-3 px-5">Primary WhatsApp</th>
                <th className="py-3 px-5">Secondary WhatsApp</th>
                <th className="py-3 px-5">Registered At</th>
                <th className="py-3 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#6B645D] font-mono">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#671B24]" />
                    Loading waitlist submissions...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[#6B645D] font-mono">
                    No waitlist submissions found{searchTerm ? " matching your search" : ""}.
                  </td>
                </tr>
              ) : (
                entries.map((entry, index) => {
                  const rawWa1 = entry.whatsapp_number1.replace(/\D/g, "");
                  const rawWa2 = entry.whatsapp_number2 ? entry.whatsapp_number2.replace(/\D/g, "") : null;

                  return (
                    <tr key={entry.id} className="border-b border-[#F4F0E6] hover:bg-[#FAF8F3] transition-colors">
                      <td className="py-3 px-5 text-[#8C847B] font-mono">{index + 1}</td>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-[#671B24]" />
                          <span className="font-mono font-medium text-[#2C2825]">{entry.school_email}</span>
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="font-mono text-[#2C2825]">{entry.whatsapp_number1}</span>
                          {rawWa1 && (
                            <a
                              href={`https://wa.me/${rawWa1}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Chat on WhatsApp"
                              className="text-[11px] font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-xs inline-flex items-center gap-1"
                            >
                              <MessageSquare className="w-3 h-3" /> Chat
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-5">
                        {entry.whatsapp_number2 ? (
                          <div className="flex items-center gap-2">
                            <Phone className="w-3.5 h-3.5 text-[#6B645D]" />
                            <span className="font-mono text-[#2C2825]">{entry.whatsapp_number2}</span>
                            {rawWa2 && (
                              <a
                                href={`https://wa.me/${rawWa2}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Chat on WhatsApp"
                                className="text-[11px] font-mono text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded-xs inline-flex items-center gap-1"
                              >
                                <MessageSquare className="w-3 h-3" /> Chat
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono text-[#A0988E] italic">—</span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-[#6B645D] font-mono text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3 h-3 text-[#A0988E]" />
                          {new Date(entry.created_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          onClick={() => handleDelete(entry.id, entry.school_email)}
                          disabled={deletingId === entry.id}
                          className="inline-flex items-center gap-1 text-[11px] font-mono text-red-700 hover:text-red-900 px-2 py-1 rounded hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-40"
                          title="Delete submission"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
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
    </div>
  );
}
