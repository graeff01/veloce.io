import { prismaUnscoped } from "@/lib/prisma";
import { windowCost } from "@/lib/ai-agent/usage";

// ── #3: Painel de Impacto / ROI da IA ─────────────────────────────────────────
// Agregação da PROVA de valor pro dono da loja (retenção + case comercial): o que
// a IA fez no período em "números bonitos". Tudo deriva de dados que já existem —
// sem tabela nova. Escopo por cliente (clientId → connIds); leitura prismaUnscoped
// com filtro explícito (seguro single-tenant), mesmo padrão de insights.ts.

export interface ImpactSummary {
  windowDays: number;
  responseTime: { aiMedianSec: number | null; humanMedianSec: number | null; aiCount: number; humanCount: number };
  leads: { attended: number; qualified: number; hot: number };
  recovered: number;
  cost: { totalUsd: number; perLeadUsd: number; leads: number };
}

// Mediana pura (ordena, meio; null se vazio). Testável isoladamente.
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export async function buildImpact(clientId: string, days = 30): Promise<ImpactSummary> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  if (connIds.length === 0) {
    return { windowDays: days, responseTime: { aiMedianSec: null, humanMedianSec: null, aiCount: 0, humanCount: 0 }, leads: { attended: 0, qualified: 0, hot: 0 }, recovered: 0, cost: { totalUsd: 0, perLeadUsd: 0, leads: 0 } };
  }

  // Contatos atendidos pela IA na janela (saída aiGenerated) — base de "leads atendidos".
  const aiOutMsgs = await prismaUnscoped.waMessage.findMany({
    where: { connectionId: { in: connIds }, aiGenerated: true, direction: "out", timestamp: { gte: since } },
    distinct: ["contactId"], select: { contactId: true },
  });
  const aiContactIds = aiOutMsgs.map((m) => m.contactId);

  const [convRows, qualified, hot, recovered, cost] = await Promise.all([
    // Conversas com 1ª resposta na janela — split IA x humano pela mediana do tempo.
    prismaUnscoped.waConversation.findMany({
      where: { connectionId: { in: connIds }, firstResponseAt: { gte: since }, firstResponseSec: { not: null } },
      select: { contactId: true, firstResponseSec: true },
    }),
    prismaUnscoped.leadProfile.count({ where: { connectionId: { in: connIds }, qualified: true } }),
    prismaUnscoped.leadProfile.count({ where: { connectionId: { in: connIds }, temperature: "hot" } }),
    prismaUnscoped.waConversation.count({ where: { connectionId: { in: connIds }, reengagedAt: { gte: since } } }),
    windowCost(clientId, days),
  ]);

  const aiSet = new Set(aiContactIds);
  const aiSecs: number[] = [];
  const humanSecs: number[] = [];
  for (const c of convRows) {
    const sec = c.firstResponseSec as number;
    if (aiSet.has(c.contactId)) aiSecs.push(sec); else humanSecs.push(sec);
  }

  return {
    windowDays: days,
    responseTime: { aiMedianSec: median(aiSecs), humanMedianSec: median(humanSecs), aiCount: aiSecs.length, humanCount: humanSecs.length },
    leads: { attended: aiContactIds.length, qualified, hot },
    recovered,
    cost: { totalUsd: cost.totalUsd, perLeadUsd: cost.perLeadUsd, leads: cost.leads },
  };
}
