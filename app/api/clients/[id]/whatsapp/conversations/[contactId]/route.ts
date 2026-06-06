import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, logAction } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";
import { z } from "zod";

const sendSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

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

// POST — envia uma mensagem de texto pela Cloud API e espelha no histórico.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = sendSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Mensagem inválida" }, { status: 400 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const contact = await prisma.waContact.findFirst({ where: { id: contactId, connectionId: conn.id } });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const text = parsed.data.text;
  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${decryptSecret(conn.accessToken)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: contact.waId,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = payload?.error?.message ?? "Não foi possível enviar a mensagem";
    return NextResponse.json({ error: message, details: payload?.error ?? null }, { status: 502 });
  }

  const waMessageId = payload?.messages?.[0]?.id;
  if (!waMessageId) return NextResponse.json({ error: "A Meta não retornou o ID da mensagem" }, { status: 502 });

  const now = new Date();
  const msg = await prisma.waMessage.upsert({
    where: { connectionId_waMessageId: { connectionId: conn.id, waMessageId } },
    create: {
      connectionId: conn.id,
      contactId: contact.id,
      waMessageId,
      direction: "out",
      type: "text",
      text,
      timestamp: now,
      raw: payload as object,
    },
    update: {},
  });

  await prisma.waContact.update({ where: { id: contact.id }, data: { lastMessageAt: now } });
  await prisma.waConnection.update({ where: { id: conn.id }, data: { lastEventAt: now } });
  if (session?.user?.id) await logAction(session.user.id, "WHATSAPP_SEND_MESSAGE", id, undefined, { contactId });

  return NextResponse.json({
    id: msg.id,
    text: msg.text,
    direction: msg.direction,
    type: msg.type,
    timestamp: msg.timestamp,
  }, { status: 201 });
}
