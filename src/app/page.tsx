"use client";

import { platformConfig } from "@/lib/config";

export default function Home() {
  const { name, domain, isLocal, supabase } = platformConfig;

  const isSupabaseLive = supabase.isConfigured;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white shadow-xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
              {name.charAt(0)}
            </div>
            <div>
              <span className="font-bold text-xl text-slate-900 tracking-tight">{name}</span>
              <span className="text-xs text-slate-500 block">School Result Management Platform</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Setup Ready
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 w-full flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
            Welcome to {name}
          </h1>
          <p className="mt-2 text-base text-slate-600 max-w-2xl">
            Multi-tenant result management platform built for Nigerian schools. Exam results, report cards, and PIN-based parent access.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Dynamic Configuration Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Dynamic Platform Identity
              </h2>
              <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                Environment Driven
              </span>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Platform Name:</span>
                <span className="font-mono font-semibold text-slate-900">{name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Base Domain:</span>
                <span className="font-mono font-semibold text-slate-900">{domain}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Environment Mode:</span>
                <span className="font-mono text-slate-700">{isLocal ? "Local Development" : "Production"}</span>
              </div>
              <div className="py-2">
                <span className="text-slate-500 text-xs block mb-1">Subdomain Routing Preview (Rule 10):</span>
                <div className="space-y-1 font-mono text-xs">
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-400">Parent Results: </span>
                    <span className="text-emerald-700">{platformConfig.getSchoolResultsUrl("grace-academy")}</span>
                  </div>
                  <div className="p-2 bg-slate-50 rounded border border-slate-200">
                    <span className="text-slate-400">Staff Portal: </span>
                    <span className="text-blue-700">{platformConfig.getSchoolStaffUrl("grace-academy")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Supabase & Database Status Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900 text-lg flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3V7c0-2-1.5-3-3.5-3h-9C5.5 4 4 5 4 7zm0 0c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12c0 2 1.5 3 3.5 3h9c2 0 3.5-1 3.5-3" />
                </svg>
                Supabase & Prisma Status
              </h2>
              <span className={`text-xs px-2 py-0.5 rounded font-medium ${isSupabaseLive ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                {isSupabaseLive ? "Connected" : "Pending Keys"}
              </span>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">NEXT_PUBLIC_SUPABASE_URL</span>
                <span className="font-mono text-xs">
                  {supabase.url && !supabase.url.includes("placeholder") ? (
                    <span className="text-emerald-700 font-medium">Configured</span>
                  ) : (
                    <span className="text-amber-700">Set in .env.local</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
                <span className="font-mono text-xs">
                  {supabase.anonKey && !supabase.anonKey.includes("placeholder") ? (
                    <span className="text-emerald-700 font-medium">Configured</span>
                  ) : (
                    <span className="text-amber-700">Set in .env.local</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">SUPABASE_SERVICE_ROLE_KEY</span>
                <span className="font-mono text-xs">
                  {supabase.serviceRoleKey && !supabase.serviceRoleKey.includes("placeholder") ? (
                    <span className="text-emerald-700 font-medium">Configured (Server-only)</span>
                  ) : (
                    <span className="text-amber-700">Set in .env.local</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between py-1.5 border-b border-slate-50">
                <span className="text-slate-500">Prisma Client</span>
                <span className="font-mono text-xs text-emerald-700 font-medium">
                  Initialized (PostgreSQL)
                </span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
              <p className="font-semibold text-slate-800 mb-1">To connect your live Supabase project:</p>
              <p>Add your actual project URL and API keys in <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">.env.local</code>. Never commit your secrets.</p>
            </div>
          </div>
        </div>

        {/* Stack Overview */}
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
          <h2 className="font-semibold text-slate-900 text-base mb-3">Project Foundation Verified</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="block text-xs font-medium text-slate-500">Framework</span>
              <span className="font-bold text-slate-900">Next.js App Router</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="block text-xs font-medium text-slate-500">Styling</span>
              <span className="font-bold text-slate-900">Tailwind CSS</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="block text-xs font-medium text-slate-500">Database</span>
              <span className="font-bold text-slate-900">PostgreSQL (Supabase)</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="block text-xs font-medium text-slate-500">ORM</span>
              <span className="font-bold text-slate-900">Prisma Client</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        <p>{name} Platform &copy; 2026 &mdash; Configured on {domain}</p>
      </footer>
    </div>
  );
}
