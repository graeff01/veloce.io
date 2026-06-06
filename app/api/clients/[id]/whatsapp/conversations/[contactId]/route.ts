import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { logWaEvent } from "@/lib/wa-events";
import { z } from "zod";

const FUNNEL_STAGES = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "convertido"] as const;
const patchSchema = z.object({ funnelStage: z.enum(FUNNEL_STAGES).nullable() });

async function getConnAndContact(clientId: string, contactId: string) {
  const conn = await prisma.waConnection.findUnique({ where: { clientId } });
  if (!conn) return { conn: null, contact: null };
  const contact = await prisma.waContact.findFirst({ where: { id: contactId, connectionId: conn.id } });
  return { conn, contact };
}

// GET — histórico de mensagens de uma conversa (somente leitura).
export async function GET(_: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const { conn, contact } = await getConnAndContact(id, contactId);
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const [messages, lead, conversation] = await Promise.all([
    prisma.waMessage.findMany({ where: { contactId: contact.id }, orderBy: { timestamp: "asc" }, take: 1000 }),
    prisma.waLead.findUnique({ where: { contactId: contact.id } }),
    prisma.waConversation.findUnique({ where: { contactId: contact.id } }),
  ]);

  return NextResponse.json({
    contact: { id: contact.id, waId: contact.waId, name: contact.name },
    lead: lead ? { adTitle: lead.adTitle, adId: lead.adId, enteredAt: lead.enteredAt } : null,
    funnelStage: conversation?.funnelStage ?? null,
    status: conversation?.status ?? null,
    items: messages.map((m) => ({
      id: m.id, text: m.text, direction: m.direction, type: m.type,
      timestamp: m.timestamp, deliveredAt: m.deliveredAt, readAt: m.readAt,
    })),
  });
}

// PATCH — define a etapa de funil (gestão manual, feita pelo gestor). Não toca no WhatsApp.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error, session } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });

  const { conn, contact } = await getConnAndContact(id, contactId);
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const conversation = await prisma.waConversation.upsert({
    where: { contactId: contact.id },
    create: { connectionId: conn.id, contactId: contact.id, funnelStage: parsed.data.funnelStage },
    update: { funnelStage: parsed.data.funnelStage },
  });

  await logWaEvent(conn.id, "funnel.changed", contact.id, { stage: parsed.data.funnelStage, by: session?.user?.id ?? null });
  return NextResponse.json({ funnelStage: conversation.funnelStage });
}
