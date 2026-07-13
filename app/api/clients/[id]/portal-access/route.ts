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
  const rows = await prisma.portalAccess.findMany({ where: { clientId: id }, orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, lastLoginAt: true, passwordHash: true } });
  const users = rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, lastLoginAt: u.lastLoginAt, hasPassword: !!u.passwordHash }));
  return NextResponse.json({ users, registered: users.filter((u) => u.hasPassword).length });
}

// PATCH { email, role } — define o papel; ou { email, reset:true } — reseta a senha
// (limpa o hash e derruba as sessões; o usuário cria uma nova senha no próximo acesso).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const e = normEmail(body?.email || "");
  if (!e) return NextResponse.json({ error: "E-mail obrigatório." }, { status: 400 });

  if (body?.reset === true) {
    await prisma.portalAccess.updateMany({ where: { clientId: id, email: e }, data: { passwordHash: null, lastLoginAt: null } });
    await prisma.portalSession.deleteMany({ where: { clientId: id, email: e } });
    return NextResponse.json({ ok: true, reset: true });
  }

  const role = body?.role === "admin" ? "admin" : "attendant";
  // Não deixa remover o ÚLTIMO admin do cliente.
  if (role === "attendant") {
    const admins = await prisma.portalAccess.count({ where: { clientId: id, role: "admin" } });
    const isThisAdmin = await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId: id, email: e } }, select: { role: true } });
    if (admins <= 1 && isThisAdmin?.role === "admin") return NextResponse.json({ error: "Precisa haver ao menos 1 admin." }, { status: 400 });
  }
  await prisma.portalAccess.updateMany({ where: { clientId: id, email: e }, data: { role } });
  return NextResponse.json({ ok: true, role });
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
