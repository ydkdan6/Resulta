// prisma/seed.ts
/* -------------------------------------------------------------------------
 * Development seed – idempotent, guard-aware.
 * Creates: platform_admin, 2 schools, 2 classes + 3 subjects per school,
 *          1 teacher + 1 school_admin per school (temp passwords printed once),
 *          10 students per school.
 * ----------------------------------------------------------------------- */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

function randomPassword(): string {
  return crypto.randomBytes(9).toString("base64").slice(0, 12);
}

async function hash(pw: string): Promise<string> {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

// 1️⃣ Platform admin
async function ensurePlatformAdmin() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }
  await prisma.user.upsert({
    where: { email },
    create: { email, name: "Platform Admin", role: Role.platform_admin, password_hash: await hash(password) },
    update: {},
  });
  console.log("[seed] Platform admin ensured.");
}

// 2️⃣ Schools
const SCHOOLS = [
  { name: "Grace High", slug: "gracehigh", card_price: 1000, platform_share: 500 },
  { name: "Kings College", slug: "kingscollege", card_price: 1000, platform_share: 500 },
];

async function ensureSchools() {
  const map: Record<string, { id: string; slug: string }> = {};
  for (const s of SCHOOLS) {
    const school = await prisma.school.upsert({
      where: { slug: s.slug },
      create: { name: s.name, slug: s.slug, card_price: s.card_price, platform_share: s.platform_share },
      update: {},
    });
    map[s.slug] = school;
    console.log(`[seed] School "${s.name}" ensured.`);
  }
  return map;
}

// 3️⃣ Classes & subjects
async function ensureClassesAndSubjects(schoolMap: Record<string, { id: string }>) {
  for (const slug of Object.keys(schoolMap)) {
    const { id: school_id } = schoolMap[slug];
    for (const className of [`${slug}-class-1`, `${slug}-class-2`]) {
      await prisma.class.upsert({
        where: { school_id_name: { school_id, name: className } },
        create: { school_id, name: className },
        update: {},
      });
    }
    for (const sub of ["Mathematics", "English", "Science"]) {
      await prisma.subject.upsert({
        where: { school_id_name: { school_id, name: sub } },
        create: { school_id, name: sub },
        update: {},
      });
    }
    console.log(`[seed] Classes & subjects for ${slug} ensured.`);
  }
}

// 4️⃣ Teachers & school admins
async function ensureUsers(schoolMap: Record<string, { id: string }>) {
  for (const slug of Object.keys(schoolMap)) {
    const { id: school_id } = schoolMap[slug];

    const teacherPw = randomPassword();
    await prisma.user.upsert({
      where: { email: `teacher_${slug}@example.com` },
      create: {
        email: `teacher_${slug}@example.com`,
        name: `${slug} Teacher`,
        role: Role.teacher,
        school_id,
        password_hash: await hash(teacherPw),
        must_change_password: true,
      },
      update: {},
    });
    console.log(`[seed] Teacher for ${slug} – temporary password: ${teacherPw}`);

    const adminPw = randomPassword();
    await prisma.user.upsert({
      where: { email: `admin_${slug}@example.com` },
      create: {
        email: `admin_${slug}@example.com`,
        name: `${slug} School Admin`,
        role: Role.school_admin,
        school_id,
        password_hash: await hash(adminPw),
        must_change_password: true,
      },
      update: {},
    });
    console.log(`[seed] School admin for ${slug} – temporary password: ${adminPw}`);
  }
}

// 5️⃣ Students
async function ensureStudents(schoolMap: Record<string, { id: string }>) {
  for (const slug of Object.keys(schoolMap)) {
    const { id: school_id } = schoolMap[slug];
    const classes = await prisma.class.findMany({
      where: { school_id },
      orderBy: { name: "asc" },
    });
    for (let i = 1; i <= 10; i++) {
      const admission_number = `${slug.toUpperCase()}-${i.toString().padStart(3, "0")}`;
      await prisma.student.upsert({
        where: { school_id_admission_number: { school_id, admission_number } },
        create: {
          admission_number,
          full_name: `Student ${i} ${slug}`,
          school_id,
          class_id: classes[i % classes.length].id,
          status: "ACTIVE",
        },
        update: {},
      });
    }
    console.log(`[seed] 10 students for ${slug} ensured.`);
  }
}

(async () => {
  try {
    await ensurePlatformAdmin();
    const schoolMap = await ensureSchools();
    await ensureClassesAndSubjects(schoolMap);
    await ensureUsers(schoolMap);
    await ensureStudents(schoolMap);
    console.log("\x1b[32m[seed] ✅ Seed complete.\x1b[0m");
  } catch (e) {
    console.error("\x1b[31m[seed] ❌ Failed:", e, "\x1b[0m");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
