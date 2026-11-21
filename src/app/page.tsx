"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertCircle, Loader2, Sparkles, Phone, Mail, ArrowRight } from "lucide-react";

export default function HomePage() {
  const [schoolEmail, setSchoolEmail] = useState("");
  const [whatsappNumber1, setWhatsappNumber1] = useState("");
  const [whatsappNumber2, setWhatsappNumber2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!schoolEmail.trim()) {
      setError("Please provide your school email address.");
      return;
    }
    if (!whatsappNumber1.trim()) {
      setError("Please provide a reachable WhatsApp number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          school_email: schoolEmail.trim(),
          whatsapp_number1: whatsappNumber1.trim(),
          whatsapp_number2: whatsappNumber2.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit waitlist reservation.");
      }

      setSuccessMessage(data.message || "Thank you for joining the Resulta waitlist!");
      setSchoolEmail("");
      setWhatsappNumber1("");
      setWhatsappNumber2("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-between font-sans selection:bg-[#671B24] selection:text-white">
      {/* Main split grid: left content/form, right video element */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-screen">
        {/* Left Section: Waitlist & Branding */}
        <div className="flex flex-col justify-between p-8 sm:p-12 md:p-16 lg:p-20 xl:p-24 max-w-2xl mx-auto w-full">
          {/* Header Brand */}
          <div className="flex items-center justify-between">
            <Link href="/" className="inline-flex items-center gap-3 group">
              {/* Logo icon styled with Resulta brand burgundy */}
              {/* <div className="w-10 h-10 rounded-xl bg-[#671B24] text-white flex items-center justify-center font-serif font-black text-xl shadow-sm shadow-[#671B24]/20 group-hover:scale-105 transition-transform">
                R
              </div> */}
              <span className="font-bold text-2xl tracking-tight text-[#2C2825] mb-8">
                Resulta
              </span>
            </Link>

            {/* <Link
              href="/admin/login"
              className="text-xs font-mono text-[#6B645D] hover:text-[#671B24] px-3 py-1.5 rounded-full border border-[#E9E4D9] bg-white/70 hover:bg-white transition-all shadow-xs"
            >
              Admin Portal &rarr;
            </Link> */}
          </div>

          {/* Central Hero Body */}
          <div className="my-12 lg:my-auto">
            {/* Launching Badge
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#671B24]/5 border border-[#671B24]/15 text-[#671B24] text-[11px] font-mono font-semibold tracking-wider uppercase mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#671B24] animate-pulse" />
              LAUNCHING NEXT TERM, 2026
            </div> */}

            {/* Headline */}
            <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-[#2C2825] tracking-tight leading-[1.15] mb-5">
              Ready to automate your school results?
            </h1>

            {/* Subheading */}
            <p className="text-base sm:text-lg text-[#6B645D] leading-relaxed mb-8 font-normal">
              Join leading educators on the Resulta early access. Publish tamper-proof report cards, issue parent PINs, and manage exam scores in minutes.
            </p>

            {/* Waitlist Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3.5 rounded-lg bg-[#FBEBEB] border border-[#E0B4B4] text-[#671B24] text-xs font-mono flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-4 rounded-lg bg-[#EBF3EB] border border-[#BBD4BB] text-[#2C482C] text-xs font-mono flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#3F6B3F]" />
                  <div>
                    <strong className="block font-semibold mb-0.5">Reservation Confirmed!</strong>
                    <span>{successMessage}</span>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {/* 1. School Email */}
                <div>
                  <label className="block text-xs font-mono uppercase tracking-wider text-[#6B645D] mb-1.5">
                    School Email <span className="text-[#671B24]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#8C847B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      value={schoolEmail}
                      onChange={(e) => setSchoolEmail(e.target.value)}
                      placeholder="principal@school.edu.ng"
                      required
                      className="w-full pl-10 pr-4 py-3 bg-white border border-[#D9D3C7] rounded-lg text-sm text-[#2C2825] placeholder-[#A0988E] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24] transition-all"
                    />
                  </div>
                </div>

                {/* 2 & 3. WhatsApp Numbers Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#6B645D] mb-1.5">
                      WhatsApp 1 <span className="text-[#671B24]">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-[#8C847B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        value={whatsappNumber1}
                        onChange={(e) => setWhatsappNumber1(e.target.value)}
                        placeholder="+234 801 234 5678"
                        required
                        className="w-full pl-10 pr-3 py-3 bg-white border border-[#D9D3C7] rounded-lg text-sm text-[#2C2825] placeholder-[#A0988E] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24] transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase tracking-wider text-[#6B645D] mb-1.5">
                      WhatsApp 2 <span className="text-[11px] text-[#A0988E] font-normal lowercase">(optional)</span>
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-[#8C847B] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="tel"
                        value={whatsappNumber2}
                        onChange={(e) => setWhatsappNumber2(e.target.value)}
                        placeholder="+234 809 876 5432"
                        className="w-full pl-10 pr-3 py-3 bg-white border border-[#D9D3C7] rounded-lg text-sm text-[#2C2825] placeholder-[#A0988E] focus:outline-hidden focus:border-[#671B24] focus:ring-1 focus:ring-[#671B24] transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit CTA button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto px-8 py-3.5 bg-[#671B24] hover:bg-[#52151D] text-white font-medium text-sm rounded-lg shadow-sm shadow-[#671B24]/25 transition-all duration-150 inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Securing your spot...</span>
                    </>
                  ) : (
                    <>
                      <span>Join now</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Social Proof Avatars Section */}
            <div className="mt-8 pt-6 border-t border-[#E9E4D9] flex items-center gap-3">
              <div className="flex -space-x-2 overflow-hidden">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#E5EDE5] text-[#3F4E40] border-2 border-[#FAF8F3] text-xs font-bold font-mono">
                  JA
                </div>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#F6EBEB] text-[#671B24] border-2 border-[#FAF8F3] text-xs font-bold font-mono">
                  OK
                </div>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#E2E8F0] text-[#334155] border-2 border-[#FAF8F3] text-xs font-bold font-mono">
                  ME
                </div>
              </div>
              <p className="text-xs text-[#6B645D]">
                <strong className="font-semibold text-[#2C2825]">163+ educators</strong> have already joined
              </p>
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-6 border-t border-[#E9E4D9]/60 flex flex-wrap items-center justify-between text-xs text-[#8C847B] font-mono">
            <span>&copy; 2026 Resulta Platform</span>
            <span>Zero hardware &bull; 100% Cloud</span>
          </div>
        </div>

        {/* Right Section: Video Container */}
        <div className="relative min-h-[420px] lg:min-h-full flex items-center justify-center overflow-hidden border-t lg:border-t-0 lg:border-l border-[#E9E4D9]">
          {/* Subtle gradient vignette to blend with system palette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 z-10 pointer-events-none" />

          {/* Video element placeholder prepared for user's src */}
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-contain object-center absolute inset-0 z-0 opacity-90 top-0"
            // Insert your video src here:
            src="resulta-hero.mp4"
          >
            Your browser does not support the video tag.
          </video>

          {/* Video Placeholder Overlay / Fallback info card when no src is supplied */}
          {/* <div className="relative z-20 p-8 max-w-md text-center bg-black/40 backdrop-blur-md rounded-2xl border border-white/10 m-6 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-[#671B24]/80 text-white flex items-center justify-center mx-auto mb-4 border border-white/10 shadow-lg">
              <Sparkles className="w-6 h-6 text-[#E9E4D9]" />
            </div>
            <h3 className="text-white text-lg font-bold mb-2">
              Resulta Preview Video
            </h3>
            <p className="text-white/70 text-xs font-mono leading-relaxed mb-4">
              Add your video URL directly in <code className="text-[#FAF8F3] bg-white/10 px-1.5 py-0.5 rounded">src/app/page.tsx</code> on the <code className="text-[#FAF8F3] bg-white/10 px-1.5 py-0.5 rounded">&lt;video&gt;</code> element.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-white/90 text-[11px] font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Ready for your video source
            </div>
          </div> */}
        </div>
      </div>
    </div>
  );
}
