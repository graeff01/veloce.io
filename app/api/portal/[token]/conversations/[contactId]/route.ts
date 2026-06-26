import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

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

  const [messages, lead, conv] = await Promise.all([
    prisma.waMessage.findMany({ where: { contactId: contact.id }, orderBy: [{ timestamp: "asc" }, { id: "asc" }], take: 2000, select: { id: true, text: true, direction: true, type: true, timestamp: true } }),
    prisma.waLead.findUnique({ where: { contactId: contact.id }, select: { adTitle: true, adModel: true } }),
    prisma.waConversation.findUnique({ where: { contactId: contact.id }, select: { funnelStage: true } }),
  ]);

  return NextResponse.json({
    contact: { name: contact.displayName || contact.name || contact.waId },
    lead: lead ? { adTitle: lead.adTitle, adModel: lead.adModel } : null,
    funnelStage: conv?.funnelStage ?? null,
    items: messages.map((m) => ({ id: m.id, text: m.text, direction: m.direction, type: m.type, timestamp: m.timestamp })),
  });
}
