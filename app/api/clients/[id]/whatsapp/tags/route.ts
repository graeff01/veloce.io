import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { idsDasConexoes, filtroConexoes } from "@/lib/wa-connections";
import { requireAuth, requireClientAccess } from "@/lib/api-helpers";
import { z } from "zod";

// Tags planas por conexão (segmentação de leads).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireClientAccess(id);
  if (error) return error;
  // As etiquetas são do CLIENTE, não de um número: quem organiza a caixa pensa
  // em "orçamento enviado", não em "orçamento enviado no número da Ana". Lista
  // todas e junta as repetidas pelo nome.
  const connIds = await idsDasConexoes(id);
  if (connIds.length === 0) return NextResponse.json([]);
  const todas = await prisma.waTag.findMany({ where: { connectionId: filtroConexoes(connIds) }, orderBy: { name: "asc" } });
  const porNome = new Map<string, (typeof todas)[number]>();
  for (const t of todas) if (!porNome.has(t.name)) porNome.set(t.name, t);
  const tags = [...porNome.values()];
  return NextResponse.json(tags.map((t) => ({ id: t.id, name: t.name, color: t.color })));
}

const postSchema = z.object({ name: z.string().trim().min(1).max(40), color: z.string().max(20).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  // Etiqueta nova nasce no primeiro número do cliente — é só onde ela mora; a
  // listagem acima junta os números, então ela aparece em toda a caixa.
  const connIds = await idsDasConexoes(id);
  if (connIds.length === 0) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });
  const conn = { id: connIds[0]! };

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
