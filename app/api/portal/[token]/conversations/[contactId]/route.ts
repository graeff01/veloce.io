import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isWithin24h } from "@/lib/wa-window";
import { isTakenOver } from "@/lib/takeover";
import { getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — histórico de mensagens de uma conversa (token-scoped, SOMENTE LEITURA).
export async function GET(_: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  // escopo: o contato tem que ser da conexão deste cliente
  const contact = await prisma.waContact.findFirst({
    where: { id: contactId, connectionId: conn.id },
    select: { id: true, name: true, displayName: true, waId: true },
  });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const [messages, lead, conv, attendants, me, aiCfg] = await Promise.all([
    prisma.waMessage.findMany({ where: { contactId: contact.id }, orderBy: [{ timestamp: "asc" }, { id: "asc" }], take: 2000, select: { id: true, text: true, direction: true, type: true, timestamp: true, aiGenerated: true, sentByEmail: true } }),
    prisma.waLead.findUnique({ where: { contactId: contact.id }, select: { adId: true, adTitle: true, adModel: true, adBody: true, sourceUrl: true, adImageUrl: true } }),
    prisma.waConversation.findUnique({ where: { contactId: contact.id }, select: { funnelStage: true, funnelEvidence: true, funnelManual: true, assignedEmail: true, humanTakeoverAt: true } }),
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
    getPortalSessionEmail(portal.clientId),
    prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { humanTakeoverMin: true } }),
  ]);
  const nameOf = (email: string | null | undefined) => (email ? (attendants.find((a) => a.email === email)?.name || email.split("@")[0]) : null);

  // Imagem do criativo: do referral OU do thumbnail sincronizado da Meta (por adId).
  let adImage = lead?.adImageUrl ?? null;
  if (!adImage && lead?.adId) {
    const metaConn = await prisma.metaConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
    if (metaConn) {
      const ad = await prisma.metaAd.findFirst({ where: { connectionId: metaConn.id, adId: lead.adId }, select: { creativeId: true } });
      if (ad?.creativeId) {
        const cr = await prisma.metaCreative.findFirst({ where: { connectionId: metaConn.id, creativeId: ad.creativeId }, select: { thumbnailUrl: true } });
        adImage = cr?.thumbnailUrl ?? null;
      }
    }
  }

  // Janela de 24h: última mensagem do LEAD (inbound). Governa o envio livre pelo painel.
  const lastInboundAt = [...messages].reverse().find((m) => m.direction === "in")?.timestamp ?? null;

  return NextResponse.json({
    contact: { name: contact.displayName || contact.name || contact.waId },
    lead: lead ? { adTitle: lead.adTitle, adModel: lead.adModel, adBody: lead.adBody, sourceUrl: lead.sourceUrl, image: adImage } : null,
    funnelStage: conv?.funnelStage ?? null,
    funnelEvidence: conv?.funnelManual ? null : (conv?.funnelEvidence ?? null),
    windowOpen: isWithin24h(lastInboundAt),
    lastInboundAt,
    humanTakenOver: isTakenOver(conv?.humanTakeoverAt, aiCfg?.humanTakeoverMin ?? 180),
    assignedEmail: conv?.assignedEmail ?? null,
    assignedName: nameOf(conv?.assignedEmail),
    me,
    meName: nameOf(me),
    attendants: attendants.map((a) => ({ email: a.email, name: a.name || a.email.split("@")[0] })),
    items: messages.map((m) => ({ id: m.id, text: m.text, direction: m.direction, type: m.type, timestamp: m.timestamp, aiGenerated: m.aiGenerated, sentByEmail: m.sentByEmail, sentByName: nameOf(m.sentByEmail) })),
  });
}
