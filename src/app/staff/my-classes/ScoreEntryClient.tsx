"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import {
  Lock,
  Unlock,
  CheckCircle,
  AlertCircle,
  Download,
  Upload,
  Save,
  ChevronRight,
  ArrowLeft,
  RefreshCw,
  FileSpreadsheet,
  AlertTriangle,
  Search,
  Trash2,
  X,
  RotateCcw,
} from "lucide-react";

interface Student {
  id: string;
  admission_number: string;
  full_name: string;
  status: string;
  department_id?: string | null;
  department?: {
    id: string;
    name: string;
  } | null;
}

interface Part {
  name: string;
  max: number;
}

interface Boundary {
  grade: string;
  min: number;
  max: number;
  remark: string;
}

interface GradingScheme {
  id?: string;
  name?: string;
  parts: Part[];
  boundaries: Boundary[];
}

interface Term {
  id: string;
  session: string;
  term_number: number;
  status: "DRAFT" | "PUBLISHED";
  name: string;
  is_open: boolean;
}

interface AssignedSubject {
  id: string;
  name: string;
  code: string | null;
}

export interface AssignedClass {
  id: string;
  name: string;
  studentCount?: number;
  subjects: AssignedSubject[];
}

interface ResultRecord {
  id: string;
  student_id: string;
  ca_score: number | string | null;
  exam_score: number | string | null;
  total: number | string | null;
  grade: string | null;
  remark: string | null;
  status: "DRAFT" | "SUBMITTED";
  updated_at?: string;
}

interface ScoreRowState {
  student_id: string;
  admission_number: string;
  full_name: string;
  scores: Record<string, string>; // part name -> raw input string
}

interface ToastState {
  id: number;
  title: string;
  message: string;
  type: "success" | "error" | "info";
}

interface Props {
  initialClasses?: AssignedClass[];
  currentUserRole?: string;
  currentUserId?: string;
  schoolName?: string;
  defaultClassId?: string;
  defaultSubjectId?: string;
  defaultTermId?: string;
}

