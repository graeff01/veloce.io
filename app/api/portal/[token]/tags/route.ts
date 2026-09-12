import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idsVisiveis, filtroConexoes } from "@/lib/wa-connections";
import { guardPortal } from "@/lib/portal-guard";
import { z } from "zod";

export const runtime = "nodejs";

// Tags (etiquetas coloridas) do cliente, no PORTAL — token-scoped. As vendedoras criam e
// aplicam nas conversas. Espelha a API admin (clients/[id]/whatsapp/tags), mas via token.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;
  // Etiquetas são do cliente, não de um número: lista as de todos e junta as
  // repetidas pelo nome.
  const connIds = await idsVisiveis(portal.clientId, portal.conexoesVisiveis);
  if (connIds.length === 0) return NextResponse.json([]);
  const todas = await prisma.waTag.findMany({ where: { connectionId: filtroConexoes(connIds) }, orderBy: { name: "asc" } });
  const porNome = new Map<string, (typeof todas)[number]>();
  for (const t of todas) if (!porNome.has(t.name)) porNome.set(t.name, t);
  const tags = [...porNome.values()];
  return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
}

const postSchema = z.object({ name: z.string().trim().min(1).max(40), color: z.string().max(20).optional() });

// Cria (ou atualiza a cor de) uma etiqueta. Idempotente por nome (evita duplicata).
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;
  // Etiqueta nova nasce no primeiro número; a listagem acima junta todos.
  const connIds = await idsVisiveis(portal.clientId, portal.conexoesVisiveis);
  const conn = connIds.length ? { id: connIds[0]! } : null;
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
