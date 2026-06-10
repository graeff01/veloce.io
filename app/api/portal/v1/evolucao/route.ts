import { NextRequest, NextResponse } from "next/server";
import { requirePortalAuth, logPortalAccess } from "@/lib/portal-helpers";
import { prisma } from "@/lib/prisma";

// Evolução do portal — responde "estamos melhorando?".
// Séries de leads, conversões, investimento e CPL ao longo do tempo, 100% de
// dados reais: leads/conversões do WhatsApp (WaConversation), investimento do
// MetaAdInsight (por ad_id, mesma fonte da atribuição). Sem mock, sem nome.
type Period = "7d" | "30d" | "90d" | "12m";

const VALID: Period[] = ["7d", "30d", "90d", "12m"];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const auth = await requirePortalAuth(req);
  if (auth.error) return auth.error;
  const { session } = auth;

  const url = new URL(req.url);
  const raw = url.searchParams.get("periodo") ?? "30d";
  const period: Period = VALID.includes(raw as Period) ? (raw as Period) : "30d";
  const monthly = period === "12m";

  const now = new Date();
  let start: Date;
  if (period === "12m") start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  else {
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1));
  }

  const [waConn, metaConn] = await Promise.all([
    prisma.waConnection.findUnique({ where: { clientId: session.clientId }, select: { id: true } }),
    prisma.metaConnection.findUnique({ where: { clientId: session.clientId }, select: { id: true } }),
  ]);

  // Eixo de buckets (dia ou mês)
  const buckets: string[] = [];
  if (monthly) {
    for (let i = 0; i < 12; i++) buckets.push(monthKey(new Date(now.getFullYear(), now.getMonth() - 11 + i, 1)));
  } else {
    const cur = new Date(start);
    while (cur <= now) { buckets.push(dayKey(cur)); cur.setDate(cur.getDate() + 1); }
  }
  const keyOf = (d: Date) => (monthly ? monthKey(d) : dayKey(d));

  const leadsMap = new Map<string, number>();
  const convMap = new Map<string, number>();
  const spendMap = new Map<string, number>();
  for (const b of buckets) { leadsMap.set(b, 0); convMap.set(b, 0); spendMap.set(b, 0); }

  // Leads e conversões — WhatsApp (atribuídos pela data de entrada do lead)
  if (waConn) {
    const convs = await prisma.waConversation.findMany({
      where: { connectionId: waConn.id, firstInboundAt: { gte: start } },
      select: { firstInboundAt: true, funnelStage: true },
    });
    for (const c of convs) {
      if (!c.firstInboundAt) continue;
      const k = keyOf(c.firstInboundAt);
      if (leadsMap.has(k)) {
        leadsMap.set(k, (leadsMap.get(k) ?? 0) + 1);
        if (c.funnelStage === "convertido") convMap.set(k, (convMap.get(k) ?? 0) + 1);
      }
    }
  }

  // Investimento — MetaAdInsight (por ad_id, mesma fonte do CPL real)
  let hasInvest = false;
  if (metaConn) {
    const ins = await prisma.metaAdInsight.findMany({
      where: { connectionId: metaConn.id, date: { gte: start } },
      select: { date: true, spend: true },
    });
    hasInvest = ins.length > 0;
    for (const r of ins) {
      const k = keyOf(r.date);
      if (spendMap.has(k)) spendMap.set(k, (spendMap.get(k) ?? 0) + r.spend);
    }
  }

  const series = buckets.map((b) => {
    const leads = leadsMap.get(b) ?? 0;
    const conversoes = convMap.get(b) ?? 0;
    const investimento = parseFloat((spendMap.get(b) ?? 0).toFixed(2));
    const cpl = leads > 0 && investimento > 0 ? parseFloat((investimento / leads).toFixed(2)) : 0;
    return { date: b, leads, conversoes, investimento, cpl };
  });

  const totalLeads = series.reduce((s, r) => s + r.leads, 0);
  const totalConv = series.reduce((s, r) => s + r.conversoes, 0);
  const totalSpend = series.reduce((s, r) => s + r.investimento, 0);

  await logPortalAccess(session.clientId, session.credentialId, "VIEW_EVOLUCAO", req);

  return NextResponse.json({
    period,
    granularity: monthly ? "month" : "day",
    series,
    // flags p/ o front mostrar "Dado indisponível" em vez de inventar
    hasInvestmentData: hasInvest,
    totais: {
      leads: totalLeads,
      conversoes: totalConv,
      investimento: parseFloat(totalSpend.toFixed(2)),
      cpl: totalLeads > 0 && totalSpend > 0 ? parseFloat((totalSpend / totalLeads).toFixed(2)) : null,
    },
  });
}
