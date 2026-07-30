import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { z } from "zod";

export const runtime = "nodejs";

// Tags (etiquetas coloridas) do cliente, no PORTAL — token-scoped. As vendedoras criam e
// aplicam nas conversas. Espelha a API admin (clients/[id]/whatsapp/tags), mas via token.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
  if (!conn) return NextResponse.json([]);
  const tags = await prisma.waTag.findMany({ where: { connectionId: conn.id }, orderBy: { name: "asc" } });
  return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
}

const postSchema = z.object({ name: z.string().trim().min(1).max(40), color: z.string().max(20).optional() });

// Cria (ou atualiza a cor de) uma etiqueta. Idempotente por nome (evita duplicata).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const tag = await prisma.waTag.upsert({
    where: { connectionId_name: { connectionId: conn.id, name: parsed.data.name } },
    create: { connectionId: conn.id, name: parsed.data.name, color: parsed.data.color ?? "#64748B" },
    update: parsed.data.color ? { color: parsed.data.color } : {},
  });
  return NextResponse.json({ id: tag.id, name: tag.name, color: tag.color }, { status: 201 });
}
