import { PrismaClient, Role, StudentStatus, TermStatus, ResultStatus, PinStatus } from '@prisma/client';
import { hashPin } from '../src/lib/auth/pin.ts';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Resulta Database Seed ---');

  // 1. Create or upsert School
  const school = await prisma.school.upsert({
    where: { slug: 'grace-high' },
    update: {},
    create: {
      name: 'Grace High School',
      slug: 'grace-high',
      card_price: 2000.00,
      platform_share: 1000.00,
    },
  });
  console.log(`[✓] School created/verified: ${school.name} (id: ${school.id})`);

  // 2. Create School Admin & Teacher
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@gracehigh.edu.ng' },
    update: {},
    create: {
      email: 'admin@gracehigh.edu.ng',
      name: 'Mr. Babatunde Lawal',
      password_hash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6W65Wv5Wv5Wv5Wv5W', // placeholder hash
      role: Role.school_admin,
      school_id: school.id,
    },
  });

  const teacherUser = await prisma.user.upsert({
    where: { email: 'teacher@gracehigh.edu.ng' },
    update: {},
    create: {
      email: 'teacher@gracehigh.edu.ng',
      name: 'Mrs. Chidinma Okonkwo',
      password_hash: '$2b$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQmG6W65Wv5Wv5Wv5Wv5W',
      role: Role.teacher,
      school_id: school.id,
    },
  });
  console.log(`[✓] Users created: 1 School Admin, 1 Teacher`);

  // 3. Create 2 Classes
  const classA = await prisma.class.upsert({
    where: {
      school_id_name: {
        school_id: school.id,
        name: 'JSS 1A',
      },
    },
    update: {},
    create: {
      school_id: school.id,
      name: 'JSS 1A',
    },
  });

  const classB = await prisma.class.upsert({
    where: {
      school_id_name: {
        school_id: school.id,
        name: 'JSS 1B',
      },
    },
    update: {},
    create: {
      school_id: school.id,
      name: 'JSS 1B',
    },
  });
  console.log(`[✓] Classes created: JSS 1A, JSS 1B`);

  // 4. Create 3 Subjects
  const subjectsData = [
    { name: 'Mathematics', code: 'MTH' },
    { name: 'English Language', code: 'ENG' },
    { name: 'Basic Science', code: 'BSC' },
  ];

  const subjects = [];
  for (const s of subjectsData) {
    const subject = await prisma.subject.upsert({
      where: {
        school_id_name: {
          school_id: school.id,
          name: s.name,
        },
      },
      update: {},
      create: {
        school_id: school.id,
        name: s.name,
        code: s.code,
      },
    });
    subjects.push(subject);
  }
  console.log(`[✓] Subjects created: ${subjects.map((s) => s.name).join(', ')}`);

  // 5. Assign Teacher to Classes and Subjects
  for (const cls of [classA, classB]) {
    for (const subj of subjects) {
      await prisma.teacherAssignment.upsert({
        where: {
          school_id_teacher_id_class_id_subject_id: {
            school_id: school.id,
            teacher_id: teacherUser.id,
            class_id: cls.id,
            subject_id: subj.id,
          },
        },
        update: {},
        create: {
          school_id: school.id,
          teacher_id: teacherUser.id,
          class_id: cls.id,
          subject_id: subj.id,
        },
      });
    }
  }
  console.log(`[✓] Teacher assignments registered for both classes`);

  // 6. Create 1 Term (Published 1st Term 2026/2027)
  const term = await prisma.term.upsert({
    where: {
      school_id_session_term_number: {
        school_id: school.id,
        session: '2026/2027',
        term_number: 1,
      },
    },
    update: {},
    create: {
      school_id: school.id,
      session: '2026/2027',
      term_number: 1,
      start_date: new Date('2026-09-10'),
      end_date: new Date('2026-12-15'),
      status: TermStatus.PUBLISHED,
    },
  });
  console.log(`[✓] Term created: 2026/2027 Session - 1st Term (Status: PUBLISHED)`);

  // 7. Create 10 Students (5 in JSS 1A, 5 in JSS 1B)
  const studentsRaw = [
    { admission: 'GHS/2026/001', name: 'Adebayo Oluwaseun', classId: classA.id },
    { admission: 'GHS/2026/002', name: 'Chukwuma Ngozi', classId: classA.id },
    { admission: 'GHS/2026/003', name: 'Ibrahim Fatima', classId: classA.id },
    { admission: 'GHS/2026/004', name: 'Okafor Emeka', classId: classA.id },
    { admission: 'GHS/2026/005', name: 'Danjuma Aisha', classId: classA.id },
    { admission: 'GHS/2026/006', name: 'Bello Yusuf', classId: classB.id },
    { admission: 'GHS/2026/007', name: 'Eze Chioma', classId: classB.id },
    { admission: 'GHS/2026/008', name: 'Aliyu Musa', classId: classB.id },
    { admission: 'GHS/2026/009', name: 'Okon Blessing', classId: classB.id },
    { admission: 'GHS/2026/010', name: 'Adeleke Tunde', classId: classB.id },
  ];

  console.log(`[✓] Seeding 10 students, results, term statuses, and secure PIN cards...`);

  for (let i = 0; i < studentsRaw.length; i++) {
    const s = studentsRaw[i];
    const student = await prisma.student.upsert({
      where: {
        school_id_admission_number: {
          school_id: school.id,
          admission_number: s.admission,
        },
      },
      update: {
        full_name: s.name,
        class_id: s.classId,
      },
      create: {
        school_id: school.id,
        admission_number: s.admission,
        full_name: s.name,
        class_id: s.classId,
        status: StudentStatus.ACTIVE,
      },
    });

    // Student Term Status
    await prisma.studentTermStatus.upsert({
      where: {
        student_id_term_id: {
          student_id: student.id,
          term_id: term.id,
        },
      },
      update: {},
      create: {
        school_id: school.id,
        student_id: student.id,
        term_id: term.id,
        fees_paid: true,
        result_locked: false,
      },
    });

    // Results in the 3 subjects
    for (let subjIdx = 0; subjIdx < subjects.length; subjIdx++) {
      const subj = subjects[subjIdx];
      // Generate realistic test scores
      const caScore = 24 + ((i * 3 + subjIdx * 7) % 15); // CA out of 40
      const examScore = 38 + ((i * 5 + subjIdx * 11) % 22); // Exam out of 60
      const total = caScore + examScore;

      let grade = 'C';
      let remark = 'Credit';
      if (total >= 75) {
        grade = 'A';
        remark = 'Distinction';
      } else if (total >= 65) {
        grade = 'B';
        remark = 'Very Good';
      } else if (total >= 50) {
        grade = 'C';
        remark = 'Credit';
      } else if (total >= 40) {
        grade = 'D';
        remark = 'Pass';
      } else {
        grade = 'F';
        remark = 'Fail';
      }

      await prisma.result.upsert({
        where: {
          student_id_term_id_subject_id: {
            student_id: student.id,
            term_id: term.id,
            subject_id: subj.id,
          },
        },
        update: {
          ca_score: caScore,
          exam_score: examScore,
          total: total,
          grade,
          remark,
          status: ResultStatus.SUBMITTED,
        },
        create: {
          school_id: school.id,
          student_id: student.id,
          term_id: term.id,
          subject_id: subj.id,
          ca_score: caScore,
          exam_score: examScore,
          total: total,
          grade,
          remark,
          status: ResultStatus.SUBMITTED,
        },
      });
    }

    // Generate 1 Active PIN per student per term
    // Demo PIN pattern: e.g. "123456" for demo ease, securely hashed with HMAC-SHA-256
    const demoPlainPin = `82${String(i + 1).padStart(4, '0')}`;
    const pinHash = hashPin(demoPlainPin);

    // Expire old pins for this student/term if any exist
    await prisma.pin.updateMany({
      where: {
        student_id: student.id,
        term_id: term.id,
        status: PinStatus.ACTIVE,
      },
      data: {
        status: PinStatus.EXPIRED,
      },
    });

    await prisma.pin.create({
      data: {
        school_id: school.id,
        student_id: student.id,
        term_id: term.id,
        pin_hash: pinHash,
        logins_used: 0,
        max_logins: 5,
        status: PinStatus.ACTIVE,
      },
    });
  }

  console.log(`[✓] Successfully seeded 10 students with results and active PIN cards.`);
  console.log('--- Seed Completed Successfully ---');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
