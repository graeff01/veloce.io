import { prisma } from "@/lib/prisma";
import { excludedTokens, nameExcluded } from "@/lib/notifications/client-bot";

// Etapas ORDENADAS do funil (frio → quente). A cor é a "temperatura" do lead:
// escala sequencial (azul→vermelho), perceptualmente correta pra dados ordenados.
const ORDER = ["recebido", "respondido", "qualificado", "negociacao", "convertido"] as const;
const META: Record<string, { label: string; color: string }> = {
  recebido:    { label: "Recebido",    color: "#2563EB" }, // azul (frio)
  respondido:  { label: "Respondido",  color: "#06B6D4" }, // ciano
  qualificado: { label: "Qualificado", color: "#EAB308" }, // amarelo
  negociacao:  { label: "Negociação",  color: "#F97316" }, // laranja
  convertido:  { label: "Convertido",  color: "#DC2626" }, // vermelho (quente)
};

export type FunnelLead = { contactId: string; name: string; waId: string; lastMessageAt: string | null; ageDays: number | null; evidence: string | null };
export type FunnelStage = {
  key: string; label: string; color: string;
  reached: number;           // volume do funil (acumulado: chegou até aqui)
  pctOfTop: number;          // reached / topo (largura da faixa)
  convFromPrev: number | null; // % que avançou da etapa anterior
  isBottleneck: boolean;     // maior queda
  currentCount: number;      // leads parados AQUI agora
  avgStaleDays: number | null; // tempo médio parado (v3)
  leads: FunnelLead[];       // leads atualmente nesta etapa (v2, cap 50)
};
export type FunnelData = {
  stages: FunnelStage[];
  total: number; lost: number; converted: number; overallConv: number;
  bottleneckLabel: string | null;
  avgResponseMin: number | null; // velocidade (v3)
  comparativo: { thisLeads: number; lastLeads: number; deltaPct: number | null; thisConv: number };
};

export async function getClientFunnel(clientId: string): Promise<FunnelData | null> {
  const wa = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });
  if (!wa) return null;

  const [convsRaw, excl] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId: wa.id },
      select: { contactId: true, funnelStage: true, funnelEvidence: true, firstInboundAt: true, firstResponseSec: true, lastMessageAt: true, contact: { select: { name: true, waId: true } } },
    }),
    excludedTokens(clientId),
  ]);
  // Remove donos/diretoria/família — não são leads.
  const convs = convsRaw.filter((c) => !nameExcluded(c.contact.name, excl));

  const now = Date.now();
  const DAY = 86_400_000;
  // Modelo de funil: um lead na etapa N passou por 1..N. "perdido" = vazamento (não avança).
  const ordinalOf = (s: string | null) => {
    if (s === "perdido") return -1;
    const i = (ORDER as readonly string[]).indexOf(s ?? "recebido");
    return i < 0 ? 0 : i;
  };

  const total = convs.length;
  const lost = convs.filter((c) => c.funnelStage === "perdido").length;
  const converted = convs.filter((c) => c.funnelStage === "convertido").length;

  const reached = ORDER.map((_, K) => (K === 0 ? total : convs.filter((c) => ordinalOf(c.funnelStage) >= K).length));
  const convFromPrev = ORDER.map((_, K) => (K === 0 ? null : reached[K - 1] > 0 ? Math.round((reached[K] / reached[K - 1]) * 100) : null));

  let bnK = -1, bnVal = 101;
  for (let K = 1; K < ORDER.length; K++) { const v = convFromPrev[K]; if (v != null && v < bnVal) { bnVal = v; bnK = K; } }

  const stages: FunnelStage[] = ORDER.map((key, K) => {
    const current = convs.filter((c) => (c.funnelStage ?? "recebido") === key);
    const stale = current.map((c) => (c.lastMessageAt ? (now - c.lastMessageAt.getTime()) / DAY : null)).filter((x): x is number => x != null);
    return {
      key, label: META[key].label, color: META[key].color,
      reached: reached[K],
      pctOfTop: reached[0] > 0 ? Math.round((reached[K] / reached[0]) * 100) : 0,
      convFromPrev: convFromPrev[K], isBottleneck: K === bnK,
      currentCount: current.length,
      avgStaleDays: stale.length ? Math.round(stale.reduce((s, x) => s + x, 0) / stale.length) : null,
      leads: current
        .sort((a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0))
        .slice(0, 200)
        .map((c) => ({
          contactId: c.contactId,
          name: (c.contact.name || "").trim() || "Lead",
          waId: c.contact.waId,
          lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
          ageDays: c.lastMessageAt ? Math.round((now - c.lastMessageAt.getTime()) / DAY) : null,
          evidence: c.funnelEvidence ?? null,
        })),
    };
  });

  const times = convs.map((c) => c.firstResponseSec).filter((x): x is number => x != null);
  const avgResponseMin = times.length ? Math.round(times.reduce((s, x) => s + x, 0) / times.length / 60) : null;

  // Comparativo vs período anterior (mês atual vs mês passado, por entrada do lead)
  const d = new Date();
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const inRange = (c: (typeof convs)[number], a: Date, b: Date) => !!c.firstInboundAt && c.firstInboundAt >= a && c.firstInboundAt < b;
  const nowD = new Date(now + 1);
  const thisLeads = convs.filter((c) => inRange(c, monthStart, nowD)).length;
  const lastLeads = convs.filter((c) => inRange(c, prevStart, monthStart)).length;
  const thisConv = convs.filter((c) => inRange(c, monthStart, nowD) && c.funnelStage === "convertido").length;
  const deltaPct = lastLeads > 0 ? Math.round(((thisLeads - lastLeads) / lastLeads) * 100) : null;

  return {
    stages, total, lost, converted,
    overallConv: total > 0 ? Math.round((converted / total) * 100) : 0,
    bottleneckLabel: bnK >= 1 ? META[ORDER[bnK]].label : null,
    avgResponseMin,
    comparativo: { thisLeads, lastLeads, deltaPct, thisConv },
  };
}
