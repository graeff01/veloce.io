import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { z } from "zod";

// Tags planas por conexão (segmentação de leads).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  if (!conn) return NextResponse.json([]);
  const tags = await prisma.waTag.findMany({ where: { connectionId: conn.id }, orderBy: { name: "asc" } });
  return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
}

const postSchema = z.object({ name: z.string().trim().min(1).max(40), color: z.string().max(20).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  // Idempotente por nome (evita tag duplicada).
  const tag = await prisma.waTag.upsert({
    where: { connectionId_name: { connectionId: conn.id, name: parsed.data.name } },
    create: { connectionId: conn.id, name: parsed.data.name, color: parsed.data.color ?? "#64748B" },
    update: parsed.data.color ? { color: parsed.data.color } : {},
  });
  return NextResponse.json({ id: tag.id, name: tag.name, color: tag.color }, { status: 201 });
}
