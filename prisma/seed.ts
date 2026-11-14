import { PrismaClient, Role, StudentStatus, TermStatus, ResultStatus, PinStatus } from '@prisma/client';
import { hashPin } from '../src/lib/auth/pin.ts';
import { hashPassword } from '../src/lib/auth/password.ts';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Resulta Comprehensive Database Seed ---');

  // 1. Create Platform Administrator (Me)
  const platformAdminHash = await hashPassword('PlatformAdmin123!');
  const platformAdmin = await prisma.user.upsert({
    where: { email: 'platform_admin@resulta.ng' },
    update: {
      password_hash: platformAdminHash,
    },
    create: {
      email: 'platform_admin@resulta.ng',
      name: 'Platform Root Admin',
      password_hash: platformAdminHash,
      role: Role.platform_admin,
      school_id: null,
      must_change_password: false,
    },
  });
  console.log(`[✓] Platform Admin created: ${platformAdmin.email}`);

  // 2. Create School A: Grace High School
  const schoolA = await prisma.school.upsert({
    where: { slug: 'grace-high' },
    update: {},
    create: {
      name: 'Grace High School',
      slug: 'grace-high',
      card_price: 2000.00,
      platform_share: 1000.00,
    },
  });
  console.log(`[✓] School A created: ${schoolA.name} (${schoolA.slug})`);

  // 3. Create School B: Kings College (For multi-tenancy cross-school isolation tests)
  const schoolB = await prisma.school.upsert({
    where: { slug: 'kings-college' },
    update: {},
    create: {
      name: 'Kings College',
      slug: 'kings-college',
      card_price: 2500.00,
      platform_share: 1000.00,
    },
  });
  console.log(`[✓] School B created: ${schoolB.name} (${schoolB.slug})`);

  // 4. Create Staff for School A
  const adminAHash = await hashPassword('SchoolAdmin123!');
  const teacherAHash = await hashPassword('TempTeacher123!');

  const adminA = await prisma.user.upsert({
    where: { email: 'admin@gracehigh.edu.ng' },
    update: { password_hash: adminAHash },
    create: {
      email: 'admin@gracehigh.edu.ng',
      name: 'Mr. Babatunde Lawal',
      password_hash: adminAHash,
      role: Role.school_admin,
      school_id: schoolA.id,
      must_change_password: false,
    },
  });

  const teacherA = await prisma.user.upsert({
    where: { email: 'teacher@gracehigh.edu.ng' },
    update: { password_hash: teacherAHash, must_change_password: true },
    create: {
      email: 'teacher@gracehigh.edu.ng',
      name: 'Mrs. Chidinma Okonkwo',
      password_hash: teacherAHash,
      role: Role.teacher,
      school_id: schoolA.id,
      must_change_password: true, // Temporary password to be changed
    },
  });

  // 5. Create Staff for School B
  const adminBHash = await hashPassword('KingsAdmin123!');
  const adminB = await prisma.user.upsert({
    where: { email: 'admin@kingscollege.edu.ng' },
    update: { password_hash: adminBHash },
    create: {
      email: 'admin@kingscollege.edu.ng',
      name: 'Alhaji Sanusi Mohammed',
      password_hash: adminBHash,
      role: Role.school_admin,
      school_id: schoolB.id,
      must_change_password: false,
    },
  });
  console.log(`[✓] Users created: School A Admin, School A Teacher, School B Admin`);

  // 6. Create Classes for School A
  const classA1 = await prisma.class.upsert({
    where: { school_id_name: { school_id: schoolA.id, name: 'JSS 1A' } },
    update: {},
    create: { school_id: schoolA.id, name: 'JSS 1A' },
  });

  const classA2 = await prisma.class.upsert({
    where: { school_id_name: { school_id: schoolA.id, name: 'JSS 1B' } },
    update: {},
    create: { school_id: schoolA.id, name: 'JSS 1B' },
  });

  // 7. Create Classes for School B
  const classB1 = await prisma.class.upsert({
    where: { school_id_name: { school_id: schoolB.id, name: 'SS 1 Science' } },
    update: {},
    create: { school_id: schoolB.id, name: 'SS 1 Science' },
  });
  console.log(`[✓] Classes created for School A (JSS 1A, JSS 1B) and School B (SS 1 Science)`);

  // 8. Create Subjects for School A
  const subjectsData = [
    { name: 'Mathematics', code: 'MTH' },
    { name: 'English Language', code: 'ENG' },
    { name: 'Basic Science', code: 'BSC' },
  ];

  const subjectsA = [];
  for (const s of subjectsData) {
    const subj = await prisma.subject.upsert({
      where: { school_id_name: { school_id: schoolA.id, name: s.name } },
      update: {},
      create: { school_id: schoolA.id, name: s.name, code: s.code },
    });
    subjectsA.push(subj);
  }

  // Subjects for School B
  const subjectB1 = await prisma.subject.upsert({
    where: { school_id_name: { school_id: schoolB.id, name: 'Physics' } },
    update: {},
    create: { school_id: schoolB.id, name: 'Physics', code: 'PHY' },
  });
  console.log(`[✓] Academic subjects registered for both schools`);

  // 9. Assign Teacher A ONLY to Class JSS 1A (Mathematics & English Language)
  // Teacher A is intentionally NOT assigned to Class JSS 1B or School B!
  await prisma.teacherAssignment.deleteMany({
    where: {
      teacher_id: teacherA.id,
      class_id: classA2.id,
    },
  });

  await prisma.teacherAssignment.upsert({
    where: {
      school_id_teacher_id_class_id_subject_id: {
        school_id: schoolA.id,
        teacher_id: teacherA.id,
        class_id: classA1.id,
        subject_id: subjectsA[0].id,
      },
    },
    update: {},
    create: {
      school_id: schoolA.id,
      teacher_id: teacherA.id,
      class_id: classA1.id,
      subject_id: subjectsA[0].id,
    },
  });

  await prisma.teacherAssignment.upsert({
    where: {
      school_id_teacher_id_class_id_subject_id: {
        school_id: schoolA.id,
        teacher_id: teacherA.id,
        class_id: classA1.id,
        subject_id: subjectsA[1].id,
      },
    },
    update: {},
    create: {
      school_id: schoolA.id,
      teacher_id: teacherA.id,
      class_id: classA1.id,
      subject_id: subjectsA[1].id,
    },
  });
  console.log(`[✓] Teacher A assigned strictly to Class JSS 1A (Mathematics & English). NOT assigned to JSS 1B.`);

  // 10. Create Term for School A
  const termA = await prisma.term.upsert({
    where: {
      school_id_session_term_number: {
        school_id: schoolA.id,
        session: '2026/2027',
        term_number: 1,
      },
    },
    update: {},
    create: {
      school_id: schoolA.id,
      session: '2026/2027',
      term_number: 1,
      start_date: new Date('2026-09-10'),
      end_date: new Date('2026-12-15'),
      status: TermStatus.PUBLISHED,
    },
  });

  // 11. Create 10 Students for School A (5 in JSS 1A, 5 in JSS 1B)
  const studentsRaw = [
    { admission: 'GHS/2026/001', name: 'Adebayo Oluwaseun', classId: classA1.id },
    { admission: 'GHS/2026/002', name: 'Chukwuma Ngozi', classId: classA1.id },
    { admission: 'GHS/2026/003', name: 'Ibrahim Fatima', classId: classA1.id },
    { admission: 'GHS/2026/004', name: 'Okafor Emeka', classId: classA1.id },
    { admission: 'GHS/2026/005', name: 'Danjuma Aisha', classId: classA1.id },
    { admission: 'GHS/2026/006', name: 'Bello Yusuf', classId: classA2.id },
    { admission: 'GHS/2026/007', name: 'Eze Chioma', classId: classA2.id },
    { admission: 'GHS/2026/008', name: 'Aliyu Musa', classId: classA2.id },
    { admission: 'GHS/2026/009', name: 'Okon Blessing', classId: classA2.id },
    { admission: 'GHS/2026/010', name: 'Adeleke Tunde', classId: classA2.id },
  ];

  for (let i = 0; i < studentsRaw.length; i++) {
    const s = studentsRaw[i];
    const student = await prisma.student.upsert({
      where: {
        school_id_admission_number: {
          school_id: schoolA.id,
          admission_number: s.admission,
        },
      },
      update: { full_name: s.name, class_id: s.classId },
      create: {
        school_id: schoolA.id,
        admission_number: s.admission,
        full_name: s.name,
        class_id: s.classId,
        status: StudentStatus.ACTIVE,
      },
    });

    await prisma.studentTermStatus.upsert({
      where: {
        student_id_term_id: { student_id: student.id, term_id: termA.id },
      },
      update: {},
      create: {
        school_id: schoolA.id,
        student_id: student.id,
        term_id: termA.id,
        fees_paid: true,
        result_locked: false,
      },
    });

    // Seed results for JSS 1A subjects
    for (const subj of subjectsA) {
      await prisma.result.upsert({
        where: {
          student_id_term_id_subject_id: {
            student_id: student.id,
            term_id: termA.id,
            subject_id: subj.id,
          },
        },
        update: {},
        create: {
          school_id: schoolA.id,
          student_id: student.id,
          term_id: termA.id,
          subject_id: subj.id,
          ca_score: 30,
          exam_score: 50,
          total: 80,
          grade: 'A',
          remark: 'Distinction',
          status: ResultStatus.SUBMITTED,
        },
      });
    }

    // Active PIN card
    const pinHash = hashPin(`82${String(i + 1).padStart(4, '0')}`);
    const existingPin = await prisma.pin.findFirst({
      where: { student_id: student.id, term_id: termA.id, status: PinStatus.ACTIVE },
    });

    if (!existingPin) {
      await prisma.pin.create({
        data: {
          school_id: schoolA.id,
          student_id: student.id,
          term_id: termA.id,
          pin_hash: pinHash,
          logins_used: 0,
          max_logins: 5,
          status: PinStatus.ACTIVE,
        },
      });
    }
  }

  // 12. Create a Student in School B
  await prisma.student.upsert({
    where: {
      school_id_admission_number: {
        school_id: schoolB.id,
        admission_number: 'KC/2026/001',
      },
    },
    update: {},
    create: {
      school_id: schoolB.id,
      admission_number: 'KC/2026/001',
      full_name: 'Adewale Bashir',
      class_id: classB1.id,
      status: StudentStatus.ACTIVE,
    },
  });

  console.log(`[✓] Seed completed successfully with full multi-tenancy testing structures.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
