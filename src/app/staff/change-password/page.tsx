"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update password.");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/staff/my-classes");
        router.refresh();
      }, 1500);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-10 h-10 rounded bg-[#671B24] text-white flex items-center justify-center font-serif font-bold text-lg mb-3 shadow-xs">
          <KeyRound className="w-5 h-5" />
        </div>
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-[#671B24] block">
          Account Security
        </span>
        <h1 className="mt-1 text-2xl font-serif font-bold text-[#2C2825] tracking-tight">
          Update Temporary Password
        </h1>
        <p className="mt-1 text-xs text-[#6B645D]">
          Set a permanent, personal password to replace the temporary password assigned to you
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-[#FFFFFF] border border-[#E9E4D9] rounded-sm py-8 px-6 shadow-xs sm:px-10">
          {error && (
            <div className="mb-6 p-3 bg-[#F6EBEB] border border-[#F0D5D5] rounded-sm flex items-start gap-2.5 text-xs text-[#671B24]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-6 p-3 bg-[#E5EDE5] border border-[#D3DDD3] rounded-sm flex items-start gap-2.5 text-xs text-[#3F4E40]">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Password updated successfully! Redirecting to My Classes...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="currentPassword" className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                Current / Temporary Password
              </label>
              <input
                id="currentPassword"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24]"
              />
            </div>

            <div>
              <label htmlFor="newPassword" className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                New Password (min. 8 characters)
              </label>
              <input
                id="newPassword"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24]"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                Confirm New Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24]"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#671B24] hover:bg-[#52151D] focus:outline-hidden transition-colors cursor-pointer disabled:opacity-50 mt-6"
            >
              {loading ? "Updating..." : "Save New Password"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-[#F4F0E6] text-center">
            <a
              href="/staff/my-classes"
              className="inline-flex items-center gap-1.5 text-xs text-[#6B645D] hover:text-[#2C2825] font-mono"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to My Classes
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
