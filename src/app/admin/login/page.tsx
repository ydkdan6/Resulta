"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { platformConfig } from "@/lib/config";
import { ShieldCheck, AlertCircle } from "lucide-react";

export default function PlatformAdminLoginPage() {
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

      if (data.user.role !== "platform_admin") {
        throw new Error("Forbidden: This portal is reserved for platform administrators.");
      }

      // Immediate redirect without client-router race condition
      window.location.href = data.redirectUrl || "/admin";
      return;
    } catch (err: unknown) {
      setLoading(false);
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An unexpected error occurred.");
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-10 h-10 rounded bg-[#671B24] text-white flex items-center justify-center font-serif font-bold text-lg mb-3 shadow-xs">
          {platformConfig.name.charAt(0)}
        </div>
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-[#671B24] block">
          Platform Security Access
        </span>
        <h1 className="mt-1 text-2xl font-serif font-bold text-[#2C2825] tracking-tight">
          Platform Administrator
        </h1>
        <p className="mt-1 text-xs text-[#6B645D]">
          Sign in with root administrative credentials for {platformConfig.name}
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
                Admin Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="platform_admin@resulta.ng"
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] placeholder-[#B8B0A5] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24]"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-mono uppercase text-[#47423D] mb-1">
                Security Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-[#FAF8F3] border border-[#D9D3C7] rounded-sm text-[#2C2825] placeholder-[#B8B0A5] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-sm text-xs font-mono font-medium text-white bg-[#671B24] hover:bg-[#52151D] focus:outline-hidden transition-colors cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" />
              {loading ? "Verifying..." : "Authenticate Administrator"}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#F4F0E6] text-center text-xs text-[#6B645D] space-y-2">
            <div>
              <span>Are you a school administrator or teacher? </span>
              <a href="/staff/login" className="text-[#671B24] hover:underline font-medium">
                Go to Staff Portal
              </a>
            </div>
            <div>
              <a href="/privacy" className="text-[11px] text-[#8C827A] hover:underline">
                NDPA Privacy Notice & Data Protection Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
