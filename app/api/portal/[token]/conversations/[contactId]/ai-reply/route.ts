import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { manualAiReply, setAssignment } from "@/lib/ai-agent/respond";
import { getPortalSessionEmail } from "@/lib/portal-auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// POST — o cliente aciona a IA pra responder o lead a partir do portal (botão "IA responder").
// Token-scoped: manualAiReply confere que o contato é do próprio cliente. Respeita opt-out;
// se a IA não souber responder (é do vendedor), não envia nada e devolve erro amigável.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  // DONO DA CONVERSA (fase 1): quem clica "IA Atender" vira a RESPONSÁVEL por este lead —
  // MAS só se a conversa ainda não tem dona. NÃO rouba de outra dona: a reatribuição/liberação
  // é só da própria dona ou do admin (endpoint /assign). Best-effort — não bloqueia a resposta.
  const email = await getPortalSessionEmail(portal.clientId).catch(() => null);
  if (email) {
    const conv = await prisma.waConversation.findFirst({ where: { contactId }, select: { assignedEmail: true } });
    if (conv && !conv.assignedEmail) await setAssignment(portal.clientId, contactId, email).catch(() => {});
  }

  const r = await manualAiReply(portal.clientId, contactId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ reply: r.reply });
}
