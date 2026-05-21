import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { slugify } from "@/lib/utils";
import { z } from "zod";

const createClientSchema = z.object({
  name: z.string().min(1),
  brand: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  primaryContact: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  city: z.string().optional(),
  operationType: z.string().optional(),
  niche: z.string().optional(),
  mainGoal: z.string().optional(),
  contractStart: z.string().optional(),
  operationalFrequency: z.string().optional(),
  strategicNotes: z.string().optional(),
  communicationTone: z.string().optional(),
  restrictions: z.string().optional(),
  preferences: z.string().optional(),
  clientBehavior: z.string().optional(),
});

export async function GET() {
  const { error, session } = await requireAuth("clients:read");
  if (error) return error;

  const clients = await prisma.client.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { tasks: { where: { deletedAt: null } } } },
      clientPlans: {
        include: { plan: true },
        orderBy: { appliedAt: "desc" },
        take: 1,
      },
    },
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const enriched = await Promise.all(
    clients.map(async (client) => {
      const [monthTasks, overdueTasks, lastLog] = await Promise.all([
        prisma.task.count({
          where: {
            clientId: client.id,
            deletedAt: null,
            dueDate: { gte: startOfMonth, lte: endOfMonth },
          },
        }),
        prisma.task.count({
          where: {
            clientId: client.id,
            deletedAt: null,
            dueDate: { lt: now },
            status: { not: "DONE" },
          },
        }),
        prisma.executionLog.findFirst({
          where: { clientId: client.id },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      const doneTasks = await prisma.task.count({
        where: {
          clientId: client.id,
          deletedAt: null,
          dueDate: { gte: startOfMonth, lte: endOfMonth },
          status: "DONE",
        },
      });

      return {
        ...client,
        stats: {
          totalTasks: client._count.tasks,
          monthTasks,
          doneTasks,
          overdueTasks,
          completionRate: monthTasks > 0 ? Math.round((doneTasks / monthTasks) * 100) : 0,
          daysSinceActivity: lastLog
            ? Math.floor((now.getTime() - lastLog.createdAt.getTime()) / (1000 * 60 * 60 * 24))
            : null,
        },
      };
    })
  );

  return NextResponse.json(enriched);
}

export async function POST(req: Request) {
  const { error, session } = await requireAuth("clients:create");
  if (error) return error;

  const body = await req.json();
  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const slug = slugify(parsed.data.name);
  const existing = await prisma.client.findFirst({ where: { slug, deletedAt: null } });
  if (existing) {
    return NextResponse.json({ error: "Já existe um cliente com esse nome" }, { status: 409 });
  }

  const client = await prisma.client.create({
    data: {
      name: parsed.data.name,
      slug,
      brand: parsed.data.brand || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      primaryContact: parsed.data.primaryContact || null,
      website: parsed.data.website || null,
      instagram: parsed.data.instagram || null,
      city: parsed.data.city || null,
      operationType: parsed.data.operationType || null,
      niche: parsed.data.niche || null,
      mainGoal: parsed.data.mainGoal || null,
      contractStart: parsed.data.contractStart ? new Date(parsed.data.contractStart) : null,
      operationalFrequency: parsed.data.operationalFrequency || null,
      strategicNotes: parsed.data.strategicNotes || null,
      communicationTone: parsed.data.communicationTone || null,
      restrictions: parsed.data.restrictions || null,
      preferences: parsed.data.preferences || null,
      clientBehavior: parsed.data.clientBehavior || null,
    },
  });

  await logAction(session!.user.id, "CREATE_CLIENT", client.id, undefined, { name: client.name });

  return NextResponse.json(client, { status: 201 });
}
