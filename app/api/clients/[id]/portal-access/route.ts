import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { normEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — usuários do painel deste cliente (login+senha). hasPassword=false = convidado
// que ainda não definiu senha.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;
  const rows = await prisma.portalAccess.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, lastLoginAt: true, passwordHash: true } });
  const users = rows.map((u) => ({ id: u.id, email: u.email, name: u.name, lastLoginAt: u.lastLoginAt, hasPassword: !!u.passwordHash }));
  return NextResponse.json({ users, registered: users.filter((u) => u.hasPassword).length });
}

// DELETE ?email= — remove o usuário (libera a vaga) e derruba as sessões dele.
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
