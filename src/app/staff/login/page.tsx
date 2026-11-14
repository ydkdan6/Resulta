"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformConfig } from "@/lib/config";
import { LogIn, AlertCircle } from "lucide-react";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Authentication failed.");
      }

      if (data.user.role === "platform_admin") {
        router.push("/admin");
      } else if (data.user.role === "teacher") {
        if (data.user.must_change_password) {
          router.push("/staff/change-password");
        } else {
          router.push("/staff/my-classes");
        }
      } else {
        router.push("/staff");
      }
      router.refresh();
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
        <div className="mx-auto w-10 h-10 rounded bg-[#3F4E40] text-white flex items-center justify-center font-serif font-bold text-lg mb-3 shadow-xs">
          S
        </div>
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-[#3F4E40] block">
          Staff Portal Access
        </span>
        <h1 className="mt-1 text-2xl font-serif font-bold text-[#2C2825] tracking-tight">
          Academic Staff & Administrator Login
        </h1>
        <p className="mt-1 text-xs text-[#6B645D]">
          Sign in to manage classes, upload exam scores, or view assigned teaching schedules
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

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                Staff Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teacher@school.edu.ng"
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] placeholder-[#B8B0A5] focus:outline-hidden focus:border-[#3F4E40] focus:ring-1 focus:ring-[#3F4E40]"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] placeholder-[#B8B0A5] focus:outline-hidden focus:border-[#3F4E40] focus:ring-1 focus:ring-[#3F4E40]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#3F4E40] hover:bg-[#2E3A2F] focus:outline-hidden transition-colors cursor-pointer disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" />
              {loading ? "Signing In..." : "Sign In to Staff Portal"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#F4F0E6] text-center text-xs text-[#6B645D]">
            <span>Platform administrator? </span>
            <a href="/admin/login" className="text-[#671B24] hover:underline font-medium">
              Platform Admin Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
