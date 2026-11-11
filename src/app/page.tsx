"use client";

import { platformConfig } from "@/lib/config";
import { CheckCircle2, AlertCircle, Database, Server, ShieldCheck } from "lucide-react";

export default function Home() {
  const { name, domain, isLocal, supabase } = platformConfig;
  const isSupabaseLive = supabase.isConfigured;

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#E9E4D9] bg-[#FFFFFF]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#671B24] text-white flex items-center justify-center font-serif font-bold text-sm tracking-wide">
              {name.charAt(0)}
            </div>
            <div>
              <span className="font-semibold text-base text-[#2C2825] tracking-tight">{name}</span>
              <span className="text-[11px] text-[#6B645D] block font-mono">School Result Management Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-medium bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#526453]"></span>
              Setup Verified
            </span>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-6xl mx-auto px-6 py-10 w-full flex-1">
        {/* Page Header */}
        <div className="border-b border-[#E9E4D9] pb-6 mb-8">
          <p className="text-xs font-mono font-medium uppercase tracking-wider text-[#671B24]">
            System Initialization & Environment Verification
          </p>
          <h1 className="mt-1 text-2xl font-serif font-bold text-[#2C2825] tracking-tight">
            {name} Platform Engine
          </h1>
          <p className="mt-1 text-sm text-[#47423D] max-w-2xl">
            Multi-tenant result publication, exam score processing, and PIN-authenticated parent report card access for Nigerian schools.
          </p>
        </div>

        {/* Structured Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Platform Identity & Subdomain Routing */}
          <div className="lg:col-span-2 border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
            <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                Platform Identity & Subdomain Routing
              </span>
              <span className="text-[11px] font-mono text-[#6B645D]">Environment-Driven</span>
            </div>

            <div className="p-5">
              <table className="w-full text-xs text-left border-collapse">
                <tbody>
                  <tr className="border-b border-[#F4F0E6]">
                    <td className="py-2.5 text-[#6B645D] font-mono w-40">PLATFORM_NAME</td>
                    <td className="py-2.5 font-medium text-[#2C2825]">{name}</td>
                    <td className="py-2.5 text-right text-[11px] text-[#6B645D]">Derived from env</td>
                  </tr>
                  <tr className="border-b border-[#F4F0E6]">
                    <td className="py-2.5 text-[#6B645D] font-mono">PLATFORM_DOMAIN</td>
                    <td className="py-2.5 font-medium text-[#2C2825]">{domain}</td>
                    <td className="py-2.5 text-right text-[11px] text-[#6B645D]">Derived from env</td>
                  </tr>
                  <tr className="border-b border-[#F4F0E6]">
                    <td className="py-2.5 text-[#6B645D] font-mono">ENVIRONMENT</td>
                    <td className="py-2.5 font-medium text-[#2C2825]">
                      {isLocal ? "Local Development" : "Production"}
                    </td>
                    <td className="py-2.5 text-right text-[11px] text-[#6B645D]">Port {platformConfig.port}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-5 pt-4 border-t border-[#E9E4D9]">
                <span className="text-xs font-semibold text-[#47423D] block mb-2 font-mono uppercase">
                  Multi-Tenant Subdomain Mapping (Rule 10)
                </span>
                <div className="space-y-2 text-xs font-mono">
                  <div className="flex items-center justify-between p-2.5 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm">
                    <div>
                      <span className="text-[#6B645D] block text-[11px]">Parent Results Address</span>
                      <span className="text-[#671B24] font-medium">{platformConfig.getSchoolResultsUrl("school-slug")}</span>
                    </div>
                    <span className="text-[11px] text-[#6B645D]">PIN Login & Report Cards</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 bg-[#FAF8F3] border border-[#E9E4D9] rounded-sm">
                    <div>
                      <span className="text-[#6B645D] block text-[11px]">Staff & Admin Address</span>
                      <span className="text-[#3F4E40] font-medium">{platformConfig.getSchoolStaffUrl("school-slug")}</span>
                    </div>
                    <span className="text-[11px] text-[#6B645D]">Scores & Management</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Database & Infrastructure Status */}
          <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm flex flex-col justify-between">
            <div>
              <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                  Infrastructure
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${isSupabaseLive ? "bg-[#E5EDE5] text-[#3F4E40]" : "bg-[#F6EBEB] text-[#671B24]"}`}>
                  {isSupabaseLive ? "Connected" : "Pending Keys"}
                </span>
              </div>

              <div className="p-5 space-y-3.5 text-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="w-3.5 h-3.5 text-[#6B645D]" />
                    <span className="text-[#47423D] font-medium">Supabase API</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#6B645D]">
                    {isSupabaseLive ? (
                      <span className="inline-flex items-center text-[#3F4E40] gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[#671B24] gap-1">
                        <AlertCircle className="w-3 h-3" /> Set in .env.local
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-[#6B645D]" />
                    <span className="text-[#47423D] font-medium">Prisma Client</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#3F4E40] inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Active (v6)
                  </span>
                </div>

                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#6B645D]" />
                    <span className="text-[#47423D] font-medium">Service Role</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#6B645D]">
                    Server-only (Isolated)
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-[#E9E4D9] bg-[#FAF8F3] text-xs text-[#6B645D]">
              <p className="font-medium text-[#2C2825] mb-1">Database Configuration</p>
              <p className="text-[11px] leading-relaxed">
                PostgreSQL credentials and pooled connections are managed through environment variables in <code className="text-[#671B24] font-mono">.env.local</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Roles & Workflow Matrix */}
        <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
          <div className="px-5 py-3.5 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
              Role-Based Architecture Matrix
            </span>
            <span className="text-[11px] font-mono text-[#6B645D]">BRIEF.md Roles</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                  <th className="py-2.5 px-5 font-medium">Role</th>
                  <th className="py-2.5 px-5 font-medium">Authentication</th>
                  <th className="py-2.5 px-5 font-medium">Permissions Scope</th>
                  <th className="py-2.5 px-5 font-medium">Portal Route</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F4F0E6]">
                <tr>
                  <td className="py-3 px-5 font-mono font-semibold text-[#671B24]">platform_admin</td>
                  <td className="py-3 px-5 text-[#47423D]">Direct credentials / MFA</td>
                  <td className="py-3 px-5 text-[#47423D]">Platform-wide: create schools, configure pricing, manage billing</td>
                  <td className="py-3 px-5 font-mono text-[11px] text-[#6B645D]">/admin</td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-mono font-semibold text-[#3F4E40]">school_admin</td>
                  <td className="py-3 px-5 text-[#47423D]">School staff credentials</td>
                  <td className="py-3 px-5 text-[#47423D]">School-scoped: students, classes, payments, result withholding</td>
                  <td className="py-3 px-5 font-mono text-[11px] text-[#6B645D]">slug-staff.{domain}</td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-mono font-semibold text-[#526453]">teacher</td>
                  <td className="py-3 px-5 text-[#47423D]">School staff credentials</td>
                  <td className="py-3 px-5 text-[#47423D]">Assigned classes and subjects only; score uploads</td>
                  <td className="py-3 px-5 font-mono text-[11px] text-[#6B645D]">slug-staff.{domain}</td>
                </tr>
                <tr>
                  <td className="py-3 px-5 font-mono font-semibold text-[#6B645D]">parent</td>
                  <td className="py-3 px-5 text-[#47423D]">Admission No + Term PIN hash</td>
                  <td className="py-3 px-5 text-[#47423D]">View-only access to published term report cards for single student</td>
                  <td className="py-3 px-5 font-mono text-[11px] text-[#6B645D]">slug.{domain}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E9E4D9] bg-[#FFFFFF] py-4 text-xs text-[#6B645D]">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <span>{name} Educational Systems &copy; 2026</span>
          <span className="font-mono text-[11px]">Domain: {domain}</span>
        </div>
      </footer>
    </div>
  );
}
