import Link from 'next/link';
import { platformConfig } from '@/lib/config';
import { ShieldCheck, ArrowLeft, Lock, Database, Eye, Trash2, HelpCircle } from 'lucide-react';

export default function PrivacyNoticePage() {
  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[#671B24] hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 sm:p-8 mb-6 shadow-xs">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded bg-[#671B24] text-white flex items-center justify-center font-serif font-bold text-lg shadow-xs">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs font-mono uppercase tracking-wider text-[#671B24] block">
                Legal & Compliance Notice
              </span>
              <h1 className="text-2xl font-serif font-bold text-[#2C2825]">
                NDPA Privacy Notice & Data Protection Policy
              </h1>
            </div>
          </div>
          <p className="text-xs text-[#6B645D] leading-relaxed">
            In compliance with the <strong>Nigeria Data Protection Act (NDPA) 2023</strong>, this Privacy Notice explains how {platformConfig.name} collects, processes, stores, and protects personal and academic records of students, parents, and school staff.
          </p>
          <div className="mt-4 pt-4 border-t border-[#F4F0E6] flex flex-wrap gap-4 text-xs font-mono text-[#47423D]">
            <span>Effective Date: September 1, 2026</span>
            <span>•</span>
            <span>Version: 2.0 (NDPA Compliant)</span>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-6">
          {/* Section 1: Who We Are */}
          <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <h2 className="text-base font-serif font-bold text-[#2C2825] mb-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-[#671B24]" />
              1. Data Controller & Roles
            </h2>
            <p className="text-xs text-[#47423D] leading-relaxed">
              {platformConfig.name} operates as a Data Processor on behalf of the registered educational institutions (the Data Controllers). Each school determines the lawful basis and academic requirements for registering students and uploading term scores.
            </p>
          </div>

          {/* Section 2: Data We Collect */}
          <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <h2 className="text-base font-serif font-bold text-[#2C2825] mb-2 flex items-center gap-2">
              <Eye className="w-4 h-4 text-[#671B24]" />
              2. Categories of Personal Data Collected
            </h2>
            <div className="space-y-3 text-xs text-[#47423D]">
              <p>We process the following categories strictly for educational management:</p>
              <ul className="list-disc pl-5 space-y-1.5 text-[#47423D]">
                <li><strong>Student Information:</strong> Full name, student admission number, class assignment, and academic status.</li>
                <li><strong>Academic Performance:</strong> Continuous assessment (CA) scores, examination marks, grades, and terminal report card remarks.</li>
                <li><strong>Staff & Administrator Credentials:</strong> Name, official school email, role designation, and securely salted bcrypt password hashes.</li>
                <li><strong>Access Control:</strong> Cryptographically generated scratch card PINs stored exclusively as irreversibly hashed records.</li>
              </ul>
              <div className="p-3 bg-[#FAF8F3] border border-[#E9E4D9] rounded-xs text-[#671B24] font-medium text-xs">
                Important: Plain PINs and raw passwords are never logged, stored in plaintext, or visible to staff or administrators.
              </div>
            </div>
          </div>

          {/* Section 3: Lawful Basis & Purpose */}
          <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <h2 className="text-base font-serif font-bold text-[#2C2825] mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#671B24]" />
              3. Lawful Basis for Processing
            </h2>
            <p className="text-xs text-[#47423D] leading-relaxed mb-3">
              Processing is carried out pursuant to Section 25 of the NDPA 2023 under:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-xs text-[#47423D]">
              <li><strong>Performance of a Contract:</strong> Providing academic grading and report access services to enrolled students and families.</li>
              <li><strong>Legitimate Interests:</strong> Maintaining academic integrity, preventing fraudulent result modifications, and generating official examination transcripts.</li>
              <li><strong>Legal Obligation:</strong> Maintaining educational and audit compliance records as required by state education authorities.</li>
            </ul>
          </div>

          {/* Section 4: Data Subject Rights */}
          <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <h2 className="text-base font-serif font-bold text-[#2C2825] mb-2 flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-[#671B24]" />
              4. Your Rights Under the NDPA 2023
            </h2>
            <div className="space-y-2 text-xs text-[#47423D]">
              <p>Data subjects (or their parents/guardians if minors) have the right to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Right of Access:</strong> Request a copy of all personal records and academic history maintained by the school.</li>
                <li><strong>Right to Portability:</strong> Schools and administrators can export complete student data in structured, machine-readable JSON format via the Data Protection panel.</li>
                <li><strong>Right to Rectification:</strong> Request correction of inaccurate names or class assignments through the school administration.</li>
                <li><strong>Right to Erasure (Right to be Forgotten):</strong> Request deletion of personal records when a student departs, subject to statutory academic record retention rules.</li>
              </ul>
            </div>
          </div>

          {/* Section 5: Security & Contact */}
          <div className="bg-white border border-[#E9E4D9] rounded-sm p-6 shadow-xs">
            <h2 className="text-base font-serif font-bold text-[#2C2825] mb-2 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#671B24]" />
              5. Security Safeguards & Inquiries
            </h2>
            <p className="text-xs text-[#47423D] leading-relaxed mb-3">
              We employ strict multi-tenant database isolation, HTTPS-only secure cookies, Content Security Policies (CSP), rate limiting against brute force attempts, and comprehensive audit logs.
            </p>
            <p className="text-xs text-[#6B645D]">
              For privacy requests or to exercise your NDPA rights, contact your school administration or email the platform Data Protection Officer at: <span className="font-mono text-[#671B24]">dpo@{platformConfig.domain || "resulta.ng"}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
