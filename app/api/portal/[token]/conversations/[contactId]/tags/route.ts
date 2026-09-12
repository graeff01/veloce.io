import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardPortal } from "@/lib/portal-guard";
import { z } from "zod";

export const runtime = "nodejs";

// Confere sessão (quando o painel exige login) + que o contato é do próprio cliente do
// portal e que a tag existe na conexão dele. Devolve o connectionId, ou null se algo
// não confere.
// O `erro` do gate é DEVOLVIDO, não trocado por um 403 genérico: ele já traz o
// motivo certo — sessão faltando, cota estourada, ou acesso de acompanhamento.
// Engolir isso fazia a gestora ver "Não permitido" sem entender o porquê.
async function guard(req: Request, token: string, contactId: string, tagId: string) {
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return { erro: error };
  const contact = await prisma.waContact.findUnique({ where: { id: contactId }, select: { connection: { select: { id: true, clientId: true } } } });
  if (!contact || contact.connection.clientId !== portal.clientId) return null;
  const tag = await prisma.waTag.findFirst({ where: { id: tagId, connectionId: contact.connection.id }, select: { id: true } });
  if (!tag) return null;
  return { connId: contact.connection.id };
}

const schema = z.object({ tagId: z.string().min(1) });

// POST — aplica a etiqueta na conversa (idempotente).
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const g = await guard(req, token, contactId, parsed.data.tagId);
  if (g && "erro" in g) return g.erro;
  if (!g) return NextResponse.json({ error: "Não permitido" }, { status: 403 });
  await prisma.waContactTag.upsert({
    where: { contactId_tagId: { contactId, tagId: parsed.data.tagId } },
    create: { contactId, tagId: parsed.data.tagId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}

// DELETE — remove a etiqueta da conversa (tagId por query ou body).
export async function DELETE(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const url = new URL(req.url);
  const tagId = url.searchParams.get("tagId") || (await req.json().catch(() => ({}))).tagId;
  if (!tagId) return NextResponse.json({ error: "tagId ausente" }, { status: 400 });
  const g = await guard(req, token, contactId, tagId);
  if (g && "erro" in g) return g.erro;
  if (!g) return NextResponse.json({ error: "Não permitido" }, { status: 403 });
  await prisma.waContactTag.deleteMany({ where: { contactId, tagId } });
  return NextResponse.json({ ok: true });
}
