import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getTeacherAssignedClasses } from '@/lib/auth/scope';
import { LogOut, KeyRound } from 'lucide-react';
import TeacherMyClassesClient from './TeacherMyClassesClient';

export const instant = false;

export default async function TeacherMyClassesPage() {
  const session = await getSession();

  if (!session) {
    redirect('/staff/login');
  }

  if (session.role !== 'teacher' && session.role !== 'school_admin' && session.role !== 'platform_admin') {
    redirect('/staff/login');
  }

  const assignedClasses = session.school_id
    ? await getTeacherAssignedClasses(session.id, session.school_id)
    : [];

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-[#E9E4D9] bg-[#FFFFFF]">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#3F4E40] text-white flex items-center justify-center font-serif font-bold text-sm">
              T
            </div>
            <div>
              <span className="font-semibold text-base text-[#2C2825] block leading-tight">
                {session.school_name || 'School Staff Portal'}
              </span>
              <span className="text-[11px] font-mono text-[#6B645D]">
                Teacher: {session.name} ({session.email})
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {session.must_change_password && (
              <a
                href="/staff/change-password"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-[#F6EBEB] text-[#671B24] border border-[#F0D5D5] hover:bg-[#F0D5D5] transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Change Temp Password
              </a>
            )}

            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-xs text-[#6B645D] hover:text-[#671B24] font-mono transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-5xl mx-auto px-6 py-8 w-full flex-1">
        {session.must_change_password && (
          <div className="mb-6 p-4 bg-[#F6EBEB] border border-[#F0D5D5] rounded-sm flex items-center justify-between text-xs text-[#671B24]">
            <div>
              <span className="font-semibold block mb-0.5 font-mono uppercase">Security Advisory</span>
              <p>You are using a temporary password provided by the platform administrator. Please update your password to secure your account.</p>
            </div>
            <a
              href="/staff/change-password"
              className="ml-4 px-3 py-1.5 bg-[#671B24] text-white rounded-sm font-mono text-xs hover:bg-[#52151D] transition-colors shrink-0"
            >
              Update Password
            </a>
          </div>
        )}

        {/* Main Workspace */}
        <TeacherMyClassesClient
          assignedClasses={assignedClasses}
          schoolName={session.school_name || undefined}
          userName={session.name}
          userRole={session.role}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E9E4D9] bg-[#FFFFFF] py-4 text-xs text-[#6B645D]">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <span>{session.school_name || 'Resulta'} Staff Portal</span>
          <span className="font-mono text-[11px]">Teacher Access Only</span>
        </div>
      </footer>
    </div>
  );
}
