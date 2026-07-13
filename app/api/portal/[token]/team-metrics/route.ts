import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalUser, isAdminRole } from "@/lib/portal-auth";
import { normalizePeriod, periodRanges } from "@/lib/notifications/client-report";

export const runtime = "nodejs";

const CLOSED_QUALIFIED = ["qualificado", "negociacao", "convertido"];

// GET — métricas por atendente (dono do lead) + totais. Período via ?p=.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const user = await getPortalUser(portal.clientId);
  const me = user?.email ?? null;
  const isAdmin = isAdminRole(user?.role);
  if (await isProtected(portal.clientId) && !me) return NextResponse.json({ error: "Faça login." }, { status: 401 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
  if (!conn) return NextResponse.json({ me, isAdmin, period: "month", rows: [], team: null, unassigned: 0 });

  const period = normalizePeriod(new URL(req.url).searchParams.get("p"));
  const { start, end, label } = periodRanges(period);

  const [attendants, convs, replyGroups] = await Promise.all([
    prisma.portalAccess.findMany({ where: { clientId: portal.clientId }, orderBy: { createdAt: "asc" }, select: { email: true, name: true } }),
    prisma.waConversation.findMany({
      where: { connectionId: conn.id },
      select: { assignedEmail: true, assignedAt: true, funnelStage: true, saleValue: true, saleConfirmedAt: true, firstResponseSec: true, firstResponseAt: true, lastInboundAt: true, lastOutboundAt: true },
    }),
    prisma.waMessage.groupBy({
      by: ["sentByEmail"],
      where: { connectionId: conn.id, direction: "out", sentByEmail: { not: null }, timestamp: { gte: start, lte: end } },
      _count: { _all: true },
    }),
  ]);

  const inPeriod = (d: Date | null | undefined) => !!d && d >= start && d <= end;
  const isWaiting = (c: { lastInboundAt: Date | null; lastOutboundAt: Date | null }) => !!c.lastInboundAt && (!c.lastOutboundAt || c.lastInboundAt > c.lastOutboundAt);
  const repliesBy = new Map(replyGroups.map((g) => [g.sentByEmail as string, g._count._all]));

  const blank = () => ({ newLeads: 0, owned: 0, waiting: 0, qualified: 0, converted: 0, revenue: 0, frSum: 0, frN: 0 });
  const acc = new Map<string, ReturnType<typeof blank>>();
  for (const a of attendants) acc.set(a.email, blank());
  let unassigned = 0;

  for (const c of convs) {
    if (!c.assignedEmail) { if (isWaiting(c)) unassigned++; continue; }
    const s = acc.get(c.assignedEmail) ?? blank();
    if (!acc.has(c.assignedEmail)) acc.set(c.assignedEmail, s); // dono que não está mais na lista de atendentes
    s.owned++;
    if (inPeriod(c.assignedAt)) s.newLeads++;
    if (isWaiting(c)) s.waiting++;
    if (c.funnelStage && CLOSED_QUALIFIED.includes(c.funnelStage)) s.qualified++;
    if (c.funnelStage === "convertido" && inPeriod(c.saleConfirmedAt)) { s.converted++; s.revenue += c.saleValue ?? 0; }
    if (c.firstResponseSec != null && inPeriod(c.firstResponseAt)) { s.frSum += c.firstResponseSec; s.frN++; }
  }

  const nameOf = (email: string) => attendants.find((a) => a.email === email)?.name || email.split("@")[0];
  const rows = [...acc.entries()].map(([email, s]) => ({
    email, name: nameOf(email), isMe: email === me,
    newLeads: s.newLeads, owned: s.owned, waiting: s.waiting, qualified: s.qualified,
    converted: s.converted, revenue: Math.round(s.revenue),
    replies: repliesBy.get(email) ?? 0,
    avgFirstResponseSec: s.frN ? Math.round(s.frSum / s.frN) : null,
  })).sort((a, b) => b.converted - a.converted || b.revenue - a.revenue || b.replies - a.replies);

  const team = rows.reduce((t, r) => ({
    newLeads: t.newLeads + r.newLeads, owned: t.owned + r.owned, waiting: t.waiting + r.waiting,
    qualified: t.qualified + r.qualified, converted: t.converted + r.converted, revenue: t.revenue + r.revenue, replies: t.replies + r.replies,
  }), { newLeads: 0, owned: 0, waiting: 0, qualified: 0, converted: 0, revenue: 0, replies: 0 });

  // Atendente só enxerga os PRÓPRIOS números; admin vê o ranking inteiro + totais.
  if (!isAdmin) {
    return NextResponse.json({ me, isAdmin, period, periodLabel: label, rows: rows.filter((r) => r.isMe), team: null, unassigned: 0 });
  }
  return NextResponse.json({ me, isAdmin, period, periodLabel: label, rows, team, unassigned });
}
