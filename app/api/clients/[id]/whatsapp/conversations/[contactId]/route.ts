import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { logWaEvent } from "@/lib/wa-events";
import { z } from "zod";

const FUNNEL_STAGES = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "convertido"] as const;
const patchSchema = z.object({
  funnelStage: z.enum(FUNNEL_STAGES).nullable().optional(),
  displayName: z.string().max(120).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  reportValid: z.boolean().optional(),
  reportInvalidReason: z.string().max(300).nullable().optional(),
  tagIds: z.array(z.string()).max(30).optional(),
});

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

  const [messages, lead, conversation, tags] = await Promise.all([
    prisma.waMessage.findMany({ where: { contactId: contact.id }, orderBy: { timestamp: "asc" }, take: 1000 }),
    prisma.waLead.findUnique({ where: { contactId: contact.id } }),
    prisma.waConversation.findUnique({ where: { contactId: contact.id } }),
    prisma.waContactTag.findMany({ where: { contactId: contact.id }, include: { tag: true } }),
  ]);

  return NextResponse.json({
    contact: {
      id: contact.id, waId: contact.waId, name: contact.name,
      displayName: contact.displayName, notes: contact.notes,
      reportValid: contact.reportValid, reportInvalidReason: contact.reportInvalidReason,
      createdAt: contact.createdAt,
    },
    tags: tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    lead: lead ? { adTitle: lead.adTitle, adId: lead.adId, adModel: lead.adModel, sourceType: lead.sourceType, sourceUrl: lead.sourceUrl, ctwaClid: lead.ctwaClid, enteredAt: lead.enteredAt, imported: lead.imported } : null,
    funnelStage: conversation?.funnelStage ?? null,
    status: conversation?.status ?? null,
    aiSummary: conversation?.aiSummary ?? null,
    aiSuggestedStage: conversation?.aiSuggestedStage ?? null,
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
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const d = parsed.data;

  const { conn, contact } = await getConnAndContact(id, contactId);
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  // Campos do contato (nome interno, notas, validade p/ relatório).
  const contactUpdate: Record<string, unknown> = {};
  if (d.displayName !== undefined) contactUpdate.displayName = d.displayName;
  if (d.notes !== undefined) contactUpdate.notes = d.notes;
  if (d.reportValid !== undefined) contactUpdate.reportValid = d.reportValid;
  if (d.reportInvalidReason !== undefined) contactUpdate.reportInvalidReason = d.reportInvalidReason;
  if (Object.keys(contactUpdate).length) {
    await prisma.waContact.update({ where: { id: contact.id }, data: contactUpdate });
  }

  // Tags: substitui o conjunto (idempotente).
  if (d.tagIds !== undefined) {
    const valid = await prisma.waTag.findMany({ where: { connectionId: conn.id, id: { in: d.tagIds } }, select: { id: true } });
    await prisma.$transaction([
      prisma.waContactTag.deleteMany({ where: { contactId: contact.id } }),
      prisma.waContactTag.createMany({ data: valid.map((t) => ({ contactId: contact.id, tagId: t.id })), skipDuplicates: true }),
    ]);
  }

  // Funil (mantém comportamento atual).
  let funnelStage = undefined as string | null | undefined;
  if (d.funnelStage !== undefined) {
    const conversation = await prisma.waConversation.upsert({
      where: { contactId: contact.id },
      create: { connectionId: conn.id, contactId: contact.id, funnelStage: d.funnelStage },
      update: { funnelStage: d.funnelStage },
    });
    funnelStage = conversation.funnelStage;
    await logWaEvent(conn.id, "funnel.changed", contact.id, { stage: d.funnelStage, by: session?.user?.id ?? null });
  }

  if (d.reportValid !== undefined) {
    await logWaEvent(conn.id, "report.validity", contact.id, { valid: d.reportValid, reason: d.reportInvalidReason ?? null, by: session?.user?.id ?? null });
  }

  return NextResponse.json({ ok: true, funnelStage });
}
