import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// ── Painel de qualidade da IA (F0) ───────────────────────────────────────────
// Métricas de observabilidade por cliente, em cima do log AiInteraction que já
// gravamos por turno. Escopado por clientId (respeita o guard multi-tenant): itera
// os clientes que têm agente configurado e agrega os últimos N dias.
//
// Custo em USD estimado com o preço do gpt-4o-mini (mesma base de lib/limits.ts) —
// é uma aproximação para acompanhar tendência, não faturamento.
const COST_IN_PER_TOKEN = 0.15 / 1e6;
const COST_OUT_PER_TOKEN = 0.6 / 1e6;

export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 30), 1), 180);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);

  const configs = await prisma.aiAgentConfig.findMany({
    select: { clientId: true, status: true, enabled: true, vertical: true, model: true, client: { select: { name: true } } },
  });

  const rows = await Promise.all(
    configs.map(async (cfg) => {
      const where = { clientId: cfg.clientId, createdAt: { gte: since } };
      const [total, byDecision, byStatus, agg, last] = await Promise.all([
        prisma.aiInteraction.count({ where }),
        prisma.aiInteraction.groupBy({ by: ["decision"], where, _count: { _all: true } }),
        prisma.aiInteraction.groupBy({ by: ["status"], where, _count: { _all: true } }),
        prisma.aiInteraction.aggregate({ where, _avg: { latencyMs: true, qualityScore: true }, _sum: { tokensIn: true, tokensOut: true } }),
        prisma.aiInteraction.findFirst({ where: { clientId: cfg.clientId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
      ]);

      const dec = Object.fromEntries(byDecision.map((d) => [d.decision ?? "—", d._count._all]));
      const st = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
      const n = (v: number | undefined) => v ?? 0;

      const escalou = n(dec["escalou"]);
      const abster = n(dec["abster"]) + n(dec["sem_fonte"]);
      const bloqueado = n(st["blocked"]);
      const erro = n(st["error"]);
      const tokensIn = agg._sum.tokensIn ?? 0;
      const tokensOut = agg._sum.tokensOut ?? 0;

      return {
        clientId: cfg.clientId,
        clientName: cfg.client?.name ?? "—",
        status: cfg.status,
        enabled: cfg.enabled,
        vertical: cfg.vertical,
        model: cfg.model,
        total,
        escalou,
        abster,
        bloqueado,
        erro,
        // taxas (% do total de turnos no período)
        taxaEscalonamento: total ? Math.round((escalou / total) * 100) : 0,
        taxaAbstencao: total ? Math.round((abster / total) * 100) : 0,
        taxaBloqueio: total ? Math.round((bloqueado / total) * 100) : 0,
        taxaErro: total ? Math.round((erro / total) * 100) : 0,
        avgLatencyMs: Math.round(agg._avg.latencyMs ?? 0),
        qualityAvg: agg._avg.qualityScore != null ? Number(agg._avg.qualityScore.toFixed(2)) : null,
        custoUsd: Number((tokensIn * COST_IN_PER_TOKEN + tokensOut * COST_OUT_PER_TOKEN).toFixed(2)),
        lastAt: last?.createdAt ?? null,
        byDecision: dec,
      };
    }),
  );

  rows.sort((a, b) => b.total - a.total);

  // Alertas proativos: bloqueio/erro acima do limiar. Observabilidade que "empurra"
  // o problema, em vez de esperar alguém olhar o painel.
  const alerts: { severity: "high" | "warn"; clientName: string; message: string }[] = [];
  for (const r of rows) {
    if (r.total < 10) continue; // amostra pequena: não alarma
    if (r.taxaErro >= 2) alerts.push({ severity: "high", clientName: r.clientName, message: `${r.taxaErro}% de erros técnicos` });
    if (r.taxaBloqueio >= 5) alerts.push({ severity: "warn", clientName: r.clientName, message: `${r.taxaBloqueio}% das respostas bloqueadas pelo guardrail` });
  }
  alerts.sort((a, b) => (a.severity === "high" ? 0 : 1) - (b.severity === "high" ? 0 : 1));

  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      escalou: acc.escalou + r.escalou,
      abster: acc.abster + r.abster,
      bloqueado: acc.bloqueado + r.bloqueado,
      erro: acc.erro + r.erro,
      custoUsd: Number((acc.custoUsd + r.custoUsd).toFixed(2)),
    }),
    { total: 0, escalou: 0, abster: 0, bloqueado: 0, erro: 0, custoUsd: 0 },
  );

  const scored = rows.filter((r) => r.qualityAvg != null);
  const qualidadeMedia = scored.length ? Number((scored.reduce((s, r) => s + (r.qualityAvg ?? 0), 0) / scored.length).toFixed(2)) : null;

  return NextResponse.json({ days, totals: { ...totals, qualidadeMedia }, alerts, clients: rows });
}
