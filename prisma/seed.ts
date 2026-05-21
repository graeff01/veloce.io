import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME ?? "Administrador";

  if (!adminEmail || !adminPassword) {
    console.log("Seed operacional: nenhum dado demo sera criado.");
    console.log("Para criar o primeiro admin, defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD.");
    return;
  }

  const password = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      password,
      role: "ADMIN",
      active: true,
      deletedAt: null,
    },
    create: {
      name: adminName,
      email: adminEmail,
      password,
      role: "ADMIN",
      operationalRole: "Founder",
    },
  });

  console.log(`Admin operacional pronto: ${adminEmail}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
