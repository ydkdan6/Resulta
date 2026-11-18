"use client";

import { useState } from "react";
import SchoolAdminRosterClient, { ClassItem } from "./SchoolAdminRosterClient";
import ScoreEntryClient, { AssignedClass } from "./my-classes/ScoreEntryClient";
import PaymentsClient from "./PaymentsClient";
import AuditLogViewer from "@/components/AuditLogViewer";
import DataProtectionPanel from "@/components/DataProtectionPanel";

interface Props {
  classes: ClassItem[];
  schoolClassesWithSubjects?: AssignedClass[];
  schoolName: string;
  overviewContent: React.ReactNode;
}

export default function StaffPortalClient({
  classes,
  schoolClassesWithSubjects = [],
  schoolName,
  overviewContent,
}: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "roster" | "scores" | "payments" | "audit" | "data-protection">("overview");

  return (
    <div>
      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E9E4D9] mb-6 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === "overview"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Operations Overview
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("roster")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === "roster"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Student Roster
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scores")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === "scores"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Scores & Results
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payments")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === "payments"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Payments & Billing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === "audit"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Audit Logs
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("data-protection")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
            activeTab === "data-protection"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Data Protection (NDPA)
        </button>
      </div>

      {activeTab === "overview" && overviewContent}
      {activeTab === "roster" && (
        <SchoolAdminRosterClient classes={classes} schoolName={schoolName} />
      )}
      {activeTab === "scores" && (
        <ScoreEntryClient
          initialClasses={schoolClassesWithSubjects}
          currentUserRole="school_admin"
          schoolName={schoolName}
        />
      )}
      {activeTab === "payments" && (
        <PaymentsClient schoolName={schoolName} />
      )}
      {activeTab === "audit" && (
        <AuditLogViewer portalType="staff" />
      )}
      {activeTab === "data-protection" && (
        <DataProtectionPanel schoolName={schoolName} />
      )}
    </div>
  );
}
