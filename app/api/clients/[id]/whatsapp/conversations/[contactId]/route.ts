import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET — histórico de mensagens de uma conversa (somente leitura).
export async function GET(_: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const contact = await prisma.waContact.findFirst({ where: { id: contactId, connectionId: conn.id } });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const messages = await prisma.waMessage.findMany({
    where: { contactId: contact.id },
    orderBy: { timestamp: "asc" },
    take: 1000,
  });
  const lead = await prisma.waLead.findUnique({ where: { contactId: contact.id } });

  return NextResponse.json({
    contact: { id: contact.id, waId: contact.waId, name: contact.name },
    lead: lead ? { adTitle: lead.adTitle, adId: lead.adId, enteredAt: lead.enteredAt } : null,
    items: messages.map((m) => ({
      id: m.id,
      text: m.text,
      direction: m.direction,
      type: m.type,
      timestamp: m.timestamp,
    })),
  });
}
