import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  clientId:    z.string().min(1),
  title:       z.string().min(1),
  category:    z.string().min(1),
  status:      z.enum(["PLANNED","IN_PROGRESS","REVIEW","DONE","ARCHIVED"]).optional(),
  priority:    z.enum(["CRITICAL","HIGH","NORMAL","LOW"]).optional(),
  date:        z.string(),
  endDate:     z.string().optional().nullable(),
  assignedTo:  z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  links:       z.array(z.string()).optional(),
  tags:        z.array(z.string()).optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const month    = searchParams.get("month");
  const year     = searchParams.get("year");
  const status   = searchParams.get("status");

  const where: Record<string, unknown> = { deletedAt: null };
  if (clientId) where.clientId = clientId;
  if (status)   where.status   = status;

  if (month && year) {
    const m = parseInt(month), y = parseInt(year);
    where.date = {
      gte: new Date(y, m - 1, 1),
      lt:  new Date(y, m, 1),
    };
  }

  const movements = await prisma.movement.findMany({
    where,
    include: {
      client:   { select: { id: true, name: true, brand: true } },
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { date: "asc" },
  });

  return NextResponse.json(movements);
}

export async function POST(req: Request) {
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.issues }, { status: 400 });

  const { date, endDate, ...rest } = parsed.data;

  const movement = await prisma.movement.create({
    data: {
      ...rest,
      date:        new Date(date),
      endDate:     endDate ? new Date(endDate) : null,
      status:      rest.status      ?? "PLANNED",
      priority:    rest.priority    ?? "NORMAL",
      links:       rest.links       ?? [],
      tags:        rest.tags        ?? [],
      assignedTo:  rest.assignedTo  ?? null,
      description: rest.description ?? null,
    },
    include: {
      client:   { select: { id: true, name: true, brand: true } },
      assignee: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(movement, { status: 201 });
}
