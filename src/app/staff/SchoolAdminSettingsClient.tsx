"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, AlertCircle } from "lucide-react";

interface Props {
  schoolId: string;
  currentName: string;
  currentLogo: string | null;
  schoolSlug: string;
}

export default function SchoolAdminSettingsClient({
  schoolId,
  currentName,
  currentLogo,
  schoolSlug,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [logoUrl, setLogoUrl] = useState(currentLogo || "");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/staff/school", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_id: schoolId,
          name: name.trim(),
          logo_url: logoUrl.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update school settings.");
      }

      setMessage({ text: "School details updated successfully.", type: "success" });
      router.refresh();
    } catch (err: unknown) {
      setMessage({
        text: err instanceof Error ? err.message : "An error occurred.",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-[#E9E4D9] rounded-sm p-5 shadow-xs">
      <div className="border-b border-[#E9E4D9] pb-3 mb-4">
        <h2 className="text-sm font-serif font-bold text-[#2C2825] flex items-center gap-2">
          <Building2 className="w-4 h-4 text-[#3F4E40]" /> School Profile Settings
        </h2>
        <span className="text-[11px] text-[#6B645D] block mt-0.5">
          School admins can customize the school name and crest/logo (Rule 13).
        </span>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-sm border text-xs flex items-start gap-2 ${
            message.type === "success"
              ? "bg-[#E5EDE5] border-[#D3DDD3] text-[#3F4E40]"
              : "bg-[#F6EBEB] border-[#F0D5D5] text-[#671B24]"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleUpdate} className="space-y-4 text-xs">
        <div>
          <label className="block font-mono uppercase text-[#47423D] mb-1">
            School Name
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
          />
        </div>

        <div>
          <label className="block font-mono uppercase text-[#47423D] mb-1">
            School Logo / Crest URL
          </label>
          <input
            type="url"
            placeholder="https://example.com/logo.png"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825]"
          />
        </div>

        <div>
          <span className="block font-mono uppercase text-[#6B645D] mb-1">
            Subdomain Identifier
          </span>
          <div className="p-2 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm font-mono text-[11px] text-[#671B24]">
            {schoolSlug}
          </div>
          <span className="text-[10px] text-[#6B645D] block mt-1">
            Subdomain identifiers can only be modified by platform administrators.
          </span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-3 rounded-sm text-xs font-mono font-medium text-white bg-[#3F4E40] hover:bg-[#2E3A2F] cursor-pointer transition-colors disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save School Details"}
        </button>
      </form>
    </div>
  );
}
