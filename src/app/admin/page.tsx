import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import AdminDashboardClient from './AdminDashboardClient';

export default async function PlatformAdminDashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/admin/login');
  }

  if (session.role !== 'platform_admin') {
    redirect('/admin/login');
  }

  // Fetch all schools with their classes, subjects, and teachers
  const [schoolsRaw, teachers] = await Promise.all([
    prisma.school.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        classes: {
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        },
        subjects: {
          select: { id: true, name: true, code: true },
          orderBy: { name: 'asc' },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            must_change_password: true,
          },
        },
        _count: {
          select: {
            classes: true,
            subjects: true,
            students: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: 'teacher' },
      select: {
        id: true,
        name: true,
        email: true,
        school_id: true,
        school: { select: { id: true, name: true, slug: true } },
        must_change_password: true,
        teacherAssignments: {
          include: {
            class: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  const schools = schoolsRaw.map((s) => ({
    ...s,
    card_price: Number(s.card_price),
    platform_share: Number(s.platform_share),
    users: s.users.map((u) => ({ ...u, email: u.email ?? "" })),
    roster_confirmed_at: s.roster_confirmed_at ? s.roster_confirmed_at.toISOString() : null,
    roster_confirmed_count: s.roster_confirmed_count ?? null,
  }));

  const teacherList = teachers.map((t) => ({ ...t, email: t.email ?? "" }));

  return (
    <AdminDashboardClient
      adminName={session.name}
      adminEmail={session.email}
      initialSchools={schools}
      initialTeachers={teacherList}
    />
  );
}
