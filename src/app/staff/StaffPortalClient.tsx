"use client";

import { useState } from "react";
import SchoolAdminRosterClient, { ClassItem } from "./SchoolAdminRosterClient";

interface Props {
  classes: ClassItem[];
  schoolName: string;
  overviewContent: React.ReactNode;
}

export default function StaffPortalClient({
  classes,
  schoolName,
  overviewContent,
}: Props) {
  const [activeTab, setActiveTab] = useState<"overview" | "roster">("overview");

  return (
    <div>
      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E9E4D9] mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
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
          className={`px-4 py-2.5 text-xs font-mono font-medium transition-colors border-b-2 cursor-pointer ${
            activeTab === "roster"
              ? "border-[#3F4E40] text-[#3F4E40] font-semibold"
              : "border-transparent text-[#6B645D] hover:text-[#2C2825]"
          }`}
        >
          Student Roster
        </button>
      </div>

      {activeTab === "overview" ? (
        overviewContent
      ) : (
        <SchoolAdminRosterClient classes={classes} schoolName={schoolName} />
      )}
    </div>
  );
}
