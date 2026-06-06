import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// Tarefas abertas de todos os clientes, com responsável e cliente — base para
// a visão "por responsável / minhas tarefas".
export async function GET() {
  const { error } = await requireAuth("tasks:read");
  if (error) return error;

  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, status: { not: "DONE" } },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      dueDate: true,
      blocker: true,
      clientId: true,
      assignedTo: true,
      client: { select: { id: true, name: true, brand: true, logoUrl: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    take: 500,
  });

  return NextResponse.json(tasks);
}
