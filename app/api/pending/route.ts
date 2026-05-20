import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET() {
  const { error } = await requireAuth("tasks:read");
  if (error) return error;

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "DONE" },
      blocker: { not: null },
    },
    include: {
      client: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
    take: 80,
  });

  const groups = ["Aguardando cliente", "Aguardando criativo", "Aguardando aprovacao"].map((label) => ({
    label,
    tasks: tasks.filter((task) => task.blocker === label),
  }));

  return NextResponse.json({
    total: tasks.length,
    groups,
  });
}
