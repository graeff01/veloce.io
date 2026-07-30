import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { z } from "zod";

export const runtime = "nodejs";

// Confere que o contato é do próprio cliente do portal (segurança token-scoped) e que a tag
// existe na conexão dele. Devolve o connectionId, ou null se algo não confere.
async function guard(token: string, contactId: string, tagId: string) {
  const portal = await resolvePortal(token);
  if (!portal) return null;
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
  const g = await guard(token, contactId, parsed.data.tagId);
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
  const g = await guard(token, contactId, tagId);
  if (!g) return NextResponse.json({ error: "Não permitido" }, { status: 403 });
  await prisma.waContactTag.deleteMany({ where: { contactId, tagId } });
  return NextResponse.json({ ok: true });
}
