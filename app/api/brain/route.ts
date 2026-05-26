import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

const createSchema = z.object({
  clientId: z.string().optional().nullable(),
  title:    z.string().min(1),
  content:  z.string().optional().nullable(),
  category: z.string().default("Insight"),
  links:    z.array(z.string()).optional(),
  tags:     z.array(z.string()).optional(),
  pinned:   z.boolean().optional(),
});

export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const category = searchParams.get("category");
  const q        = searchParams.get("q");

  const where: Record<string, unknown> = {};
  if (clientId === "global") {
    where.clientId = null;
  } else if (clientId) {
    where.clientId = clientId;
  }
  if (category) where.category = category;
  if (q) {
    where.OR = [
      { title:   { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
    ];
  }

  const items = await prisma.brain.findMany({
    where,
    include: { client: { select: { id: true, name: true } } },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(items);
}

export async function POST(req: Request) {
  const { error } = await requireAuth("tasks:create");
  if (error) return error;

  const body   = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const item = await prisma.brain.create({
    data: {
      ...parsed.data,
      clientId: parsed.data.clientId ?? null,
      links:    parsed.data.links    ?? [],
      tags:     parsed.data.tags     ?? [],
      pinned:   parsed.data.pinned   ?? false,
    },
    include: { client: { select: { id: true, name: true } } },
  });

  return NextResponse.json(item, { status: 201 });
}
