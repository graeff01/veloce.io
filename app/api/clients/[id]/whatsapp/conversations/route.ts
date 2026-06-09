import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { deriveBadge, monthStart } from "@/lib/wa-leads";

// GET — lista de conversas (contatos) com a última mensagem e marca de anúncio.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const contacts = await prisma.waContact.findMany({
    where: { connectionId: conn.id },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    include: {
      messages: { orderBy: { timestamp: "desc" }, take: 1 },
      tags: { include: { tag: true } },
    },
  });

  const leads = await prisma.waLead.findMany({
    where: { connectionId: conn.id, contactId: { in: contacts.map((c) => c.id) } },
  });
  const leadByContact = new Map(leads.map((l) => [l.contactId, l]));
  const period = monthStart();

  return NextResponse.json(
    contacts.map((c) => {
      const lead = leadByContact.get(c.id);
      const last = c.messages[0];
      return {
        contactId: c.id,
        waId: c.waId,
        name: c.name,
        displayName: c.displayName,
        lastMessageAt: c.lastMessageAt,
        lastText: last?.text ?? null,
        lastDirection: last?.direction ?? null,
        fromAd: !!lead,
        adTitle: lead?.adTitle ?? null,
        reportValid: c.reportValid,
        tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
        // Novo/Recorrente (reativado fica na visão mensal de Leads de anúncio).
        badge: deriveBadge({ createdAt: c.createdAt, periodStart: period }),
      };
    }),
  );
}
