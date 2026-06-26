import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";

// GET — lista de conversas do cliente (token-scoped, SOMENTE LEITURA, sem login).
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId } });
  if (!conn) return NextResponse.json([]);

  const contacts = await prisma.waContact.findMany({
    where: { connectionId: conn.id },
    orderBy: { lastMessageAt: "desc" },
    take: 300,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1, select: { text: true, direction: true, type: true } } },
  });
  const ids = contacts.map((c) => c.id);
  const [leads, convs] = await Promise.all([
    prisma.waLead.findMany({ where: { connectionId: conn.id, contactId: { in: ids } }, select: { contactId: true, adTitle: true } }),
    prisma.waConversation.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, funnelStage: true } }),
  ]);
  const leadBy = new Map(leads.map((l) => [l.contactId, l]));
  const stageBy = new Map(convs.map((c) => [c.contactId, c.funnelStage]));

  return NextResponse.json(
    contacts.map((c) => {
      const lead = leadBy.get(c.id);
      const last = c.messages[0];
      return {
        contactId: c.id,
        name: c.displayName || c.name || c.waId,
        lastText: last?.text ?? null,
        lastType: last?.type ?? null,
        lastDirection: last?.direction ?? null,
        lastMessageAt: c.lastMessageAt,
        fromAd: !!lead,
        adTitle: lead?.adTitle ?? null,
        funnelStage: stageBy.get(c.id) ?? null,
      };
    }),
  );
}
