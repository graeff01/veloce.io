import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalUser, isAdminRole } from "@/lib/portal-auth";
import { setAssignment } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST { email } — define o DONO do lead (assumir=meu e-mail; transferir=outro; null=remover).
// Se "email" não vier, assume para o próprio usuário logado. Mesmo escopo/auth do send.
//
// Permissão: o ATENDENTE só pode ASSUMIR um lead livre (sem dono, ou já dele). Transferir
// para outro ou REMOVER o dono de outro atendente é exclusivo do ADMIN.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const user = await getPortalUser(portal.clientId);
  const me = user?.email ?? null;
  if (await isProtected(portal.clientId) && !me) return NextResponse.json({ error: "Faça login para assumir a conversa." }, { status: 401 });
  const isAdmin = isAdminRole(user?.role);

  const body = await req.json().catch(() => ({}));
  const email = "email" in (body || {}) ? (body.email === null ? null : String(body.email)) : me; // sem email → assume p/ mim

  // Trava de papel: atendente não mexe no dono de lead de outro atendente (nem remove).
  if (!isAdmin) {
    const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
    const conv = conn ? await prisma.waConversation.findFirst({ where: { contactId, connectionId: conn.id }, select: { assignedEmail: true } }) : null;
    const current = conv?.assignedEmail ?? null;
    const claimingSelf = !!me && email === me;
    const currentlyFree = current === null || current === me;
    if (!(claimingSelf && currentlyFree)) {
      return NextResponse.json({ error: "Apenas o admin pode transferir ou remover o lead de outro atendente." }, { status: 403 });
    }
  }

  const r = await setAssignment(portal.clientId, contactId, email);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status ?? 400 });
  return NextResponse.json({ ok: true, assignedEmail: r.assignedEmail });
}
