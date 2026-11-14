import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { getTeacherAssignedClasses } from '@/lib/auth/scope';
import { BookOpen, Users, LogOut, KeyRound } from 'lucide-react';

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

        {/* Page Title */}
        <div className="border-b border-[#E9E4D9] pb-4 mb-6 flex items-center justify-between">
          <div>
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-[#3F4E40] block">
              Teaching Schedule & Access
            </span>
            <h1 className="mt-1 text-2xl font-serif font-bold text-[#2C2825] tracking-tight">
              My Classes
            </h1>
          </div>
          <span className="text-xs font-mono text-[#6B645D] bg-[#F4F0E6] px-2.5 py-1 rounded border border-[#E9E4D9]">
            {assignedClasses.length} {assignedClasses.length === 1 ? 'Class Assigned' : 'Classes Assigned'}
          </span>
        </div>

        {/* Classes Table */}
        <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
          <div className="px-5 py-3 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
              Assigned Classes & Subjects
            </span>
            <span className="text-[11px] font-mono text-[#6B645D]">
              Scoped to {session.school_name || 'Current School'}
            </span>
          </div>

          {assignedClasses.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#6B645D]">
              <BookOpen className="w-8 h-8 text-[#B8B0A5] mx-auto mb-2" />
              <p className="font-medium text-[#47423D]">No teaching classes assigned yet.</p>
              <p className="mt-1">Class and subject assignments are managed by the platform administrator.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                    <th className="py-3 px-5 font-medium">Class Name</th>
                    <th className="py-3 px-5 font-medium">Assigned Subject(s)</th>
                    <th className="py-3 px-5 font-medium text-center">Enrolled Students</th>
                    <th className="py-3 px-5 font-medium text-right">Access Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F0E6]">
                  {assignedClasses.map((cls) => (
                    <tr key={cls.id} className="hover:bg-[#FAF8F3] transition-colors">
                      <td className="py-3.5 px-5 font-semibold text-[#2C2825]">
                        {cls.name}
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex flex-wrap gap-1.5">
                          {cls.subjects.map((subj) => (
                            <span
                              key={subj.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]"
                            >
                              {subj.name} {subj.code ? `(${subj.code})` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3.5 px-5 text-center font-mono">
                        <span className="inline-flex items-center gap-1 text-[#47423D]">
                          <Users className="w-3.5 h-3.5 text-[#6B645D]" />
                          {cls.studentCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-right font-mono text-[11px]">
                        <span className="text-[#3F4E40] font-medium">Authorized</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
