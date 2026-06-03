import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const month    = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));
  const year     = parseInt(searchParams.get("year")  ?? String(new Date().getFullYear()));
  const clientId = searchParams.get("clientId");

  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59);

  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      dueDate: { gte: start, lte: end },
      ...(clientId ? { clientId } : {}),
    },
    select: {
      id: true,
      clientId: true,
      title: true,
      type: true,
      status: true,
      dueDate: true,
      createdAt: true,
      client: { select: { id: true, name: true, brand: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json(tasks);
}
