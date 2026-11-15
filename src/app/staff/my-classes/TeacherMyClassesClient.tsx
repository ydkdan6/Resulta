"use client";

import { useState } from "react";
import { BookOpen, Users, Edit3, Calendar } from "lucide-react";
import ScoreEntryClient, { AssignedClass } from "./ScoreEntryClient";

interface Props {
  assignedClasses: AssignedClass[];
  schoolName?: string;
  userName?: string;
  userRole?: string;
}

export default function TeacherMyClassesClient({
  assignedClasses,
  schoolName,
  userRole = "teacher",
}: Props) {
  const [activeTab, setActiveTab] = useState<"schedule" | "score_entry">("score_entry");
  const [targetClassId, setTargetClassId] = useState<string>("");
  const [targetSubjectId, setTargetSubjectId] = useState<string>("");

  const handleEnterScoresFor = (classId: string, subjectId?: string) => {
    setTargetClassId(classId);
    if (subjectId) setTargetSubjectId(subjectId);
    setActiveTab("score_entry");
  };

  return (
    <div>
      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E9E4D9] mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("score_entry")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === "score_entry"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          <Edit3 className="w-3.5 h-3.5" />
          <span>Score Entry & Results</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("schedule")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer flex items-center gap-1.5 ${
            activeTab === "schedule"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Teaching Schedule</span>
        </button>
      </div>

      {activeTab === "score_entry" ? (
        <ScoreEntryClient
          initialClasses={assignedClasses}
          currentUserRole={userRole}
          schoolName={schoolName}
          defaultClassId={targetClassId}
          defaultSubjectId={targetSubjectId}
        />
      ) : (
        <div className="space-y-6">
          <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
            <div className="px-5 py-3 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                Assigned Classes & Subjects
              </span>
              <span className="text-[11px] font-mono text-[#6B645D]">
                Scoped to {schoolName || "Current School"}
              </span>
            </div>

            {assignedClasses.length === 0 ? (
              <div className="p-10 text-center text-xs text-[#6B645D]">
                <BookOpen className="w-8 h-8 text-[#B8B0A5] mx-auto mb-2" />
                <p className="font-medium text-[#47423D]">No teaching classes assigned yet.</p>
                <p className="mt-1">Class and subject assignments are managed by the platform administrator.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                      <th className="py-3 px-5 font-medium">Class Name</th>
                      <th className="py-3 px-5 font-medium">Assigned Subject(s)</th>
                      <th className="py-3 px-5 font-medium text-center">Enrolled Students</th>
                      <th className="py-3 px-5 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F0E6]">
                    {assignedClasses.map((cls) => (
                      <tr key={cls.id} className="hover:bg-[#FAF8F3] transition-colors">
                        <td className="py-3.5 px-5 font-semibold text-[#2C2825]">
                          {cls.name}
                        </td>
                        <td className="py-3.5 px-5">
                          <div className="flex flex-wrap gap-1.5">
                            {cls.subjects.map((subj) => (
                              <button
                                key={subj.id}
                                type="button"
                                onClick={() => handleEnterScoresFor(cls.id, subj.id)}
                                title={`Enter scores for ${subj.name}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3] hover:bg-[#D3DDD3] transition-colors cursor-pointer"
                              >
                                <span>{subj.name} {subj.code ? `(${subj.code})` : ""}</span>
                                <Edit3 className="w-2.5 h-2.5 opacity-70" />
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="py-3.5 px-5 text-center font-mono">
                          <span className="inline-flex items-center gap-1 text-[#47423D]">
                            <Users className="w-3.5 h-3.5 text-[#6B645D]" />
                            {cls.studentCount ?? 0}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 text-right font-mono text-[11px]">
                          <button
                            type="button"
                            onClick={() => handleEnterScoresFor(cls.id, cls.subjects[0]?.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#3F4E40] text-white hover:bg-[#344035] transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Enter Scores</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
