import Link from 'next/link';
import { FileQuestion, ArrowLeft, Home } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAF8F3] flex flex-col justify-between p-6">
      <header className="max-w-md mx-auto w-full text-center pt-8">
        <h1 className="text-xl font-serif font-bold text-[#2C2825]">Resulta</h1>
        <p className="text-xs font-mono text-[#6B645D]">School Result Management Platform</p>
      </header>

      <main className="max-w-md mx-auto w-full bg-white border border-[#E9E4D9] rounded-md p-8 shadow-xs text-center space-y-4 my-auto">
        <div className="w-14 h-14 bg-[#FAF8F3] border border-[#D1CCC2] rounded-full flex items-center justify-center mx-auto text-[#6B645D]">
          <FileQuestion className="w-7 h-7 text-[#3F4E40]" />
        </div>

        <h2 className="text-lg font-serif font-bold text-[#2C2825]">Page or Result Not Found</h2>
        <p className="text-xs font-mono text-[#6B645D] leading-relaxed">
          The requested page or student record could not be found. Please check your web address, student admission number, or contact your school administration.
        </p>

        <div className="pt-4 flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/"
            className="px-4 py-2 bg-[#3F4E40] hover:bg-[#344035] text-white text-xs font-mono rounded font-medium flex items-center justify-center gap-1.5 transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Return Home
          </Link>
        </div>
      </main>

      <footer className="text-center text-[11px] font-mono text-[#6B645D] pb-6">
        Resulta Platform • Reliable Academic Records
      </footer>
    </div>
  );
}
