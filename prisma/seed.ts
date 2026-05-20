import "dotenv/config";
import { PrismaClient, TaskStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

async function main() {
  console.log("🌱 Seeding database...");

  // Users
  const adminPassword = await bcrypt.hash("admin123", 12);
  const opsPassword = await bcrypt.hash("ops123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@veloce.io" },
    update: {},
    create: {
      name: "Admin Veloce",
      email: "admin@veloce.io",
      password: adminPassword,
      role: "ADMIN",
    },
  });

  const ops = await prisma.user.upsert({
    where: { email: "ops@veloce.io" },
    update: {},
    create: {
      name: "Ana Lima",
      email: "ops@veloce.io",
      password: opsPassword,
      role: "OPERATIONAL",
    },
  });

  console.log("✅ Users created");

  // Plans
  const essencial = await prisma.plan.upsert({
    where: { id: "plan-essencial" },
    update: {},
    create: {
      id: "plan-essencial",
      name: "Plano Essencial",
      description: "Ideal para pequenas marcas que estão começando",
      items: {
        create: [
          { type: "Post Feed", quantity: 8 },
          { type: "Story", quantity: 12 },
          { type: "Criativo", quantity: 4 },
        ],
      },
    },
  });

  const pro = await prisma.plan.upsert({
    where: { id: "plan-pro" },
    update: {},
    create: {
      id: "plan-pro",
      name: "Plano Pro",
      description: "Para marcas que querem escalar a presença digital",
      items: {
        create: [
          { type: "Post Feed", quantity: 16 },
          { type: "Story", quantity: 20 },
          { type: "Criativo", quantity: 8 },
          { type: "Campanha", quantity: 2 },
          { type: "Reels", quantity: 4 },
        ],
      },
    },
  });

  console.log("✅ Plans created");

  // Clients
  const clientAlpha = await prisma.client.upsert({
    where: { slug: "marca-alpha" },
    update: {},
    create: {
      name: "Marca Alpha",
      slug: "marca-alpha",
      email: "contato@marcaalpha.com",
      status: "ACTIVE",
      activePlanId: pro.id,
    },
  });

  const clientBeta = await prisma.client.upsert({
    where: { slug: "startup-beta" },
    update: {},
    create: {
      name: "Startup Beta",
      slug: "startup-beta",
      email: "marketing@startupbeta.io",
      status: "ACTIVE",
      activePlanId: essencial.id,
    },
  });

  const clientGamma = await prisma.client.upsert({
    where: { slug: "loja-gamma" },
    update: {},
    create: {
      name: "Loja Gamma",
      slug: "loja-gamma",
      email: "digital@lojagamma.com",
      status: "ACTIVE",
      activePlanId: essencial.id,
    },
  });

  console.log("✅ Clients created");

  // Apply plans (current month)
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  await prisma.clientPlan.createMany({
    skipDuplicates: true,
    data: [
      { clientId: clientAlpha.id, planId: pro.id, month, year, appliedBy: admin.id },
      { clientId: clientBeta.id, planId: essencial.id, month, year, appliedBy: admin.id },
      { clientId: clientGamma.id, planId: essencial.id, month, year, appliedBy: admin.id },
    ],
  });

  console.log("✅ ClientPlans created");

  // Sample tasks for Marca Alpha
  const today = new Date();
  const taskDates = {
    overdue: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000),
    yesterday: new Date(today.getTime() - 1 * 24 * 60 * 60 * 1000),
    tomorrow: new Date(today.getTime() + 1 * 24 * 60 * 60 * 1000),
    nextWeek: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000),
    endOfMonth: new Date(year, month - 1 + 1, 0),
  };

  const alphaTasks: Array<{ title: string; type: string; status: TaskStatus; dueDate: Date; assignedTo: string }> = [
    { title: "Post Feed — Lançamento verão", type: "Post Feed", status: TaskStatus.DONE, dueDate: taskDates.yesterday, assignedTo: ops.id },
    { title: "Stories da campanha Black Friday", type: "Story", status: TaskStatus.DONE, dueDate: taskDates.yesterday, assignedTo: ops.id },
    { title: "Criativo banner principal", type: "Criativo", status: TaskStatus.IN_PROGRESS, dueDate: taskDates.tomorrow, assignedTo: ops.id },
    { title: "Post Feed — Promoção semana", type: "Post Feed", status: TaskStatus.IN_PROGRESS, dueDate: taskDates.tomorrow, assignedTo: ops.id },
    { title: "Stories engajamento do mês", type: "Story", status: TaskStatus.TODO, dueDate: taskDates.nextWeek, assignedTo: ops.id },
    { title: "Campanha Google Ads — Q1", type: "Campanha", status: TaskStatus.REVIEW, dueDate: taskDates.tomorrow, assignedTo: admin.id },
    { title: "Post Feed — Datas comemorativas", type: "Post Feed", status: TaskStatus.TODO, dueDate: taskDates.nextWeek, assignedTo: ops.id },
    { title: "Reels produto destaque", type: "Reels", status: TaskStatus.TODO, dueDate: taskDates.endOfMonth, assignedTo: ops.id },
    { title: "Post atrasado — Review pendente", type: "Post Feed", status: TaskStatus.TODO, dueDate: taskDates.overdue, assignedTo: ops.id },
  ];

  for (const task of alphaTasks) {
    await prisma.task.create({
      data: {
        ...task,
        clientId: clientAlpha.id,
        planMonth: month,
        planYear: year,
        checklists: task.type === "Criativo" ? {
          create: [
            { text: "Brief criativo aprovado", done: true, order: 0 },
            { text: "Primeira versão enviada", done: true, order: 1 },
            { text: "Feedback do cliente", done: false, order: 2 },
            { text: "Versão final aprovada", done: false, order: 3 },
          ],
        } : undefined,
      },
    });
  }

  // Sample tasks for Startup Beta
  const betaTasks: Array<{ title: string; type: string; status: TaskStatus; dueDate: Date; assignedTo: string }> = [
    { title: "Post produto novo", type: "Post Feed", status: TaskStatus.DONE, dueDate: taskDates.yesterday, assignedTo: ops.id },
    { title: "Stories semana 1", type: "Story", status: TaskStatus.TODO, dueDate: taskDates.nextWeek, assignedTo: ops.id },
    { title: "Criativo evento", type: "Criativo", status: TaskStatus.IN_PROGRESS, dueDate: taskDates.tomorrow, assignedTo: admin.id },
  ];

  for (const task of betaTasks) {
    await prisma.task.create({
      data: { ...task, clientId: clientBeta.id, planMonth: month, planYear: year },
    });
  }

  // Execution logs for clients
  await prisma.executionLog.createMany({
    data: [
      { userId: admin.id, clientId: clientAlpha.id, action: "APPLY_PLAN", details: { planName: "Plano Pro" } },
      { userId: ops.id, clientId: clientAlpha.id, action: "CREATE_TASK", details: { title: "Post Feed — Lançamento verão" } },
      { userId: ops.id, clientId: clientAlpha.id, action: "UPDATE_STATUS", details: { from: "TODO", to: "DONE" } },
      { userId: admin.id, clientId: clientBeta.id, action: "APPLY_PLAN", details: { planName: "Plano Essencial" } },
      { userId: ops.id, clientId: clientBeta.id, action: "CREATE_TASK", details: { title: "Post produto novo" } },
      { userId: admin.id, clientId: clientGamma.id, action: "APPLY_PLAN", details: { planName: "Plano Essencial" } },
    ],
  });

  console.log("✅ Tasks and logs created");
  console.log("\n🎉 Seed completed!\n");
  console.log("📧 Login credentials:");
  console.log("   Admin:       admin@veloce.io  / admin123");
  console.log("   Operacional: ops@veloce.io    / ops123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
