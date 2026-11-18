'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log client-side error to console or monitoring service
    console.error('[Resulta App Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#FAF8F3] flex flex-col justify-between p-6">
      <header className="max-w-md mx-auto w-full text-center pt-8">
        <h1 className="text-xl font-serif font-bold text-[#2C2825]">Resulta</h1>
        <p className="text-xs font-mono text-[#6B645D]">School Result Management Platform</p>
      </header>

      <main className="max-w-md mx-auto w-full bg-white border border-[#E9E4D9] rounded-md p-8 shadow-xs text-center space-y-4 my-auto">
        <div className="w-14 h-14 bg-[#FBEBEB] border border-[#E0B4B4] rounded-full flex items-center justify-center mx-auto text-[#671B24]">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <h2 className="text-lg font-serif font-bold text-[#2C2825]">Something Went Wrong</h2>
        <p className="text-xs font-mono text-[#6B645D] leading-relaxed">
          We encountered an unexpected error while loading this page. During peak result-release periods, high server load may cause temporary delays.
        </p>

        {error?.digest && (
          <div className="p-2 bg-[#FAF8F3] border border-[#E9E4D9] rounded text-[10px] font-mono text-[#6B645D]">
            Reference Code: {error.digest}
          </div>
        )}

        <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-4 py-2 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono rounded font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try Again
          </button>
          <Link
            href="/"
            className="px-4 py-2 bg-white border border-[#D1CCC2] hover:bg-gray-50 text-[#2C2825] text-xs font-mono rounded font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Go Home
          </Link>
        </div>
      </main>

      <footer className="text-center text-[11px] font-mono text-[#6B645D] pb-6">
        Protected by Resulta High-Reliability Architecture
      </footer>
    </div>
  );
}
