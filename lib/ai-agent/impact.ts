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
  leads: { attended: number; qualified: number; hot: number; warm: number; cold: number };
  recovered: number;
  fichasEntregues: number;
  cost: { totalUsd: number; perLeadUsd: number; leads: number };
}

// Mediana pura (ordena, meio; null se vazio). Testável isoladamente.
export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface ImpactRange { start: Date; end: Date }

export async function buildImpact(clientId: string, range: ImpactRange): Promise<ImpactSummary> {
  const { start, end } = range;
  const windowDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const conns = await prismaUnscoped.waConnection.findMany({ where: { clientId }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  if (connIds.length === 0) {
    return { windowDays, responseTime: { aiMedianSec: null, humanMedianSec: null, aiCount: 0, humanCount: 0 }, leads: { attended: 0, qualified: 0, hot: 0, warm: 0, cold: 0 }, recovered: 0, fichasEntregues: 0, cost: { totalUsd: 0, perLeadUsd: 0, leads: 0 } };
  }
  const inWindow = { gte: start, lt: end };

  // Contatos atendidos pela IA na janela (saída aiGenerated) — base de "leads atendidos".
  const aiOutMsgs = await prismaUnscoped.waMessage.findMany({
    where: { connectionId: { in: connIds }, aiGenerated: true, direction: "out", timestamp: inWindow },
    distinct: ["contactId"], select: { contactId: true },
  });
  const aiContactIds = aiOutMsgs.map((m) => m.contactId);

  const [convRows, qualified, tempRows, recovered, fichasEntregues, cost] = await Promise.all([
    // Conversas com 1ª resposta na janela — split IA x humano pela mediana do tempo.
    prismaUnscoped.waConversation.findMany({
      where: { connectionId: { in: connIds }, firstResponseAt: inWindow, firstResponseSec: { not: null } },
      select: { contactId: true, firstResponseSec: true },
    }),
    prismaUnscoped.leadProfile.count({ where: { connectionId: { in: connIds }, qualified: true, createdAt: inWindow } }),
    prismaUnscoped.leadProfile.groupBy({ by: ["temperature"], where: { connectionId: { in: connIds }, temperature: { not: null }, createdAt: inWindow }, _count: { _all: true } }),
    prismaUnscoped.waConversation.count({ where: { connectionId: { in: connIds }, reengagedAt: inWindow } }),
    prismaUnscoped.waConversation.count({ where: { connectionId: { in: connIds }, fichaSentAt: inWindow } }),
    windowCost(clientId, start, end),
  ]);

  const tempOf = (k: string) => (tempRows.find((r) => r.temperature === k)?._count._all ?? 0);
  const hot = tempOf("hot"), warm = tempOf("warm"), cold = tempOf("cold");

  const aiSet = new Set(aiContactIds);
  const aiSecs: number[] = [];
  const humanSecs: number[] = [];
  for (const c of convRows) {
    const sec = c.firstResponseSec as number;
    if (aiSet.has(c.contactId)) aiSecs.push(sec); else humanSecs.push(sec);
  }

  return {
    windowDays,
    responseTime: { aiMedianSec: median(aiSecs), humanMedianSec: median(humanSecs), aiCount: aiSecs.length, humanCount: humanSecs.length },
    leads: { attended: aiContactIds.length, qualified, hot, warm, cold },
    recovered,
    fichasEntregues,
    cost: { totalUsd: cost.totalUsd, perLeadUsd: cost.perLeadUsd, leads: cost.leads },
  };
}
