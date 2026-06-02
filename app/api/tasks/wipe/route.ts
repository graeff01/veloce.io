import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";

// POST /api/tasks/wipe
// Soft-deletes ALL tasks of the workspace (admin only). Both the kanban and the
// calendar read from the Task table (filtering deletedAt: null), so this clears
// both at once — for starting a clean slate.
export async function POST() {
  const { error, session } = await requireAuth("tasks:delete");
  if (error) return error;

  if (session!.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas administradores podem zerar as tarefas" }, { status: 403 });
  }

  const result = await prisma.task.updateMany({
    where: { deletedAt: null },
    data: { deletedAt: new Date() },
  });

  await logAction(session!.user.id, "WIPE_TASKS", undefined, undefined, { count: result.count });

  return NextResponse.json({ ok: true, count: result.count });
}
