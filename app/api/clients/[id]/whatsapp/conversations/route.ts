import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

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
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1 } },
  });

  const leads = await prisma.waLead.findMany({
    where: { connectionId: conn.id, contactId: { in: contacts.map((c) => c.id) } },
  });
  const leadByContact = new Map(leads.map((l) => [l.contactId, l]));

  return NextResponse.json(
    contacts.map((c) => {
      const lead = leadByContact.get(c.id);
      const last = c.messages[0];
      return {
        contactId: c.id,
        waId: c.waId,
        name: c.name,
        lastMessageAt: c.lastMessageAt,
        lastText: last?.text ?? null,
        lastDirection: last?.direction ?? null,
        fromAd: !!lead,
        adTitle: lead?.adTitle ?? null,
      };
    }),
  );
}
