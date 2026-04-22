import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";

const BCRYPT_COST = 12;

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[seed] missing required env var: ${key}`);
  }
  return value;
}

async function main() {
  const phone = requireEnv("SEED_SUPER_ADMIN_PHONE");
  const username = requireEnv("SEED_SUPER_ADMIN_USERNAME");
  const password = requireEnv("SEED_SUPER_ADMIN_PASSWORD");

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { phone } });
    if (existing) {
      console.log(`[seed] super admin ${phone} already exists, skipping`);
      return;
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await prisma.user.create({
      data: {
        phone,
        username,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
      },
    });
    console.log(`[seed] created super admin ${phone}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
