import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { maybeAutoRenew } from "@/lib/plan-generator";
import { z } from "zod";

const deliverableItemSchema = z.object({
  type: z.string().min(1),
  quantity: z.number().int().min(1),
  deadlineDayOfMonth: z.number().int().min(0).max(31).nullable(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  brand: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  primaryContact: z.string().optional(),
  website: z.string().optional(),
  instagram: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PAUSED"]).optional(),
  operationType: z.string().optional(),
  operationalScope: z.record(z.string(), z.unknown()).optional(),
  reviewDay: z.string().optional(),
  expectedSla: z.string().optional(),
  meetingFrequency: z.string().optional(),
  approvalRoutine: z.string().optional(),
  operationalUrgency: z.string().optional(),
  importantLinks: z.string().optional(),
  niche: z.string().optional(),
  mainGoal: z.string().optional(),
  contractStart: z.string().optional(),
  operationalFrequency: z.string().optional(),
  strategicNotes: z.string().optional(),
  communicationTone: z.string().optional(),
  restrictions: z.string().optional(),
  preferences: z.string().optional(),
  clientBehavior: z.string().optional(),
  deliverables: z.array(deliverableItemSchema).optional(),
});

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const client = await prisma.client.findFirst({
    where: { id, deletedAt: null },
    include: {
      clientPlans: {
        include: { plan: { include: { items: true } } },
        orderBy: { appliedAt: "desc" },
      },
    },
  });

  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Lazy auto-renewal: silently generates tasks if autoRenew is on and none exist this month
  await maybeAutoRenew(id);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [monthTasks, doneTasks, overdueTasks, openTasks, recentLogs, lastLog, nextTask, blockedTask] = await Promise.all([
    prisma.task.count({ where: { clientId: id, deletedAt: null, dueDate: { gte: startOfMonth, lte: endOfMonth } } }),
    prisma.task.count({ where: { clientId: id, deletedAt: null, status: "DONE", dueDate: { gte: startOfMonth, lte: endOfMonth } } }),
    prisma.task.count({ where: { clientId: id, deletedAt: null, dueDate: { lt: now }, status: { not: "DONE" } } }),
    prisma.task.count({ where: { clientId: id, deletedAt: null, status: { not: "DONE" } } }),
    prisma.executionLog.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { name: true } } },
    }),
    prisma.executionLog.findFirst({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.task.findFirst({
      where: { clientId: id, deletedAt: null, status: { not: "DONE" }, dueDate: { gte: now } },
      orderBy: { dueDate: "asc" },
      select: { id: true, title: true, dueDate: true },
    }),
    prisma.task.findFirst({
      where: { clientId: id, deletedAt: null, status: { not: "DONE" }, blocker: { not: null } },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
      select: { id: true, title: true, blocker: true },
    }),
  ]);

  const daysSinceActivity = lastLog
    ? Math.floor((now.getTime() - lastLog.createdAt.getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  const health =
    overdueTasks >= 4 || daysSinceActivity >= 10 ? "CRITICAL"
    : overdueTasks > 0 || daysSinceActivity >= 4 ? "ATTENTION"
    : "HEALTHY";

  // Real progress by deliverable type for current month
  const activePlan = client.clientPlans.find((cp) => cp.active) ?? client.clientPlans[0];
  const progressByType: Record<string, { planned: number; done: number; pct: number }> = {};

  if (activePlan) {
    const monthTasksByType = await prisma.task.groupBy({
      by: ["type", "status"],
      where: {
        clientId: id,
        deletedAt: null,
        planMonth: activePlan.month,
        planYear: activePlan.year,
      },
      _count: { id: true },
    });

    for (const item of activePlan.plan.items) {
      const doneCount = monthTasksByType
        .filter((t) => t.type === item.type && t.status === "DONE")
        .reduce((sum, t) => sum + t._count.id, 0);
      progressByType[item.type] = {
        planned: item.quantity,
        done: doneCount,
        pct: item.quantity > 0 ? Math.round((doneCount / item.quantity) * 100) : 0,
      };
    }
  }

  return NextResponse.json({
    ...client,
    stats: {
      monthTasks,
      doneTasks,
      overdueTasks,
      openTasks,
      daysSinceActivity,
      health,
      completionRate: monthTasks > 0 ? Math.round((doneTasks / monthTasks) * 100) : 0,
    },
    operationalContext: {
      lastActivityAt: lastLog?.createdAt ?? null,
      nextTask,
      currentBlocker: blockedTask,
    },
    progressByType,
    recentLogs,
    notes: recentLogs.filter((log) => log.action === "ADD_NOTE"),
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const updated = await prisma.client.update({
    where: { id },
    data: {
      ...(parsed.data.name && { name: parsed.data.name }),
      ...(parsed.data.brand !== undefined && { brand: parsed.data.brand || null }),
      ...(parsed.data.email !== undefined && { email: parsed.data.email || null }),
      ...(parsed.data.phone !== undefined && { phone: parsed.data.phone || null }),
      ...(parsed.data.primaryContact !== undefined && { primaryContact: parsed.data.primaryContact || null }),
      ...(parsed.data.website !== undefined && { website: parsed.data.website || null }),
      ...(parsed.data.instagram !== undefined && { instagram: parsed.data.instagram || null }),
      ...(parsed.data.city !== undefined && { city: parsed.data.city || null }),
      ...(parsed.data.status && { status: parsed.data.status }),
      ...(parsed.data.operationType !== undefined && { operationType: parsed.data.operationType || null }),
      ...(parsed.data.operationalScope !== undefined && { operationalScope: parsed.data.operationalScope as Prisma.InputJsonValue }),
      ...(parsed.data.reviewDay !== undefined && { reviewDay: parsed.data.reviewDay || null }),
      ...(parsed.data.expectedSla !== undefined && { expectedSla: parsed.data.expectedSla || null }),
      ...(parsed.data.meetingFrequency !== undefined && { meetingFrequency: parsed.data.meetingFrequency || null }),
      ...(parsed.data.approvalRoutine !== undefined && { approvalRoutine: parsed.data.approvalRoutine || null }),
      ...(parsed.data.operationalUrgency !== undefined && { operationalUrgency: parsed.data.operationalUrgency || null }),
      ...(parsed.data.importantLinks !== undefined && { importantLinks: parsed.data.importantLinks || null }),
      ...(parsed.data.niche !== undefined && { niche: parsed.data.niche || null }),
      ...(parsed.data.mainGoal !== undefined && { mainGoal: parsed.data.mainGoal || null }),
      ...(parsed.data.contractStart !== undefined && { contractStart: parsed.data.contractStart ? new Date(parsed.data.contractStart) : null }),
      ...(parsed.data.operationalFrequency !== undefined && { operationalFrequency: parsed.data.operationalFrequency || null }),
      ...(parsed.data.strategicNotes !== undefined && { strategicNotes: parsed.data.strategicNotes || null }),
      ...(parsed.data.communicationTone !== undefined && { communicationTone: parsed.data.communicationTone || null }),
      ...(parsed.data.restrictions !== undefined && { restrictions: parsed.data.restrictions || null }),
      ...(parsed.data.preferences !== undefined && { preferences: parsed.data.preferences || null }),
      ...(parsed.data.clientBehavior !== undefined && { clientBehavior: parsed.data.clientBehavior || null }),
    },
  });

  // If deliverables provided, sync PlanItems on the active custom plan
  if (parsed.data.deliverables !== undefined) {
    const deliverables = parsed.data.deliverables ?? [];
    const activePlan = await prisma.clientPlan.findFirst({
      where: { clientId: id, active: true },
      include: { plan: { include: { items: true } } },
      orderBy: { appliedAt: "desc" },
    });

    if (activePlan) {
      const now = new Date();

      // Find types that were removed
      const previousTypes = activePlan.plan.items.map((i) => i.type);
      const newTypes = deliverables.map((d) => d.type);
      const removedTypes = previousTypes.filter((t) => !newTypes.includes(t));

      // Soft-delete all undone tasks of removed types (current + future months)
      if (removedTypes.length > 0) {
        await prisma.task.updateMany({
          where: {
            clientId: id,
            type: { in: removedTypes },
            status: { not: "DONE" },
            deletedAt: null,
          },
          data: { deletedAt: now },
        });
      }

      // Replace all plan items
      await prisma.planItem.deleteMany({ where: { planId: activePlan.planId } });
      if (deliverables.length > 0) {
        await prisma.planItem.createMany({
          data: deliverables.map((d) => ({
            planId: activePlan.planId,
            type: d.type,
            quantity: d.quantity,
            deadlineDayOfMonth: d.deadlineDayOfMonth,
            defaultPriority: "NORMAL",
            checklistItems: [],
          })),
        });
      }
    } else if (deliverables.length > 0) {
      // No active plan yet — create one (e.g. edited before plan was created)
      const now = new Date();
      const plan = await prisma.plan.create({
        data: {
          name: `Plano — ${parsed.data.brand || client.name}`,
          category: "custom",
          items: {
            create: deliverables.map((d) => ({
              type: d.type,
              quantity: d.quantity,
              deadlineDayOfMonth: d.deadlineDayOfMonth,
              defaultPriority: "NORMAL",
              checklistItems: [],
            })),
          },
        },
      });
      await prisma.clientPlan.create({
        data: {
          clientId: id,
          planId: plan.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
          appliedBy: session!.user.id,
          autoRenew: true,
          active: true,
        },
      });
    }
  }

  await logAction(session!.user.id, "UPDATE_CLIENT", id, undefined, { before: client, after: parsed.data });

  return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("clients:delete");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  await prisma.client.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logAction(session!.user.id, "DELETE_CLIENT", id, undefined, { name: client.name });

  return NextResponse.json({ ok: true });
}
