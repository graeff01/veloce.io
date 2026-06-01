import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { z } from "zod";

const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "NORMAL", "LOW"]).optional(),
  blocker: z.string().optional().nullable(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  planMonth: z.number().optional(),
  planYear: z.number().optional(),
  meetingId: z.string().optional(),
  checklists: z.array(z.object({ text: z.string(), order: z.number() })).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("tasks:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  const year = searchParams.get("year");
  const status = searchParams.get("status");
  const assignedTo = searchParams.get("assignedTo");

  const where: Record<string, unknown> = { clientId: id, deletedAt: null };

  if (month && year) {
    const m = parseInt(month);
    const y = parseInt(year);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    where.dueDate = { gte: start, lte: end };
  }

  if (status) where.status = status;
  if (assignedTo) where.assignedTo = assignedTo;

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: { select: { id: true, name: true } },
      checklists: { orderBy: { order: "asc" } },
    },
    orderBy: [{ order: "asc" }, { dueDate: "asc" }],
  });

  return NextResponse.json(tasks);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, session } = await requireAuth("tasks:create");
  if (error) return error;

  const client = await prisma.client.findFirst({ where: { id, deletedAt: null } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      clientId: id,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority ?? "NORMAL",
      blocker: parsed.data.blocker || null,
      assignedTo: parsed.data.assignedTo || null,
      dueDate: parsed.data.dueDate
        ? new Date(parsed.data.dueDate)
        : new Date(parsed.data.planYear ?? new Date().getFullYear(), parsed.data.planMonth ?? new Date().getMonth() + 1, 0),
      planMonth: parsed.data.planMonth,
      planYear: parsed.data.planYear,
      meetingId: parsed.data.meetingId || null,
      checklists: parsed.data.checklists
        ? { create: parsed.data.checklists.map((c) => ({ text: c.text, order: c.order })) }
        : undefined,
    },
    include: {
      assignee: { select: { id: true, name: true } },
      checklists: true,
    },
  });

  await logAction(session!.user.id, "CREATE_TASK", id, task.id, {
    title: task.title,
    dueDate: task.dueDate,
    priority: task.priority,
    blocker: task.blocker,
  });

  return NextResponse.json(task, { status: 201 });
}
