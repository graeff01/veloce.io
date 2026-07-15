import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail, getPortalUser } from "@/lib/portal-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — "Pegar" o lead: vira DONO de forma ATÔMICA (só se ainda não tem dono) e PAUSA a IA
// (takeover) para o vendedor assumir. Se já foi pego por outro, avisa quem pegou.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login." }, { status: 401 });
  }
  const me = await getPortalSessionEmail(portal.clientId);
  if (!me) return NextResponse.json({ error: "Faça login para pegar o lead." }, { status: 401 });

  // Isolamento: a conversa tem que ser de uma conexão deste cliente.
  const conv = await prisma.waConversation.findUnique({
    where: { contactId },
    select: { assignedEmail: true, connection: { select: { clientId: true } } },
  });
  if (!conv || conv.connection.clientId !== portal.clientId) return NextResponse.json({ error: "Lead não encontrado." }, { status: 404 });

  // Claim ATÔMICO: só define o dono se ainda estiver vago.
  const claimed = await prisma.waConversation.updateMany({
    where: { contactId, assignedEmail: null },
    data: { assignedEmail: me, assignedAt: new Date() },
  });
  // Takeover: silencia a IA nesse contato (o vendedor assume a conversa).
  if (claimed.count > 0) {
    await prisma.waContact.update({ where: { id: contactId }, data: { aiSilenced: true } }).catch(() => {});
  }

  if (claimed.count === 0) {
    // Já tem dono. Se for eu, ok; senão, avisa quem pegou.
    if (conv.assignedEmail === me) return NextResponse.json({ ok: true, mine: true });
    const owner = conv.assignedEmail
      ? await prisma.portalAccess.findUnique({ where: { clientId_email: { clientId: portal.clientId, email: conv.assignedEmail } }, select: { name: true } })
      : null;
    return NextResponse.json({ ok: false, takenBy: owner?.name || conv.assignedEmail || "outro atendente" }, { status: 409 });
  }
  const u = await getPortalUser(portal.clientId);
  return NextResponse.json({ ok: true, mine: true, owner: u?.name || me });
}
