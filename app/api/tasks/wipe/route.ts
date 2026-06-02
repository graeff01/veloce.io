import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";

// POST /api/tasks/wipe
// Soft-deletes ALL tasks AND movements of the workspace (admin only). The kanban
// reads from Task; the calendar reads from both Task and Movement (all filtering
// deletedAt: null), so this clears the kanban and the calendar at once — for a
// clean slate.
export async function POST() {
  const { error, session } = await requireAuth("tasks:delete");
  if (error) return error;

  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem zerar as tarefas" }, { status: 403 });
  }

  const now = new Date();
  const [tasks, movements] = await prisma.$transaction([
    prisma.task.updateMany({ where: { deletedAt: null }, data: { deletedAt: now } }),
    prisma.movement.updateMany({ where: { deletedAt: null }, data: { deletedAt: now } }),
  ]);

  await logAction(session!.user.id, "WIPE_TASKS", undefined, undefined, {
    tasks: tasks.count,
    movements: movements.count,
  });

  return NextResponse.json({ ok: true, count: tasks.count + movements.count, tasks: tasks.count, movements: movements.count });
}
