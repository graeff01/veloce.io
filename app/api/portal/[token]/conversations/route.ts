import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getPortalSessionEmail } from "@/lib/portal-auth";

export const runtime = "nodejs";

// GET — lista de conversas do cliente (token-scoped). Devolve { conversations, me, attendants }.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId } });
  if (!conn) return NextResponse.json({ conversations: [], me: null, attendants: [] });

  const contacts = await prisma.waContact.findMany({
    where: { connectionId: conn.id },
    orderBy: { lastMessageAt: "desc" },
    take: 300,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1, select: { text: true, direction: true, type: true } } },
  });
  const ids = contacts.map((c) => c.id);
  const [leads, convs, attendants, me] = await Promise.all([
    prisma.waLead.findMany({ where: { connectionId: conn.id, contactId: { in: ids } }, select: { contactId: true, adTitle: true, adModel: true } }),
    prisma.waConversation.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, funnelStage: true, assignedEmail: true } }),
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
    getPortalSessionEmail(portal.clientId),
  ]);
  const leadBy = new Map(leads.map((l) => [l.contactId, l]));
  const convBy = new Map(convs.map((c) => [c.contactId, c]));
  const nameOf = (email: string | null) => (email ? (attendants.find((a) => a.email === email)?.name || email.split("@")[0]) : null);

  return NextResponse.json({
    me,
    meName: nameOf(me),
    attendants: attendants.map((a) => ({ email: a.email, name: a.name || a.email.split("@")[0] })),
    conversations: contacts.map((c) => {
      const lead = leadBy.get(c.id);
      const last = c.messages[0];
      const cv = convBy.get(c.id);
      return {
        contactId: c.id,
        name: c.displayName || c.name || c.waId,
        lastText: last?.text ?? null,
        lastType: last?.type ?? null,
        lastDirection: last?.direction ?? null,
        lastMessageAt: c.lastMessageAt,
        fromAd: !!lead,
        adTitle: lead?.adTitle ?? null,
        adModel: lead?.adModel ?? null,
        funnelStage: cv?.funnelStage ?? null,
        assignedEmail: cv?.assignedEmail ?? null,
        assignedName: nameOf(cv?.assignedEmail ?? null),
      };
    }),
  });
}
