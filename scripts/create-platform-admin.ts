// scripts/create-platform-admin.ts
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD!;

if (!ADMIN_EMAIL) {
  console.error("❌ Missing ADMIN_EMAIL environment variable.");
  process.exit(1);
}
if (!ADMIN_PASSWORD) {
  console.error("❌ Missing ADMIN_PASSWORD environment variable.");
  process.exit(1);
}

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
  });

  if (existing) {
    console.log(
      `ℹ️  Platform admin with email ${ADMIN_EMAIL} already exists – nothing to do.`,
    );
    return;
  }

  const hashed = await hashPassword(ADMIN_PASSWORD);

  await prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      name: "Platform Admin",
      password_hash: hashed,
      role: "platform_admin",
      must_change_password: true, // force change on first login
    },
  });

  console.log(`✅ Platform admin created with email ${ADMIN_EMAIL}.`);
}

main()
  .catch((e) => {
    console.error("❌ Error creating platform admin:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
