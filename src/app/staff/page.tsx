import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Building2, Users, GraduationCap, BookOpen, LogOut } from 'lucide-react';
import SchoolAdminSettingsClient from './SchoolAdminSettingsClient';

export default async function SchoolAdminPortalPage() {
  const session = await getSession();

  if (!session) {
    redirect('/staff/login');
  }

  // Teachers are strictly restricted to /staff/my-classes
  if (session.role === 'teacher') {
    redirect('/staff/my-classes');
  }

  if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
    redirect('/staff/login');
  }

  const school = session.school_id
    ? await prisma.school.findUnique({
        where: { id: session.school_id },
        include: {
          classes: {
            select: { id: true, name: true, _count: { select: { students: true } } },
            orderBy: { name: 'asc' },
          },
          subjects: {
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
          },
          users: {
            where: { role: 'teacher' },
            select: {
              id: true,
              name: true,
              email: true,
              teacherAssignments: {
                include: {
                  class: { select: { id: true, name: true } },
                  subject: { select: { id: true, name: true } },
                },
              },
            },
            orderBy: { name: 'asc' },
          },
          _count: {
            select: {
              students: true,
              classes: true,
              terms: true,
            },
          },
        },
      })
    : null;

  if (!school) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] p-10 text-center text-xs text-[#671B24]">
        School profile not found for this account.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F3] text-[#2C2825] flex flex-col justify-between">
      {/* Top Header */}
      <header className="border-b border-[#E9E4D9] bg-[#FFFFFF]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-[#3F4E40] text-white flex items-center justify-center font-serif font-bold text-sm">
              S
            </div>
            <div>
              <span className="font-semibold text-base text-[#2C2825] block leading-tight">
                {school.name}
              </span>
              <span className="text-[11px] font-mono text-[#6B645D]">
                School Admin: {session.name} ({session.email})
              </span>
            </div>
          </div>

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
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-8 w-full flex-1">
        {/* Page Header */}
        <div className="border-b border-[#E9E4D9] pb-4 mb-6">
          <span className="text-xs font-mono font-medium uppercase tracking-wider text-[#3F4E40] block">
            School Administration
          </span>
          <h1 className="mt-1 text-2xl font-serif font-bold text-[#2C2825] tracking-tight">
            School Operations Overview
          </h1>
          <p className="mt-1 text-xs text-[#6B645D]">
            Manage school settings, review classes, and view assigned teachers. Teacher creation and assignments are managed by platform administrators.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-[#E9E4D9] p-4 rounded-sm">
            <span className="text-[11px] font-mono uppercase text-[#6B645D] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#3F4E40]" /> Total Enrolled Students
            </span>
            <span className="text-2xl font-serif font-bold text-[#2C2825] mt-1 block">
              {school._count.students}
            </span>
          </div>

          <div className="bg-white border border-[#E9E4D9] p-4 rounded-sm">
            <span className="text-[11px] font-mono uppercase text-[#6B645D] flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[#3F4E40]" /> Active Classes
            </span>
            <span className="text-2xl font-serif font-bold text-[#2C2825] mt-1 block">
              {school._count.classes}
            </span>
          </div>

          <div className="bg-white border border-[#E9E4D9] p-4 rounded-sm">
            <span className="text-[11px] font-mono uppercase text-[#6B645D] flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5 text-[#3F4E40]" /> Teaching Staff
            </span>
            <span className="text-2xl font-serif font-bold text-[#2C2825] mt-1 block">
              {school.users.length}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Classes & Teaching Staff Summary */}
          <div className="lg:col-span-2 space-y-6">
            {/* Classes Table */}
            <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
              <div className="px-5 py-3 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                  Classes in {school.name}
                </span>
                <span className="text-[11px] font-mono text-[#6B645D]">
                  {school.classes.length} Classes
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                      <th className="py-2.5 px-5 font-medium">Class Name</th>
                      <th className="py-2.5 px-5 font-medium text-center">Enrolled Students</th>
                      <th className="py-2.5 px-5 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F0E6]">
                    {school.classes.map((cls) => (
                      <tr key={cls.id} className="hover:bg-[#FAF8F3]">
                        <td className="py-3 px-5 font-semibold text-[#2C2825]">{cls.name}</td>
                        <td className="py-3 px-5 text-center font-mono">{cls._count.students}</td>
                        <td className="py-3 px-5 text-right font-mono text-[11px] text-[#3F4E40]">Active</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Teaching Staff Table */}
            <div className="border border-[#E9E4D9] bg-[#FFFFFF] rounded-sm">
              <div className="px-5 py-3 border-b border-[#E9E4D9] bg-[#FAF8F3] flex items-center justify-between">
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#47423D]">
                  Assigned Teaching Staff
                </span>
                <span className="text-[11px] font-mono text-[#6B645D]">
                  Platform Admin Managed
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-[#E9E4D9] bg-[#FAF8F3] text-[#6B645D] font-mono text-[11px]">
                      <th className="py-2.5 px-5 font-medium">Teacher</th>
                      <th className="py-2.5 px-5 font-medium">Email</th>
                      <th className="py-2.5 px-5 font-medium">Class & Subject Assignments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F4F0E6]">
                    {school.users.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-6 text-center text-xs text-[#6B645D]">
                          No teachers assigned yet. Contact platform administrator to add teachers.
                        </td>
                      </tr>
                    ) : (
                      school.users.map((t) => (
                        <tr key={t.id} className="hover:bg-[#FAF8F3]">
                          <td className="py-3 px-5 font-semibold text-[#2C2825]">{t.name}</td>
                          <td className="py-3 px-5 font-mono text-[#47423D]">{t.email}</td>
                          <td className="py-3 px-5">
                            <div className="flex flex-wrap gap-1">
                              {t.teacherAssignments.map((a) => (
                                <span
                                  key={a.id}
                                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-[#E5EDE5] text-[#3F4E40] border border-[#D3DDD3]"
                                >
                                  {a.class.name}: {a.subject.name}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* School Name & Logo Settings (Rule 13: school_admin can edit name and logo) */}
          <div>
            <SchoolAdminSettingsClient
              schoolId={school.id}
              currentName={school.name}
              currentLogo={school.logo_url}
              schoolSlug={school.slug}
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E9E4D9] bg-[#FFFFFF] py-4 text-xs text-[#6B645D]">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <span>{school.name} Administration</span>
          <span className="font-mono text-[11px]">Subdomain: {school.slug}</span>
        </div>
      </footer>
    </div>
  );
}
