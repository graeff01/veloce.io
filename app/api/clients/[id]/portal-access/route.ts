import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { normEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — e-mails autorizados a acessar o painel deste cliente.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const emails = await prisma.portalAccess.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" }, select: { id: true, email: true } });
  return NextResponse.json({ emails });
}

// POST { email } — autoriza um e-mail.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const { email } = await req.json().catch(() => ({}));
  const e = normEmail(email || "");
  if (!e || !e.includes("@")) return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  const row = await prisma.portalAccess.upsert({
    where: { clientId_email: { clientId: id, email: e } },
    create: { clientId: id, email: e },
    update: {},
    select: { id: true, email: true },
  });
  return NextResponse.json({ email: row });
}

// DELETE ?email= — revoga o acesso (e derruba as sessões desse e-mail).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const e = normEmail(new URL(req.url).searchParams.get("email") || "");
  if (!e) return NextResponse.json({ error: "E-mail obrigatório." }, { status: 400 });
  await prisma.portalAccess.deleteMany({ where: { clientId: id, email: e } });
  await prisma.portalSession.deleteMany({ where: { clientId: id, email: e } }); // revoga sessões ativas
  return NextResponse.json({ ok: true });
}
