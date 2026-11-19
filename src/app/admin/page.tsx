import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import AdminDashboardClient from './AdminDashboardClient';

export const instant = false;

export default async function PlatformAdminDashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect('/admin/login');
  }

  if (session.role !== 'platform_admin') {
    redirect('/admin/login');
  }

  // Fetch all schools with their classes, subjects, teachers, and payment batches
  const [schoolsRaw, teachers, batchesRaw] = await Promise.all([
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
    prisma.paymentBatch.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        school: {
          select: { id: true, name: true, slug: true, platform_share: true },
        },
        term: {
          select: { id: true, session: true, term_number: true },
        },
        confirmer: {
          select: { id: true, name: true, email: true },
        },
      },
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

  const initialBatches = batchesRaw.map((b) => ({
    id: b.id,
    school_id: b.school_id,
    students_count: b.students_count,
    amount_due: b.amount_due ? b.amount_due.toString() : "0",
    amount_received: b.amount_received ? b.amount_received.toString() : "0",
    status: b.status as "PENDING" | "CONFIRMED" | "REJECTED",
    created_at: b.created_at.toISOString(),
    confirmed_at: b.confirmed_at ? b.confirmed_at.toISOString() : null,
    school: {
      id: b.school.id,
      name: b.school.name,
      slug: b.school.slug,
      platform_share: b.school.platform_share ? b.school.platform_share.toString() : "1000",
    },
    term: {
      id: b.term.id,
      session: b.term.session,
      term_number: b.term.term_number,
    },
    confirmer: b.confirmer ? { name: b.confirmer.name, email: b.confirmer.email || "" } : null,
  }));

  return (
    <AdminDashboardClient
      adminName={session.name}
      adminEmail={session.email}
      initialSchools={schools}
      initialTeachers={teacherList}
      initialBatches={initialBatches}
    />
  );
}
