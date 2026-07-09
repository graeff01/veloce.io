// ── L3: loop de aprendizado — desfecho × abordagem ───────────────────────────
// Fecha o ciclo do blueprint: liga cada conversa ao DESFECHO REAL (venda confirmada
// / funil) e cruza com a ABORDAGEM usada (variante A/B). Responde a pergunta que
// nenhum bot de prateleira responde: "qual abordagem realmente CONVERTE?".
//
// Read-only e com humano no controle: NÃO muta prompt/playbook em produção. Produz
// o sinal (relatório) → você revisa → promove a abordagem vencedora para o Playbook.
// É o padrão recomendado (monitor → aprovação humana → só então age).

import { prisma, prismaUnscoped } from "@/lib/prisma";

export type Outcome = "won" | "qualified" | "lost" | "open";

// Desfecho a partir do funil + venda confirmada pelo gestor (sinal HARD).
export function attributeOutcome(o: { funnelStage: string | null; saleConfirmedAt: Date | null }): Outcome {
  if (o.saleConfirmedAt || o.funnelStage === "convertido") return "won";
  if (o.funnelStage === "perdido") return "lost";
  if (o.funnelStage === "qualificado" || o.funnelStage === "negociacao") return "qualified";
  return "open";
}

export interface VariantPerf {
  variant: string;
  total: number;
  won: number; qualified: number; lost: number; open: number;
  winRate: number;      // won / (won+lost) — só entre as decididas
  qualifyRate: number;  // (won+qualified) / total
}
export interface LearningReport {
  clientId: string;
  days: number;
  totalConversations: number;
  variants: VariantPerf[];
  leader: { metric: "qualifyRate"; variant: string; rate: number } | null;
  note: string;
}

const MIN_SAMPLE = Number(process.env.AI_LEARN_MIN_SAMPLE || 20);

// Agregação PURA (testável sem banco): desfechos por variante → taxas + líder.
export function aggregatePerformance(
  rows: { variant: string; outcome: Outcome }[],
  minSample = MIN_SAMPLE,
): { variants: VariantPerf[]; leader: LearningReport["leader"]; note: string } {
  const map = new Map<string, { total: number; won: number; qualified: number; lost: number; open: number }>();
  for (const r of rows) {
    const c = map.get(r.variant) ?? { total: 0, won: 0, qualified: 0, lost: 0, open: 0 };
    c.total++; c[r.outcome]++;
    map.set(r.variant, c);
  }
  const variants: VariantPerf[] = [...map.entries()].map(([variant, c]) => {
    const decided = c.won + c.lost;
    return {
      variant, ...c,
      winRate: decided ? Number((c.won / decided).toFixed(3)) : 0,
      qualifyRate: c.total ? Number(((c.won + c.qualified) / c.total).toFixed(3)) : 0,
    };
  }).sort((a, b) => b.qualifyRate - a.qualifyRate);

  const eligible = variants.filter((v) => v.total >= minSample);
  const leader = eligible.length >= 2
    ? { metric: "qualifyRate" as const, variant: eligible[0].variant, rate: eligible[0].qualifyRate }
    : null;
  const note = eligible.length >= 2
    ? `${eligible[0].variant} lidera em qualificação. Amostra suficiente (≥${minSample}). Revise e promova as táticas vencedoras para o Playbook.`
    : `Amostra ainda pequena por variante (mín. ${minSample}). Deixe rodar mais antes de concluir.`;
  return { variants, leader, note };
}

// Junção real: conversas (desfecho) × variante usada, por cliente e janela.
export async function learnFromOutcomes(clientId: string, days = 30): Promise<LearningReport> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const conn = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });
  if (!conn) return { clientId, days, totalConversations: 0, variants: [], leader: null, note: "Cliente sem WhatsApp conectado." };

  const convos = await prismaUnscoped.waConversation.findMany({
    where: { connectionId: conn.id, lastMessageAt: { gte: since } },
    select: { contactId: true, funnelStage: true, saleConfirmedAt: true },
  });
  if (!convos.length) return { clientId, days, totalConversations: 0, variants: [], leader: null, note: "Sem conversas na janela." };

  // Variante usada por contato (resolveVariant é determinístico por contato → 1 por lead).
  const interactions = await prisma.aiInteraction.findMany({
    where: { clientId, contactId: { in: convos.map((c) => c.contactId) } },
    orderBy: { createdAt: "asc" },
    select: { contactId: true, promptVariant: true },
  });
  const variantByContact = new Map<string, string>();
  for (const it of interactions) {
    if (!it.contactId) continue;
    if (!variantByContact.has(it.contactId) && it.promptVariant) variantByContact.set(it.contactId, it.promptVariant);
  }

  const rows = convos.map((c) => ({
    variant: variantByContact.get(c.contactId) ?? "padrão",
    outcome: attributeOutcome(c),
  }));

  const { variants, leader, note } = aggregatePerformance(rows);
  return { clientId, days, totalConversations: convos.length, variants, leader, note };
}
