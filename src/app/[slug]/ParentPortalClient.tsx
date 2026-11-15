"use client";

import { useState, useEffect } from "react";
import {
  GraduationCap,
  Download,
  LogOut,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Calendar,
  BookOpen,
  Send,
  X,
  FileText
} from "lucide-react";

interface SubjectResult {
  subject: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
}

interface TermReport {
  id: string;
  name: string;
  session: string;
  term_number: number;
  is_current: boolean;
  subjects: SubjectResult[];
}

interface Props {
  schoolSlug: string;
  schoolName: string;
  schoolLogo: string | null;
}

export default function ParentPortalClient({
  schoolSlug,
  schoolName,
  schoolLogo,
}: Props) {
  // Session & Login State
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form Fields
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [pin, setPin] = useState("");

  // Result Data
  const [student, setStudent] = useState<{
    admission_number: string;
    full_name: string;
    class?: { name: string };
  } | null>(null);
  const [terms, setTerms] = useState<TermReport[]>([]);
  const [activeTermId, setActiveTermId] = useState<string>("");

  // Problem Report Form State
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [problemAdmNo, setProblemAdmNo] = useState("");
  const [problemMessage, setProblemMessage] = useState("");
  const [problemSuccess, setProblemSuccess] = useState<string | null>(null);
  const [problemSubmitting, setProblemSubmitting] = useState(false);

  // Load parent results on mount if cookie exists
  const loadResults = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch("/api/parent/results");
      if (res.ok) {
        const data = await res.json();
        setStudent(data.student);
        setTerms(data.terms || []);
        if (data.terms && data.terms.length > 0) {
          // Current term first
          const current = data.terms.find((t: TermReport) => t.is_current) || data.terms[0];
          setActiveTermId(current.id);
        }
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    } catch {
      setIsLoggedIn(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadResults();
  }, []);

  // Handle Login Submit
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/parent/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolSlug,
          admissionNumber: admissionNumber.trim(),
          pin: pin.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Invalid admission number or PIN.");
      }

      // Load results after successful login
      await loadResults();
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    try {
      await fetch("/api/parent/logout", { method: "POST" });
    } finally {
      setIsLoggedIn(false);
      setStudent(null);
      setTerms([]);
      setPin("");
    }
  };

  // Handle Problem Report
  const handleSendProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!problemMessage.trim() || !problemAdmNo.trim()) return;

    try {
      setProblemSubmitting(true);
      const res = await fetch("/api/parent/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolSlug,
          studentAdmissionNumber: problemAdmNo.trim(),
          message: problemMessage.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit report.");

      setProblemSuccess("Your report has been sent to the school administration.");
      setProblemMessage("");
      setTimeout(() => {
        setShowProblemModal(false);
        setProblemSuccess(null);
      }, 2500);
    } catch (err: unknown) {
      setErrorMsg((err as Error).message);
    } finally {
      setProblemSubmitting(false);
    }
  };

  const selectedTerm = terms.find((t) => t.id === activeTermId) || terms[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#3F4E40] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono text-[#6B645D]">Loading parent portal...</p>
        </div>
      </div>
    );
  }

  // --- STATE 1: LOGIN SCREEN (Mobile-first) ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] flex flex-col justify-between p-4 sm:p-6">
        <div className="max-w-md w-full mx-auto my-auto py-8">
          {/* School Header */}
          <div className="text-center mb-8">
            {schoolLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={schoolLogo}
                alt={`${schoolName} logo`}
                className="h-16 w-auto mx-auto mb-3 object-contain"
              />
            ) : (
              <div className="w-14 h-14 bg-[#3F4E40] text-white rounded-full flex items-center justify-center mx-auto mb-3">
                <GraduationCap className="w-7 h-7" />
              </div>
            )}
            <h1 className="text-2xl font-serif font-bold text-[#2C2825]">{schoolName}</h1>
            <p className="text-xs font-mono text-[#6B645D] mt-1">Student Results Portal</p>
          </div>

          {/* Login Card */}
          <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-sm">
            <h2 className="text-base font-serif text-[#2C2825] mb-1">Check Report Card</h2>
            <p className="text-xs font-mono text-[#6B645D] mb-5">
              Enter your student admission number and 10-character PIN.
            </p>

            {errorMsg && (
              <div className="mb-4 p-3 bg-[#FBEBEB] border border-[#E0B4B4] rounded-sm text-[#671B24] text-xs font-mono flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">{errorMsg}</div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-[#2C2825] mb-1">
                  Admission Number
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ADM/2026/001"
                  value={admissionNumber}
                  onChange={(e) => setAdmissionNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-[#2C2825] mb-1">
                  10-Character PIN
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter PIN from card"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-[#D1CCC2] rounded-sm focus:outline-none focus:border-[#3F4E40]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono font-medium rounded-sm disabled:opacity-50 transition-colors"
              >
                {submitting ? "Verifying PIN..." : "Access Report Card"}
              </button>
            </form>

            {/* Problem Report Link */}
            <div className="mt-5 pt-4 border-t border-[#E9E4D9] text-center">
              <button
                type="button"
                onClick={() => {
                  setProblemAdmNo(admissionNumber);
                  setShowProblemModal(true);
                }}
                className="text-xs font-mono text-[#6B645D] hover:text-[#2C2825] underline inline-flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" /> Report a problem (e.g. missing card)
              </button>
            </div>
          </div>
        </div>

        {/* Problem Modal */}
        {showProblemModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white border border-[#D1CCC2] rounded-sm max-w-sm w-full p-5 space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-[#E9E4D9] pb-3">
                <h3 className="text-sm font-serif font-bold text-[#2C2825]">Report a Problem</h3>
                <button
                  type="button"
                  onClick={() => setShowProblemModal(false)}
                  className="text-[#6B645D] hover:text-[#2C2825]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {problemSuccess ? (
                <div className="p-4 bg-[#F2F6F3] border border-[#BACBBF] rounded-sm text-xs font-mono text-[#3F4E40] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <div>{problemSuccess}</div>
                </div>
              ) : (
                <form onSubmit={handleSendProblem} className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-[#2C2825] mb-1">
                      Student Admission Number
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. ADM001"
                      value={problemAdmNo}
                      onChange={(e) => setProblemAdmNo(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D1CCC2] rounded-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-[#2C2825] mb-1">
                      What problem did you encounter?
                    </label>
                    <textarea
                      required
                      rows={3}
                      placeholder="e.g. I have paid school fees but have not received my PIN card."
                      value={problemMessage}
                      onChange={(e) => setProblemMessage(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs font-mono border border-[#D1CCC2] rounded-sm"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowProblemModal(false)}
                      className="px-3 py-1.5 border border-[#D1CCC2] text-xs font-mono rounded-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={problemSubmitting}
                      className="px-3 py-1.5 bg-[#3F4E40] text-white text-xs font-mono rounded-sm flex items-center gap-1 font-medium disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      {problemSubmitting ? "Sending..." : "Submit to School"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-[11px] font-mono text-[#6B645D]">
          Protected parent results portal • Session automatically ends after 30 minutes
        </footer>
      </div>
    );
  }

  // --- STATE 2: AUTHENTICATED DASHBOARD & REPORT CARD (Mobile-first) ---
  return (
    <div className="min-h-screen bg-[#FAF8F3] flex flex-col justify-between">
      {/* Top Mobile-First Navbar */}
      <header className="bg-white border-b border-[#E9E4D9] sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {schoolLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={schoolLogo} alt="logo" className="h-8 w-auto object-contain" />
            ) : (
              <div className="w-7 h-7 bg-[#3F4E40] text-white rounded-full flex items-center justify-center">
                <GraduationCap className="w-4 h-4" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-serif font-bold text-[#2C2825] leading-none">{schoolName}</h1>
              <p className="text-[10px] font-mono text-[#6B645D] mt-0.5">Parent Result Portal</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="px-2.5 py-1 border border-[#D1CCC2] bg-[#FAF8F3] text-xs font-mono text-[#671B24] rounded-sm hover:bg-gray-100 flex items-center gap-1"
          >
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-4xl w-full mx-auto px-4 py-6 space-y-6 flex-1">
        {/* Student Profile Card */}
        <div className="bg-white border border-[#E9E4D9] rounded-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-[11px] font-mono text-[#6B645D]">STUDENT ACADEMIC RECORD</div>
            <h2 className="text-xl font-serif text-[#2C2825] font-bold mt-0.5">
              {student?.full_name}
            </h2>
            <div className="text-xs font-mono text-[#6B645D] mt-1 space-x-3">
              <span>Admission No: <strong className="text-[#2C2825]">{student?.admission_number}</strong></span>
              {student?.class?.name && (
                <span>Class: <strong className="text-[#2C2825]">{student.class.name}</strong></span>
              )}
            </div>
          </div>

          {selectedTerm && (
            <a
              href={`/api/parent/report-pdf?termId=${selectedTerm.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono rounded-sm font-medium flex items-center justify-center gap-1.5 shrink-0"
            >
              <Download className="w-3.5 h-3.5" /> Download Report Card PDF
            </a>
          )}
        </div>

        {/* Academic Terms Navigation */}
        <div className="space-y-2">
          <div className="text-xs font-mono text-[#6B645D] font-medium">AVAILABLE PUBLISHED TERMS:</div>
          <div className="flex flex-wrap gap-2">
            {terms.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTermId(t.id)}
                className={`px-3.5 py-2 text-xs font-mono rounded-sm border transition-colors ${
                  t.id === activeTermId
                    ? "bg-[#3F4E40] text-white border-[#3F4E40] font-bold shadow-xs"
                    : "bg-white text-[#2C2825] border-[#D1CCC2] hover:bg-gray-50"
                }`}
              >
                {t.name} {t.is_current && "(Current)"}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Term Report Card Table */}
        {selectedTerm ? (
          <div className="bg-white border border-[#E9E4D9] rounded-sm overflow-hidden shadow-xs">
            {/* Header info */}
            <div className="p-4 bg-[#FAF8F3] border-b border-[#E9E4D9] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-serif font-bold text-[#2C2825]">
                  Official Grades: {selectedTerm.name}
                </h3>
                <p className="text-[11px] font-mono text-[#6B645D] mt-0.5">
                  Academic Session: {selectedTerm.session}
                </p>
              </div>
              <span className="text-[11px] font-mono px-2 py-0.5 bg-[#F2F6F3] text-[#3F4E40] border border-[#BACBBF] rounded-sm">
                Published
              </span>
            </div>

            {/* Results Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#FAF8F3] border-b border-[#E9E4D9] text-[#6B645D]">
                  <tr>
                    <th className="py-2.5 px-3">Subject</th>
                    <th className="py-2.5 px-3 text-center">CA (40)</th>
                    <th className="py-2.5 px-3 text-center">Exam (60)</th>
                    <th className="py-2.5 px-3 text-center">Total (100)</th>
                    <th className="py-2.5 px-3 text-center">Grade</th>
                    <th className="py-2.5 px-3">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E9E4D9]">
                  {selectedTerm.subjects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-[#6B645D]">
                        No subject scores recorded for this term.
                      </td>
                    </tr>
                  ) : (
                    selectedTerm.subjects.map((s, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-semibold text-[#2C2825]">{s.subject}</td>
                        <td className="py-2.5 px-3 text-center text-[#6B645D]">
                          {s.ca_score !== null ? s.ca_score : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center text-[#6B645D]">
                          {s.exam_score !== null ? s.exam_score : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-[#2C2825]">
                          {s.total !== null ? s.total : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold text-[#3F4E40]">
                          {s.grade || "-"}
                        </td>
                        <td className="py-2.5 px-3 text-[#6B645D]">{s.remark || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary metrics footer */}
            {selectedTerm.subjects.length > 0 && (
              <div className="p-3 bg-[#FAF8F3] border-t border-[#E9E4D9] flex flex-wrap items-center justify-between text-xs font-mono text-[#6B645D]">
                <div>Total Subjects Taken: <strong className="text-[#2C2825]">{selectedTerm.subjects.length}</strong></div>
                <div>
                  Average Score:{" "}
                  <strong className="text-[#3F4E40]">
                    {(
                      selectedTerm.subjects.reduce((sum, s) => sum + (s.total || 0), 0) /
                      selectedTerm.subjects.length
                    ).toFixed(1)}
                    %
                  </strong>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center bg-white border border-[#E9E4D9] rounded-sm text-xs font-mono text-[#6B645D]">
            No published results available for your card.
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E9E4D9] bg-white py-4 px-4 text-center text-[11px] font-mono text-[#6B645D]">
        Resulta Parent Results System • Session ends automatically after 30 minutes of inactivity
      </footer>
    </div>
  );
}
