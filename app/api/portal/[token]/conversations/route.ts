import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getPortalUser, isAdminRole } from "@/lib/portal-auth";
import { isStrongAd } from "@/lib/wa-leads";

export const runtime = "nodejs";

// GET — lista de conversas do cliente (token-scoped). Devolve { conversations, me, attendants }.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId } });
  if (!conn) return NextResponse.json({ conversations: [], me: null, attendants: [], hasMore: false });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const owner = url.searchParams.get("owner"); // "me" → só as conversas da vendedora logada (dona)
  const user = await getPortalUser(portal.clientId);
  const me = user?.email ?? null;
  const isAdmin = isAdminRole(user?.role);
  // Filtro "Minhas conversas": o dono da conversa é waConversation.assignedEmail.
  const ownerFilter = owner === "me" && me ? { conversation: { is: { assignedEmail: me } } } : {};
  const digits = q.replace(/\D/g, "");
  const search = q
    ? { OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
        ...(digits.length >= 3 ? [{ waId: { contains: digits } }] : []),
      ] }
    : {};

  const rows = await prisma.waContact.findMany({
    where: { connectionId: conn.id, ...search, ...ownerFilter },
    orderBy: { lastMessageAt: "desc" },
    skip: offset,
    take: limit + 1,
    include: { messages: { orderBy: { timestamp: "desc" }, take: 1, select: { text: true, direction: true, type: true } } },
  });
  const hasMore = rows.length > limit;
  const contacts = hasMore ? rows.slice(0, limit) : rows;
  const ids = contacts.map((c) => c.id);
  const [leads, convs, attendants] = await Promise.all([
    prisma.waLead.findMany({ where: { connectionId: conn.id, contactId: { in: ids } }, select: { contactId: true, adTitle: true, adModel: true, adId: true, ctwaClid: true, sourceType: true } }),
    prisma.waConversation.findMany({ where: { contactId: { in: ids } }, select: { contactId: true, funnelStage: true, assignedEmail: true } }),
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
  ]);
  const leadBy = new Map(leads.map((l) => [l.contactId, l]));
  const convBy = new Map(convs.map((c) => [c.contactId, c]));
  const nameOf = (email: string | null) => (email ? (attendants.find((a) => a.email === email)?.name || email.split("@")[0]) : null);

  return NextResponse.json({
    me,
    isAdmin,
    hasMore,
    meName: nameOf(me),
    attendants: attendants.map((a) => ({ email: a.email, name: a.name || a.email.split("@")[0] })),
    conversations: contacts.map((c) => {
      const lead = leadBy.get(c.id);
      const last = c.messages[0];
      const cv = convBy.get(c.id);
      return {
        contactId: c.id,
        name: c.displayName || c.name || c.waId,
        waId: c.waId,
        lastText: last?.text ?? null,
        lastType: last?.type ?? null,
        lastDirection: last?.direction ?? null,
        lastMessageAt: c.lastMessageAt,
        fromAd: !!lead,
        adStrong: isStrongAd(lead),
        adTitle: lead?.adTitle ?? null,
        adModel: lead?.adModel ?? null,
        funnelStage: cv?.funnelStage ?? null,
        assignedEmail: cv?.assignedEmail ?? null,
        assignedName: nameOf(cv?.assignedEmail ?? null),
      };
    }),
  });
}