export default function ScoreEntryClient({
  initialClasses = [],
  currentUserRole = "teacher",
  schoolName,
  defaultClassId,
  defaultSubjectId,
  defaultTermId,
}: Props) {
  // Navigation & selection state
  const [classes, setClasses] = useState<AssignedClass[]>(initialClasses);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId || "");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(defaultSubjectId || "");
  const [selectedTermId, setSelectedTermId] = useState<string>(defaultTermId || "");

  // Data fetching state
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingScores, setLoadingScores] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Loaded score sheet state
  const [scheme, setScheme] = useState<GradingScheme | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<string>(currentUserRole);
  const [scoreRows, setScoreRows] = useState<ScoreRowState[]>([]);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartmentFilter, setSelectedDepartmentFilter] = useState<string>("ALL");

  // Multi-selection state for row deletion
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // Two-step review state: 'edit' | 'review_step1' | 'review_step2'
  const [reviewStep, setReviewStep] = useState<"edit" | "review_step1" | "review_step2">("edit");
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);

  // Unlock modal state for school_admin
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");

  // File upload ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to show floating toast notifications
  const showToast = (title: string, message: string, type: "success" | "error" | "info" = "success") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    const newToast: ToastState = { id: Date.now(), title, message, type };
    setToast(newToast);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  };

  // Synchronize when parent passes specific default targets
  useEffect(() => {
    if (defaultClassId) setSelectedClassId(defaultClassId);
    if (defaultSubjectId) setSelectedSubjectId(defaultSubjectId);
    if (defaultTermId) setSelectedTermId(defaultTermId);
  }, [defaultClassId, defaultSubjectId, defaultTermId]);

  // 1. Fetch initial classes (if not passed) & terms and restore saved selection from localStorage
  useEffect(() => {
    async function loadBootstrap() {
      setLoadingInitial(true);
      try {
        let loadedClasses = classes;
        if (loadedClasses.length === 0) {
          const res = await fetch("/api/staff/my-classes");
          if (res.ok) {
            const data = await res.json();
            if (data.classes) {
              loadedClasses = data.classes;
              setClasses(data.classes);
            }
          }
        }

        let loadedTerms: Term[] = [];
        const termsRes = await fetch("/api/staff/terms");
        if (termsRes.ok) {
          const termsData = await termsRes.json();
          loadedTerms = termsData.terms || [];
          setTerms(loadedTerms);
        }

        // Try restoring last user selection from localStorage so page refreshes don't lose the view
        let restoredClass = defaultClassId || "";
        let restoredSubject = defaultSubjectId || "";
        let restoredTerm = defaultTermId || "";

        if (!restoredClass) {
          try {
            const saved = localStorage.getItem("resulta_last_score_selection");
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.classId && loadedClasses.some((c) => c.id === parsed.classId)) {
                restoredClass = parsed.classId;
                const matchedClass = loadedClasses.find((c) => c.id === parsed.classId);
                if (matchedClass && parsed.subjectId && matchedClass.subjects.some((s) => s.id === parsed.subjectId)) {
                  restoredSubject = parsed.subjectId;
                }
              }
              if (parsed.termId && loadedTerms.some((t) => t.id === parsed.termId)) {
                restoredTerm = parsed.termId;
              }
            }
          } catch (e) {}
        }

        // Fallbacks if no stored selection
        if (!restoredClass && loadedClasses.length === 1) {
          restoredClass = loadedClasses[0].id;
          if (loadedClasses[0].subjects.length > 0) {
            restoredSubject = loadedClasses[0].subjects[0].id;
          }
        }

        if (!restoredTerm && loadedTerms.length > 0) {
          const openTerm = loadedTerms.find((t) => t.is_open);
          restoredTerm = openTerm ? openTerm.id : loadedTerms[0].id;
        }

        if (restoredClass) setSelectedClassId(restoredClass);
        if (restoredSubject) setSelectedSubjectId(restoredSubject);
        if (restoredTerm) setSelectedTermId(restoredTerm);
      } catch (err: any) {
        console.error("Failed to load initial data:", err);
      } finally {
        setLoadingInitial(false);
      }
    }
    loadBootstrap();
  }, []);

  // Persist selected dropdowns in localStorage whenever selection changes
  useEffect(() => {
    if (selectedClassId && selectedSubjectId && selectedTermId) {
      try {
        localStorage.setItem(
          "resulta_last_score_selection",
          JSON.stringify({
            classId: selectedClassId,
            subjectId: selectedSubjectId,
            termId: selectedTermId,
          })
        );
      } catch (e) {}
    }
  }, [selectedClassId, selectedSubjectId, selectedTermId]);

  // Update available subjects when class changes
  const availableSubjects = useMemo(() => {
    const cls = classes.find((c) => c.id === selectedClassId);
    return cls ? cls.subjects : [];
  }, [classes, selectedClassId]);

  // Auto-select subject when class changes
  useEffect(() => {
    if (availableSubjects.length > 0) {
      if (!availableSubjects.some((s) => s.id === selectedSubjectId)) {
        setSelectedSubjectId(availableSubjects[0].id);
      }
    } else {
      setSelectedSubjectId("");
    }
  }, [availableSubjects, selectedSubjectId]);

  // 2. Fetch scores when Class, Subject, and Term are selected
  const fetchScores = async (classId: string, subjectId: string, termId: string) => {
    if (!classId || !subjectId || !termId) return;

    setLoadingScores(true);
    setErrorMessage(null);
    setReviewStep("edit");
    setSelectedStudentIds(new Set());

    try {
      const url = `/api/staff/scores?classId=${encodeURIComponent(classId)}&subjectId=${encodeURIComponent(subjectId)}&termId=${encodeURIComponent(termId)}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Failed to load score data.");
        return;
      }

      setScheme(data.scheme);
      setStudents(data.students || []);
      setIsLocked(Boolean(data.isLocked));
      if (data.userRole) setUserRole(data.userRole);

      // Check localStorage for any local draft for this assignment
      const draftStorageKey = `resulta_draft_${classId}_${subjectId}_${termId}`;
      let localDraftMap: Record<string, Record<string, string>> = {};
      try {
        const cached = localStorage.getItem(draftStorageKey);
        if (cached) {
          localDraftMap = JSON.parse(cached);
        }
      } catch (e) {}

      // Map existing results to score row states
      const resultsMap = new Map<string, ResultRecord>();
      for (const r of data.results || []) {
        resultsMap.set(r.student_id, r);
      }

      const rows: ScoreRowState[] = (data.students || []).map((s: Student) => {
        const existing = resultsMap.get(s.id);
        const scoresMap: Record<string, string> = {};
        const localStudentDraft = localDraftMap[s.id] || localDraftMap[s.admission_number];

        if (data.scheme?.parts) {
          const parts = data.scheme.parts;
          const examParts = parts.filter((p: any) => p.name.toLowerCase().includes("exam"));
          const caParts = parts.filter((p: any) => !p.name.toLowerCase().includes("exam"));

          for (const p of parts) {
            // First check local uncommitted draft (only if scores are not locked)
            const localVal = !data.isLocked ? localStudentDraft?.[p.name] : undefined;
            if (localVal !== undefined && localVal !== null && localVal !== "") {
              scoresMap[p.name] = String(localVal);
            } else if (existing) {
              const isExam = p.name.toLowerCase().includes("exam");
              if (isExam) {
                // If there's only 1 exam part, map the whole exam_score. If multiple, only map to the first part to prevent multiplying/summing.
                if (examParts.length === 1 || examParts[0].name === p.name) {
                  scoresMap[p.name] =
                    existing.exam_score !== null && existing.exam_score !== undefined
                      ? String(Number(existing.exam_score))
                      : "";
                } else {
                  scoresMap[p.name] = "";
                }
              } else {
                // If there's only 1 CA part, map the whole ca_score. If multiple, only map to the first part to prevent multiplying/summing.
                if (caParts.length === 1 || caParts[0].name === p.name) {
                  scoresMap[p.name] =
                    existing.ca_score !== null && existing.ca_score !== undefined
                      ? String(Number(existing.ca_score))
                      : "";
                } else {
                  scoresMap[p.name] = "";
                }
              }
            } else {
              scoresMap[p.name] = "";
            }
          }
        }

        return {
          student_id: s.id,
          admission_number: s.admission_number,
          full_name: s.full_name,
          scores: scoresMap,
        };
      });

      setScoreRows(rows);
    } catch (err: any) {
      setErrorMessage(err.message || "Network error loading scores.");
    } finally {
      setLoadingScores(false);
    }
  };

  useEffect(() => {
    if (selectedClassId && selectedSubjectId && selectedTermId) {
      fetchScores(selectedClassId, selectedSubjectId, selectedTermId);
    }
  }, [selectedClassId, selectedSubjectId, selectedTermId]);

  // Student map to resolve departments
  const studentMap = useMemo(() => {
    return new Map(students.map((s) => [s.id, s]));
  }, [students]);

  // Available departments in currently loaded class
  const availableDepartments = useMemo(() => {
    const depts = new Map<string, string>();
    for (const s of students) {
      if (s.department_id && s.department?.name) {
        depts.set(s.department_id, s.department.name);
      }
    }
    return Array.from(depts.entries()).map(([id, name]) => ({ id, name }));
  }, [students]);

  // Filtered rows based on search query and department filter
  const filteredScoreRows = useMemo(() => {
    let rows = scoreRows;

    // Apply department filter
    if (selectedDepartmentFilter !== "ALL") {
      if (selectedDepartmentFilter === "NONE") {
        rows = rows.filter((r) => {
          const st = studentMap.get(r.student_id);
          return !st?.department_id;
        });
      } else {
        rows = rows.filter((r) => {
          const st = studentMap.get(r.student_id);
          return st?.department_id === selectedDepartmentFilter;
        });
      }
    }

    // Apply search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.admission_number.toLowerCase().includes(q) ||
          r.full_name.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [scoreRows, searchQuery, selectedDepartmentFilter, studentMap]);

  // Multi-selection handlers
  const handleToggleSelectAll = () => {
    if (isLocked) return;
    const allFilteredIds = filteredScoreRows.map((r) => r.student_id);
    const areAllSelected = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedStudentIds.has(id));

    if (areAllSelected) {
      // Unselect all currently filtered
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.delete(id);
        return next;
      });
    } else {
      // Select all currently filtered
      setSelectedStudentIds((prev) => {
        const next = new Set(prev);
        for (const id of allFilteredIds) next.add(id);
        return next;
      });
    }
  };

  const handleToggleSelectStudent = (studentId: string) => {
    if (isLocked) return;
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  // Delete / Clear selected student records
  const handleDeleteSelected = async () => {
    if (selectedStudentIds.size === 0 || isLocked) return;
    setActionLoading(true);
    setErrorMessage(null);

    const idsToDelete = Array.from(selectedStudentIds);

    try {
      const res = await fetch("/api/staff/scores/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          termId: selectedTermId,
          studentIds: idsToDelete,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to clear scores for selected students.");
        return;
      }

      // Clear the scores locally in state
      const updatedRows = scoreRows.map((row) => {
        if (selectedStudentIds.has(row.student_id)) {
          const clearedScores: Record<string, string> = {};
          if (scheme?.parts) {
            for (const p of scheme.parts) clearedScores[p.name] = "";
          }
          return { ...row, scores: clearedScores };
        }
        return row;
      });

      setScoreRows(updatedRows);

      // Update localStorage draft cache
      if (selectedClassId && selectedSubjectId && selectedTermId) {
        try {
          const draftStorageKey = `resulta_draft_${selectedClassId}_${selectedSubjectId}_${selectedTermId}`;
          const saveObj: Record<string, Record<string, string>> = {};
          for (const row of updatedRows) {
            saveObj[row.student_id] = row.scores;
          }
          localStorage.setItem(draftStorageKey, JSON.stringify(saveObj));
        } catch (e) {}
      }

      setSelectedStudentIds(new Set());
      setShowDeleteConfirmModal(false);
      showToast(
        "Scores Cleared",
        `Successfully cleared scores for ${idsToDelete.length} student(s).`,
        "success"
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete score records.");
    } finally {
      setActionLoading(false);
    }
  };

  // Helper: Live calculation of Total, Grade, and Remark for a given row
  const calculateRowEvaluation = (row: ScoreRowState) => {
    if (!scheme) return { total: 0, grade: "-", remark: "-" };

    let total = 0;
    let hasAnyEntered = false;

    for (const part of scheme.parts) {
      const raw = row.scores[part.name];
      if (raw !== undefined && raw !== null && raw.trim() !== "") {
        const val = parseFloat(raw);
        if (!isNaN(val)) {
          total += Math.min(Math.max(val, 0), part.max);
          hasAnyEntered = true;
        }
      }
    }

    if (!hasAnyEntered) {
      return { total: 0, grade: "-", remark: "-" };
    }

    const boundary = scheme.boundaries.find(
      (b) => total >= b.min && total <= b.max
    );

    return {
      total,
      grade: boundary?.grade || "-",
      remark: boundary?.remark || "-",
    };
  };

  // Handle score input change and auto-save draft locally
  const handleScoreChange = (studentId: string, partName: string, value: string) => {
    if (isLocked) return;
    setScoreRows((prev) => {
      const updated = prev.map((r) =>
        r.student_id === studentId
          ? {
              ...r,
              scores: { ...r.scores, [partName]: value },
            }
          : r
      );

      // Debounced auto-save in localStorage so progress is preserved without blocking the main UI thread
      if (selectedClassId && selectedSubjectId && selectedTermId) {
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = setTimeout(() => {
          try {
            const draftStorageKey = `resulta_draft_${selectedClassId}_${selectedSubjectId}_${selectedTermId}`;
            const saveObj: Record<string, Record<string, string>> = {};
            for (const row of updated) {
              saveObj[row.student_id] = row.scores;
            }
            localStorage.setItem(draftStorageKey, JSON.stringify(saveObj));
          } catch (e) {}
        }, 400);
      }

      return updated;
    });
  };

  // Helper to validate client-side before sending
  const validateClientRows = (isSubmission: boolean): string[] => {
    if (!scheme) return ["Grading scheme not loaded."];
    const errors: string[] = [];

    for (let i = 0; i < scoreRows.length; i++) {
      const row = scoreRows[i];
      for (const part of scheme.parts) {
        const raw = row.scores[part.name];
        if (raw === undefined || raw === null || raw.trim() === "") {
          if (isSubmission) {
            errors.push(
              `Student ${row.full_name} (${row.admission_number}) is missing a score for "${part.name}".`
            );
          }
          continue;
        }

        const num = parseFloat(raw);
        if (isNaN(num)) {
          errors.push(
            `Student ${row.full_name} (${row.admission_number}): "${raw}" is not a valid score for "${part.name}".`
          );
        } else if (num < 0) {
          errors.push(
            `Student ${row.full_name} (${row.admission_number}): Score cannot be negative for "${part.name}".`
          );
        } else if (num > part.max) {
          errors.push(
            `Student ${row.full_name} (${row.admission_number}): Score ${num} exceeds maximum of ${part.max} for "${part.name}".`
          );
        }
      }
    }

    return errors;
  };

  // 3. Save Draft
  const handleSaveDraft = async () => {
    if (isLocked) return;
    setErrorMessage(null);

    const clientErrors = validateClientRows(false);
    if (clientErrors.length > 0) {
      setErrorMessage(clientErrors.slice(0, 5).join(" | "));
      showToast("Validation Warning", "Please check your entered scores.", "error");
      return;
    }

    setActionLoading(true);
    try {
      const payload = {
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        termId: selectedTermId,
        scores: scoreRows.map((r) => ({
          student_id: r.student_id,
          admission_number: r.admission_number,
          scores: r.scores,
        })),
      };

      const res = await fetch("/api/staff/scores/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || (data.details ? data.details.join(", ") : "Failed to save draft."));
        showToast("Save Failed", data.error || "Failed to save draft.", "error");
        return;
      }

      // Persist in localStorage draft cache as well
      if (selectedClassId && selectedSubjectId && selectedTermId) {
        try {
          const draftStorageKey = `resulta_draft_${selectedClassId}_${selectedSubjectId}_${selectedTermId}`;
          const saveObj: Record<string, Record<string, string>> = {};
          for (const row of scoreRows) {
            saveObj[row.student_id] = row.scores;
          }
          localStorage.setItem(draftStorageKey, JSON.stringify(saveObj));
        } catch (e) {}
      }

      const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      showToast(
        "Draft Saved Successfully",
        `Progress saved at ${timeStr}. Your scores are safely stored and will restore automatically on refresh.`,
        "success"
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save draft.");
      showToast("Error", err.message || "Failed to save draft.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // 4. Two-Step Review Flow:
  const handleProceedToFirstReview = () => {
    setErrorMessage(null);
    const clientErrors = validateClientRows(true);
    if (clientErrors.length > 0) {
      setErrorMessage(
        `Please resolve validation issues before review: ${clientErrors.slice(0, 3).join("; ")}`
      );
      showToast("Submission Incomplete", "All active students must have complete scores before review.", "error");
      return;
    }
    setReviewStep("review_step1");
  };

  const handleProceedToSecondReview = () => {
    setSubmissionConfirmed(false);
    setReviewStep("review_step2");
  };

  // Final Submit
  const handleFinalSubmit = async () => {
    if (!submissionConfirmed) {
      setErrorMessage("Please check the confirmation box certifying the scores have been reviewed twice.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const payload = {
        classId: selectedClassId,
        subjectId: selectedSubjectId,
        termId: selectedTermId,
        confirmed: true,
        scores: scoreRows.map((r) => ({
          student_id: r.student_id,
          admission_number: r.admission_number,
          scores: r.scores,
        })),
      };

      const res = await fetch("/api/staff/scores/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || (data.details ? data.details.join("; ") : "Submission failed."));
        showToast("Submission Failed", data.error || "Submission failed.", "error");
        setReviewStep("edit");
        return;
      }

      // Clear local draft cache now that official lock is in place
      try {
        localStorage.removeItem(`resulta_draft_${selectedClassId}_${selectedSubjectId}_${selectedTermId}`);
      } catch (e) {}

      showToast("Scores Submitted & Locked", "Scores have been submitted and locked successfully.", "success");
      setIsLocked(true);
      setReviewStep("edit");
      await fetchScores(selectedClassId, selectedSubjectId, selectedTermId);
    } catch (err: any) {
      setErrorMessage(err.message || "Submission failed.");
      showToast("Error", err.message || "Submission failed.", "error");
    } finally {
      setActionLoading(false);
    }
  };

  // 5. School Admin Unlock Handler
  const handleUnlockScores = async () => {
    if (!unlockReason.trim()) {
      setErrorMessage("A reason is required to unlock scores.");
      return;
    }

    setActionLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/staff/scores/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: selectedClassId,
          subjectId: selectedSubjectId,
          termId: selectedTermId,
          reason: unlockReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Failed to unlock scores.");
        showToast("Unlock Failed", data.error || "Failed to unlock scores.", "error");
        return;
      }

      setShowUnlockModal(false);
      setUnlockReason("");
      showToast("Scores Unlocked", data.message || "Scores unlocked successfully.", "success");
      setIsLocked(false);
      await fetchScores(selectedClassId, selectedSubjectId, selectedTermId);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to unlock scores.");
    } finally {
      setActionLoading(false);
    }
  };

  // 6. CSV File Upload Parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLocked) return;
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors && results.errors.length > 0) {
          setErrorMessage(`CSV Parsing error: ${results.errors[0].message}`);
          showToast("CSV Error", results.errors[0].message, "error");
          return;
        }

        const rows = results.data;
        if (!rows || rows.length === 0) {
          setErrorMessage("Uploaded CSV file contains no data rows.");
          showToast("Empty CSV", "Uploaded CSV file contains no data rows.", "error");
          return;
        }

        if (!scheme) {
          setErrorMessage("Grading scheme not loaded.");
          return;
        }

        // Match rows with current students by admission_number
        const uploadedAdmMap = new Map<string, Record<string, string>>();
        for (const r of rows) {
          const adm = (r.admission_number || r["Admission Number"] || r["admission number"] || "").trim().toUpperCase();
          if (adm) {
            uploadedAdmMap.set(adm, r);
          }
        }

        let updatedCount = 0;
        const newScoreRows = scoreRows.map((existingRow) => {
          const normAdm = existingRow.admission_number.trim().toUpperCase();
          const match = uploadedAdmMap.get(normAdm);
          if (!match) return existingRow;

          updatedCount++;
          const newScores = { ...existingRow.scores };
          for (const part of scheme.parts) {
            const foundKey = Object.keys(match).find(
              (k) => k.trim().toLowerCase() === part.name.trim().toLowerCase()
            );
            if (foundKey && match[foundKey] !== undefined && match[foundKey].trim() !== "") {
              newScores[part.name] = match[foundKey].trim();
            }
          }
          return {
            ...existingRow,
            scores: newScores,
          };
        });

        // Persist upload into localStorage
        if (selectedClassId && selectedSubjectId && selectedTermId) {
          try {
            const draftStorageKey = `resulta_draft_${selectedClassId}_${selectedSubjectId}_${selectedTermId}`;
            const saveObj: Record<string, Record<string, string>> = {};
            for (const row of newScoreRows) {
              saveObj[row.student_id] = row.scores;
            }
            localStorage.setItem(draftStorageKey, JSON.stringify(saveObj));
          } catch (e) {}
        }

        setScoreRows(newScoreRows);
        showToast(
          "CSV Processed",
          `Loaded scores for ${updatedCount} students from uploaded CSV.`,
          "success"
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
      error: (err) => {
        setErrorMessage(`Failed to read CSV file: ${err.message}`);
        showToast("File Error", err.message, "error");
      },
    });
  };

  // Summary Metrics for Preview Mode
  const previewStats = useMemo(() => {
    if (!scheme || scoreRows.length === 0) return null;

    let sum = 0;
    let highest = -Infinity;
    let lowest = Infinity;
    const gradeCounts: Record<string, number> = {};

    for (const b of scheme.boundaries) {
      gradeCounts[b.grade] = 0;
    }

    for (const row of scoreRows) {
      const evalRes = calculateRowEvaluation(row);
      sum += evalRes.total;
      if (evalRes.total > highest) highest = evalRes.total;
      if (evalRes.total < lowest) lowest = evalRes.total;
      if (evalRes.grade && gradeCounts[evalRes.grade] !== undefined) {
        gradeCounts[evalRes.grade]++;
      }
    }

    const avg = scoreRows.length > 0 ? (sum / scoreRows.length).toFixed(1) : "0.0";
    return {
      average: avg,
      highest: highest === -Infinity ? 0 : highest,
      lowest: lowest === Infinity ? 0 : lowest,
      gradeCounts,
      totalStudents: scoreRows.length,
    };
  }, [scheme, scoreRows]);

  const selectedTerm = terms.find((t) => t.id === selectedTermId);
  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const selectedSubject = availableSubjects.find((s) => s.id === selectedSubjectId);

  // Check if all filtered rows are selected
  const allFilteredSelected =
    filteredScoreRows.length > 0 &&
    filteredScoreRows.every((r) => selectedStudentIds.has(r.student_id));

  return (
    <div className="space-y-6 relative">
      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 max-w-sm w-full bg-[#FFFFFF] border border-[#E9E4D9] shadow-xl rounded-sm p-4 flex items-start gap-3 transition-all animate-in fade-in slide-in-from-top-2">
          {toast.type === "success" && (
            <div className="w-6 h-6 rounded-full bg-[#E5EDE5] text-[#3F4E40] flex items-center justify-center shrink-0 mt-0.5">
              <CheckCircle className="w-4 h-4" />
            </div>
          )}
          {toast.type === "error" && (
            <div className="w-6 h-6 rounded-full bg-[#F6EBEB] text-[#671B24] flex items-center justify-center shrink-0 mt-0.5">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
          {toast.type === "info" && (
            <div className="w-6 h-6 rounded-full bg-[#FAF8F3] text-[#2C2825] border border-[#E9E4D9] flex items-center justify-center shrink-0 mt-0.5">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          )}
          <div className="flex-1">
            <span className="font-semibold text-xs text-[#2C2825] block">
              {toast.title}
            </span>
            <p className="text-[11px] text-[#6B645D] mt-0.5 leading-relaxed">
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[#8C827A] hover:text-[#2C2825] transition-colors p-0.5"
            aria-label="Dismiss toast"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selector Card */}
      <div className="bg-[#FFFFFF] border border-[#E9E4D9] p-5 rounded-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-[#E9E4D9] gap-2">
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-[#3F4E40] block">
              Academic Record Entry
            </span>
            <h2 className="text-lg font-serif font-bold text-[#2C2825]">
              Score Entry & Submission
            </h2>
          </div>
          {selectedTerm && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-medium border ${
                selectedTerm.is_open
                  ? "bg-[#E5EDE5] text-[#3F4E40] border-[#D3DDD3]"
                  : "bg-[#F4F0E6] text-[#6B645D] border-[#E9E4D9]"
              }`}
            >
              {selectedTerm.name} {selectedTerm.is_open ? "(Open Term)" : "(Published)"}
            </span>
          )}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-mono text-[#6B645D] mb-1">
              Class Assignment
            </label>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              disabled={loadingScores || actionLoading}
              className="w-full text-xs font-mono p-2 border border-[#E9E4D9] rounded-sm bg-[#FAF8F3] text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            >
              <option value="">Select an Assigned Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.studentCount !== undefined ? `(${c.studentCount} students)` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#6B645D] mb-1">
              Subject
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={!selectedClassId || availableSubjects.length === 0 || loadingScores || actionLoading}
              className="w-full text-xs font-mono p-2 border border-[#E9E4D9] rounded-sm bg-[#FAF8F3] text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            >
              <option value="">Select Subject</option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.code ? `(${s.code})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono text-[#6B645D] mb-1">
              Academic Term
            </label>
            <select
              value={selectedTermId}
              onChange={(e) => setSelectedTermId(e.target.value)}
              disabled={loadingScores || actionLoading}
              className="w-full text-xs font-mono p-2 border border-[#E9E4D9] rounded-sm bg-[#FAF8F3] text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
            >
              <option value="">Select Academic Term</option>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.is_open ? "— Open for Entry" : "— Published"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Messages */}
      {errorMessage && (
        <div className="p-3 bg-[#F6EBEB] border border-[#F0D5D5] rounded-sm text-xs text-[#671B24] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1">{errorMessage}</div>
        </div>
      )}

      {/* Empty / Not Selected State */}
      {(!selectedClassId || !selectedSubjectId || !selectedTermId) && (
        <div className="bg-[#FFFFFF] border border-[#E9E4D9] p-12 text-center text-xs text-[#6B645D] rounded-sm">
          <FileSpreadsheet className="w-8 h-8 text-[#B8B0A5] mx-auto mb-2" />
          <p className="font-medium text-[#2C2825]">Select Class, Subject, and Term to begin</p>
          <p className="mt-1">
            Pick from your authorized assignments and choose an academic term to enter or review scores.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loadingScores && (
        <div className="bg-[#FFFFFF] border border-[#E9E4D9] p-12 text-center text-xs text-[#6B645D] rounded-sm">
          <RefreshCw className="w-6 h-6 text-[#3F4E40] animate-spin mx-auto mb-2" />
          <p>Loading class roster and grading rules...</p>
        </div>
      )}

      {/* Main Workspace when loaded */}
      {!loadingScores && selectedClassId && selectedSubjectId && selectedTermId && scheme && (
        <div className="space-y-6">
          {/* Status & Actions Header */}
          <div className="bg-[#FFFFFF] border border-[#E9E4D9] p-4 rounded-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isLocked ? (
                <div className="w-8 h-8 rounded bg-[#F4F0E6] text-[#671B24] border border-[#E9E4D9] flex items-center justify-center">
                  <Lock className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-8 h-8 rounded bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3] flex items-center justify-center">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-[#2C2825]">
                    {selectedClass?.name} — {selectedSubject?.name}
                  </span>
                  {isLocked ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F6EBEB] text-[#671B24] border border-[#F0D5D5]">
                      Scores Locked (Submitted)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#FAF8F3] text-[#47423D] border border-[#E9E4D9]">
                      Draft Mode (Editable)
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-[#6B645D] block mt-0.5">
                  Grading Scheme: {scheme.name || "Default"} (
                  {scheme.parts.map((p) => `${p.name}: max ${p.max}`).join(", ")})
                </span>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center flex-wrap gap-2">
              <a
                href={`/api/staff/scores/template?classId=${encodeURIComponent(selectedClassId)}&subjectId=${encodeURIComponent(selectedSubjectId)}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium bg-[#FAF8F3] text-[#47423D] border border-[#E9E4D9] hover:bg-[#F4F0E6] transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Download Template
              </a>

              {!isLocked && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-mono font-medium bg-[#FAF8F3] text-[#47423D] border border-[#E9E4D9] hover:bg-[#F4F0E6] transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload CSV
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={actionLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium bg-[#FAF8F3] text-[#2C2825] border border-[#B8B0A5] hover:bg-[#E9E4D9] transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Draft
                  </button>

                  {reviewStep === "edit" ? (
                    <button
                      type="button"
                      onClick={handleProceedToFirstReview}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded text-xs font-mono font-medium bg-[#3F4E40] text-white hover:bg-[#344035] transition-colors cursor-pointer"
                    >
                      <span>Review Scores</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReviewStep("edit")}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium bg-[#FAF8F3] text-[#47423D] border border-[#E9E4D9] hover:bg-[#F4F0E6] transition-colors cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Edit
                    </button>
                  )}
                </>
              )}

              {/* School Admin Unlock Action */}
              {isLocked && (userRole === "school_admin" || userRole === "platform_admin") && (
                <button
                  type="button"
                  onClick={() => setShowUnlockModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium bg-[#F6EBEB] text-[#671B24] border border-[#F0D5D5] hover:bg-[#F0D5D5] transition-colors cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  Unlock Scores
                </button>
              )}
            </div>
          </div>

          {/* Locked Notice if submitted */}
          {isLocked && (
            <div className="p-4 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm flex items-center justify-between text-xs text-[#6B645D]">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#671B24]" />
                <span>
                  These scores have been submitted and locked. Only a school administrator can unlock them for corrections.
                </span>
              </div>
            </div>
          )}

          {/* Search Bar, Department Filter & Multi-Select Toolbar */}
          {reviewStep === "edit" && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#FFFFFF] p-3 border border-[#E9E4D9] rounded-sm">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                {/* Search input by admission number or student name */}
                <div className="relative w-full sm:w-72">
                  <Search className="w-3.5 h-3.5 text-[#8C827A] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search admission or name..."
                    className="w-full pl-8 pr-8 py-1.5 text-xs font-mono border border-[#E9E4D9] rounded-sm bg-[#FAF8F3] text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8C827A] hover:text-[#2C2825]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Department Filter Dropdown */}
                {availableDepartments.length > 0 && (
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-[#6B645D]">Dept:</span>
                    <select
                      value={selectedDepartmentFilter}
                      onChange={(e) => setSelectedDepartmentFilter(e.target.value)}
                      className="py-1.5 px-2 text-xs font-mono border border-[#E9E4D9] rounded-sm bg-[#FAF8F3] text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
                    >
                      <option value="ALL">All Assigned Students</option>
                      {availableDepartments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                      <option value="NONE">No Department</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Selection Controls */}
              <div className="flex items-center gap-3">
                {searchQuery && (
                  <span className="text-[11px] font-mono text-[#6B645D]">
                    Showing {filteredScoreRows.length} of {scoreRows.length} students
                  </span>
                )}

                {!isLocked && selectedStudentIds.size > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-[#2C2825] bg-[#FAF8F3] px-2 py-1 rounded border border-[#E9E4D9]">
                      {selectedStudentIds.size} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirmModal(true)}
                      disabled={actionLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium bg-[#F6EBEB] text-[#671B24] border border-[#F0D5D5] hover:bg-[#F0D5D5] transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Scores</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedStudentIds(new Set())}
                      className="text-xs font-mono text-[#6B645D] hover:text-[#2C2825] underline cursor-pointer"
                    >
                      Deselect
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 1: PREVIEW MODE (FIRST REVIEW) */}
          {reviewStep === "review_step1" && previewStats && (
            <div className="bg-[#FFFFFF] border border-[#E9E4D9] p-5 rounded-sm space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E9E4D9]">
                <div>
                  <span className="text-xs font-mono font-semibold uppercase text-[#3F4E40]">
                    Step 1 of 2: Score Verification Preview
                  </span>
                  <p className="text-xs text-[#6B645D] mt-0.5">
                    Carefully review all calculated totals and letter grades before proceeding to final submission.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewStep("edit")}
                    className="px-3 py-1.5 text-xs font-mono rounded bg-[#FAF8F3] border border-[#E9E4D9] text-[#47423D] hover:bg-[#F4F0E6]"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleProceedToSecondReview}
                    className="px-3.5 py-1.5 text-xs font-mono font-medium rounded bg-[#3F4E40] text-white hover:bg-[#344035]"
                  >
                    Proceed to Final Confirmation
                  </button>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#FAF8F3] p-3 rounded-sm border border-[#E9E4D9]">
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#6B645D] block">Total Students</span>
                  <span className="text-lg font-serif font-bold text-[#2C2825]">{previewStats.totalStudents}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#6B645D] block">Class Average</span>
                  <span className="text-lg font-serif font-bold text-[#3F4E40]">{previewStats.average}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#6B645D] block">Highest Score</span>
                  <span className="text-lg font-serif font-bold text-[#2C2825]">{previewStats.highest}</span>
                </div>
                <div>
                  <span className="text-[10px] font-mono uppercase text-[#6B645D] block">Lowest Score</span>
                  <span className="text-lg font-serif font-bold text-[#2C2825]">{previewStats.lowest}</span>
                </div>
              </div>

              {/* Grade distribution */}
              <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
                <span className="text-[#6B645D]">Grade Breakdown:</span>
                {Object.entries(previewStats.gradeCounts).map(([grade, count]) => (
                  <span
                    key={grade}
                    className="px-2 py-0.5 rounded bg-[#FAF8F3] border border-[#E9E4D9] text-[#2C2825]"
                  >
                    {grade}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: FINAL CONFIRMATION MODAL / PANEL */}
          {reviewStep === "review_step2" && (
            <div className="bg-[#FFFFFF] border-2 border-[#3F4E40] p-6 rounded-sm space-y-4">
              <div className="flex items-center gap-2 text-[#3F4E40] font-semibold text-sm">
                <AlertTriangle className="w-5 h-5 text-[#3F4E40]" />
                <span>Step 2 of 2: Final Submission & Score Lock</span>
              </div>

              <div className="text-xs text-[#47423D] space-y-2 bg-[#FAF8F3] p-4 rounded-sm border border-[#E9E4D9]">
                <p>
                  You are about to submit official scores for <strong>{selectedClass?.name}</strong> in{" "}
                  <strong>{selectedSubject?.name}</strong> for <strong>{selectedTerm?.name}</strong> (
                  {scoreRows.length} students).
                </p>
                <p className="text-[#671B24] font-medium">
                  Once submitted, the scores are strictly locked and cannot be edited by teachers. Any subsequent
                  correction will require a school administrator to unlock them with a recorded audit reason.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#2C2825] cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={submissionConfirmed}
                  onChange={(e) => setSubmissionConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-[#B8B0A5] text-[#3F4E40] focus:ring-[#3F4E40]"
                />
                <span className="font-mono">
                  I confirm that all entered scores have been reviewed twice, verified against grading rules, and are ready for official submission.
                </span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#E9E4D9]">
                <button
                  type="button"
                  onClick={() => setReviewStep("review_step1")}
                  disabled={actionLoading}
                  className="px-4 py-2 text-xs font-mono rounded bg-[#FAF8F3] border border-[#E9E4D9] text-[#47423D] hover:bg-[#F4F0E6]"
                >
                  Back to Preview
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={!submissionConfirmed || actionLoading}
                  className="px-5 py-2 text-xs font-mono font-medium rounded bg-[#3F4E40] text-white hover:bg-[#344035] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? "Submitting..." : "Confirm & Submit Scores"}
                </button>
              </div>
            </div>
          )}

          {/* Scores Table Grid */}
          <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                Student Score Grid ({filteredScoreRows.length} Students)
              </span>
              <span className="text-[11px] font-mono text-[#6B645D]">
                Scale: {scheme.boundaries.map((b) => `${b.grade} (${b.min}-${b.max})`).join(", ")}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                    {/* Checkbox column for selection */}
                    {!isLocked && reviewStep === "edit" && (
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={handleToggleSelectAll}
                          title="Select all currently visible students"
                          className="rounded border-[#B8B0A5] text-[#3F4E40] focus:ring-[#3F4E40] cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-3 px-4 font-medium w-12 text-center">#</th>
                    <th className="py-3 px-4 font-medium">Admission No.</th>
                    <th className="py-3 px-4 font-medium">Student Name</th>
                    <th className="py-3 px-4 font-medium text-center">Dept</th>
                    {scheme.parts.map((p) => (
                      <th key={p.name} className="py-3 px-4 font-medium text-center w-28">
                        {p.name} <span className="text-[10px] text-[#8C827A]">(Max {p.max})</span>
                      </th>
                    ))}
                    <th className="py-3 px-4 font-medium text-center w-24">Total (100)</th>
                    <th className="py-3 px-4 font-medium text-center w-16">Grade</th>
                    <th className="py-3 px-4 font-medium text-right pr-6">Remark</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F0E6]">
                  {filteredScoreRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={scheme.parts.length + (!isLocked && reviewStep === "edit" ? 7 : 6)}
                        className="py-8 text-center text-xs text-[#6B645D]"
                      >
                        {searchQuery
                          ? `No students found matching "${searchQuery}".`
                          : "No students in this class roster."}
                      </td>
                    </tr>
                  ) : (
                    filteredScoreRows.map((row, idx) => {
                      const evalRes = calculateRowEvaluation(row);
                      const isSelected = selectedStudentIds.has(row.student_id);

                      return (
                        <tr
                          key={row.student_id}
                          className={`transition-colors ${
                            isSelected ? "bg-[#F7F5EE]" : "hover:bg-[#FAF8F3]"
                          }`}
                        >
                          {/* Row Selection Checkbox */}
                          {!isLocked && reviewStep === "edit" && (
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectStudent(row.student_id)}
                                className="rounded border-[#B8B0A5] text-[#3F4E40] focus:ring-[#3F4E40] cursor-pointer"
                              />
                            </td>
                          )}

                          <td className="py-2.5 px-4 text-center font-mono text-[#8C827A]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-medium text-[#2C2825]">
                            {row.admission_number}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-[#2C2825]">
                            {row.full_name}
                          </td>
                          <td className="py-2.5 px-4 text-center font-mono text-xs">
                            {(() => {
                              const st = studentMap.get(row.student_id);
                              return st?.department?.name ? (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#FAF3E0] text-[#7A5B15] border border-[#ECD9B0]">
                                  {st.department.name}
                                </span>
                              ) : (
                                <span className="text-[#8C827A] text-[11px]">—</span>
                              );
                            })()}
                          </td>

                          {/* Editable or Readonly Part Inputs */}
                          {scheme.parts.map((part) => {
                            const val = row.scores[part.name] || "";
                            const num = parseFloat(val);
                            const isInvalid = !isNaN(num) && (num < 0 || num > part.max);

                            return (
                              <td key={part.name} className="py-2.5 px-4 text-center">
                                {isLocked || reviewStep !== "edit" ? (
                                  <span className="font-mono text-xs text-[#2C2825]">
                                    {val !== "" ? val : "—"}
                                  </span>
                                ) : (
                                <div>
                                  <input
                                    type="number"
                                    min={0}
                                    max={part.max}
                                    step="0.5"
                                    value={val}
                                    onChange={(e) =>
                                      handleScoreChange(row.student_id, part.name, e.target.value)
                                    }
                                    placeholder="0"
                                    className={`w-20 text-center font-mono text-xs p-1.5 border rounded-sm bg-[#FFFFFF] ${
                                      isInvalid
                                        ? "border-[#671B24] text-[#671B24] bg-[#F6EBEB]"
                                        : "border-[#E9E4D9] text-[#2C2825] focus:border-[#3F4E40]"
                                    }`}
                                  />
                                  {isInvalid && (
                                    <span className="block text-[10px] text-[#671B24] font-mono mt-0.5">
                                      Max {part.max}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Calculated Total */}
                        <td className="py-2.5 px-4 text-center font-mono font-semibold text-[#2C2825]">
                          {evalRes.grade !== "-" ? evalRes.total : "—"}
                        </td>

                        {/* Calculated Grade */}
                        <td className="py-2.5 px-4 text-center">
                          {evalRes.grade !== "-" ? (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                                evalRes.grade === "A"
                                  ? "bg-[#E5EDE5] text-[#3F4E40]"
                                  : evalRes.grade === "F"
                                  ? "bg-[#F6EBEB] text-[#671B24]"
                                  : "bg-[#FAF8F3] text-[#47423D] border border-[#E9E4D9]"
                              }`}
                            >
                              {evalRes.grade}
                            </span>
                          ) : (
                            <span className="text-[#8C827A] font-mono">—</span>
                          )}
                        </td>

                        {/* Calculated Remark */}
                        <td className="py-2.5 px-4 text-right pr-6 font-mono text-[11px] text-[#6B645D]">
                          {evalRes.remark}
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
      )}

      {/* Delete / Clear Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 bg-[#2C2825]/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E9E4D9] rounded-sm max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-[#671B24] font-semibold text-sm">
              <Trash2 className="w-4 h-4" />
              <span>Delete Scores for Selected Students</span>
            </div>

            <p className="text-xs text-[#6B645D] leading-relaxed">
              Are you sure you want to delete and reset scores for <strong>{selectedStudentIds.size}</strong> selected student(s)?
              Any unsaved or draft scores entered for these students will be cleared from the grid and removed from the database.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E9E4D9]">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={actionLoading}
                className="px-3.5 py-1.5 text-xs font-mono rounded bg-[#FAF8F3] border border-[#E9E4D9] text-[#47423D] hover:bg-[#F4F0E6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={actionLoading}
                className="px-4 py-1.5 text-xs font-mono font-medium rounded bg-[#671B24] text-white hover:bg-[#52151D] disabled:opacity-50"
              >
                {actionLoading ? "Clearing..." : `Delete Scores (${selectedStudentIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Confirmation Modal (for School Admin) */}
      {showUnlockModal && (
        <div className="fixed inset-0 z-50 bg-[#2C2825]/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E9E4D9] rounded-sm max-w-md w-full p-6 space-y-4 shadow-lg">
            <div className="flex items-center gap-2 text-[#671B24] font-semibold text-sm">
              <Unlock className="w-4 h-4" />
              <span>Unlock Submitted Scores</span>
            </div>

            <p className="text-xs text-[#6B645D]">
              Unlocking these scores will allow the assigned teacher to edit and re-submit marks. This action is permanently recorded in the system audit log.
            </p>

            <div>
              <label className="block text-xs font-mono text-[#2C2825] mb-1">
                Reason for unlocking (required)
              </label>
              <textarea
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                placeholder="e.g. Teacher requested correction of Continuous Assessment scores after remarking."
                rows={3}
                className="w-full text-xs font-mono p-2 border border-[#E9E4D9] rounded-sm bg-[#FAF8F3] text-[#2C2825] focus:outline-none focus:border-[#3F4E40]"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowUnlockModal(false);
                  setUnlockReason("");
                }}
                disabled={actionLoading}
                className="px-3 py-1.5 text-xs font-mono rounded bg-[#FAF8F3] border border-[#E9E4D9] text-[#47423D] hover:bg-[#F4F0E6]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUnlockScores}
                disabled={!unlockReason.trim() || actionLoading}
                className="px-4 py-1.5 text-xs font-mono font-medium rounded bg-[#671B24] text-white hover:bg-[#52151D] disabled:opacity-50"
              >
                {actionLoading ? "Unlocking..." : "Confirm Unlock"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
