import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { conexaoDoContato } from "@/lib/wa-connections";
import { isWithin24h } from "@/lib/wa-window";
import { guardPortal } from "@/lib/portal-guard";
import { isStrongAd } from "@/lib/wa-leads";

export const runtime = "nodejs";

// GET — histórico de mensagens de uma conversa (token-scoped, SOMENTE LEITURA).
export async function GET(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas" });
  if (error) return error;

  // O contato decide em que número ele está. Procurar dentro de "a" conexão do
  // cliente fazia toda conversa fora do primeiro número sumir.
  const { conn } = await conexaoDoContato(portal.clientId, contactId);
  if (!conn) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  // escopo: o contato tem que ser da conexão deste cliente
  const contact = await prisma.waContact.findFirst({
    where: { id: contactId, connectionId: conn.id },
    select: { id: true, name: true, displayName: true, waId: true },
  });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const [messages, lead, conv, attendants, me, contactTags] = await Promise.all([
    prisma.waMessage.findMany({ where: { contactId: contact.id }, orderBy: [{ timestamp: "asc" }, { id: "asc" }], take: 2000, select: { id: true, text: true, direction: true, type: true, timestamp: true, aiGenerated: true, sentByEmail: true, deliveredAt: true, readAt: true, reaction: true, media: { select: { transcription: true } } } }),
    prisma.waLead.findUnique({ where: { contactId: contact.id }, select: { adId: true, adTitle: true, adModel: true, adBody: true, sourceUrl: true, adImageUrl: true, ctwaClid: true, sourceType: true } }),
    prisma.waConversation.findUnique({ where: { contactId: contact.id }, select: { funnelStage: true, funnelEvidence: true, funnelManual: true, assignedEmail: true } }),
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
    Promise.resolve(portal.email),
    prisma.waContactTag.findMany({ where: { contactId: contact.id }, select: { tag: { select: { id: true, name: true, color: true } } } }),
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
    lead: lead ? { adTitle: lead.adTitle, adModel: lead.adModel, adBody: lead.adBody, sourceUrl: lead.sourceUrl, image: adImage, adStrong: isStrongAd(lead) } : null,
    funnelStage: conv?.funnelStage ?? null,
    funnelEvidence: conv?.funnelManual ? null : (conv?.funnelEvidence ?? null),
    windowOpen: isWithin24h(lastInboundAt),
    lastInboundAt,
    assignedEmail: conv?.assignedEmail ?? null,
    assignedName: nameOf(conv?.assignedEmail),
    tags: contactTags.map((ct) => ct.tag),
    me,
    meName: nameOf(me),
    attendants: attendants.map((a) => ({ email: a.email, name: a.name || a.email.split("@")[0] })),
    items: messages.map((m) => ({ id: m.id, text: m.text, direction: m.direction, type: m.type, timestamp: m.timestamp, aiGenerated: m.aiGenerated, sentByEmail: m.sentByEmail, sentByName: nameOf(m.sentByEmail), transcription: m.media?.transcription ?? null, deliveredAt: m.deliveredAt, readAt: m.readAt, reaction: m.reaction })),
  });
}
