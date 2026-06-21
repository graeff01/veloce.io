import { prisma } from "@/lib/prisma";
import { logWaEvent } from "@/lib/wa-events";

// ── Auto-classificação do funil (determinística, sem custo de IA) ────────────
// Roda no webhook a cada mensagem. Lê sinais de texto (lead OU loja) e AVANÇA o
// lead pelo funil. Princípios anti-erro:
//   • forward-only: só avança de etapa (nunca rebaixa por mensagem genérica);
//   • convertido/perdido exigem frase forte (alta precisão → não infla métrica);
//   • trava manual: se o operador editou a etapa, o auto não toca;
//   • convertido é terminal (topo); perdido é reativável se o lead voltar.

export type FunnelStage = "recebido" | "respondido" | "qualificado" | "negociacao" | "convertido" | "perdido";

const RANK: Record<string, number> = { recebido: 0, respondido: 1, qualificado: 2, negociacao: 3, convertido: 4 };

// Rank da etapa ATUAL. null/perdido contam como base (0) → um lead perdido que
// volta com interesse pode ser reativado para qualificado/negociação.
function currentRank(stage: string | null | undefined): number {
  if (!stage || stage === "perdido") return 0;
  return RANK[stage] ?? 0;
}

type SignalStage = "qualificado" | "negociacao" | "convertido" | "perdido";
interface Signal { stage: SignalStage; re: RegExp }

// Sinais base (cobrem automotivo/serviços/genérico). Convertido e perdido com
// frases fortes; qualificado/negociação com intenção clara.
const SIGNALS_BASE: Signal[] = [
  { stage: "perdido", re: /(n[ãa]o tenho (mais )?interesse|desisti|j[áa] comprei|comprei (em |n)outro|n[ãa]o quero mais|deixa pra l[áa]|n[ãa]o vou (querer|levar))/i },
  { stage: "convertido", re: /(vou comprar|vou levar|pode fechar|quero fechar|fechar neg[óo]cio|neg[óo]cio fechado|fechamos|parab[ée]ns pela compra|venda (confirmada|fechada)|compra confirmada|tá fechado|ta fechado)/i },
  { stage: "negociacao", re: /(financiamento|financiar|\bentrada\b|parcela|parcelar|[àa] vista|\btroca\b|test[ -]?drive|agendar|\bvisita\b|passar a[íi]|simula[çc][ãa]o|simular|proposta|\bdesconto\b|condi[çc][õo]es?( de pagamento)?)/i },
  { stage: "qualificado", re: /(qual (o |a )?(valor|pre[çc]o|ano|km|quilometragem|cor)|quanto (custa|fica|sai|é|esta|está)|\bpre[çc]o\b|tem dispon[íi]vel|ainda tem|ainda (est[áa]|t[áa]) dispon[íi]vel|tem em estoque|gostaria de (saber|informa)|tenho interesse|quero saber)/i },
];

// Reforços por vertical (opcionais — a base já cobre bem).
const SIGNALS_BY_VERTICAL: Record<string, Signal[]> = {
  imobiliario: [
    { stage: "negociacao", re: /(\bfgts\b|documenta[çc][ãa]o|escritura|\bsinal\b|agendar visita|visitar (o |a )?(im[óo]vel|apto|apartamento|casa))/i },
    { stage: "qualificado", re: /(quantos quartos|metragem|qual o bairro|condom[íi]nio|\bvaga\b|\bsu[íi]te)/i },
  ],
};

// "Força" para escolher a etapa mais relevante quando uma mensagem casa vários
// sinais. Perdido e convertido ganham de tudo (sinais explícitos de saída/fechamento).
function score(stage: SignalStage): number {
  if (stage === "perdido") return 100;
  if (stage === "convertido") return 90;
  return RANK[stage];
}

// Detecta a etapa mais forte sinalizada por UMA mensagem. null = nenhum sinal.
export function detectStageFromMessage(text: string | null | undefined, vertical?: string | null): SignalStage | null {
  if (!text) return null;
  const t = text.normalize("NFC");
  const signals = [...SIGNALS_BASE, ...(vertical && SIGNALS_BY_VERTICAL[vertical] ? SIGNALS_BY_VERTICAL[vertical] : [])];
  let best: SignalStage | null = null;
  let bestScore = -Infinity;
  for (const s of signals) {
    if (s.re.test(t) && score(s.stage) > bestScore) { bestScore = score(s.stage); best = s.stage; }
  }
  return best;
}

// Reproduz o classificador sobre o histórico (em ordem) e devolve a etapa final.
// Mesma lógica forward-only do tempo real. null = nenhum sinal (fica recebido/respondido).
export function stageFromHistory(texts: string[], vertical?: string | null): string | null {
  let cur: string | null = null;
  for (const t of texts) {
    const cand = detectStageFromMessage(t, vertical);
    if (!cand) continue;
    if (cur === "convertido") break; // terminal de topo
    if (cand === "perdido") cur = "perdido";
    else if (RANK[cand] > currentRank(cur)) cur = cand;
  }
  return cur;
}

// Backfill: classifica conversas JÁ existentes pelo histórico. Ignora as travadas
// manualmente (funnelManual). Idempotente — pode rodar quantas vezes quiser.
export async function backfillFunnelForConnection(connectionId: string, vertical?: string | null): Promise<{ scanned: number; updated: number }> {
  // Só leads de anúncio (Meta) entram no funil.
  const adIds = new Set(
    (await prisma.waLead.findMany({ where: { connectionId }, select: { contactId: true } })).map((l) => l.contactId),
  );
  const convs = (await prisma.waConversation.findMany({
    where: { connectionId, funnelManual: false },
    select: { contactId: true, funnelStage: true },
  })).filter((c) => adIds.has(c.contactId));
  if (convs.length === 0) return { scanned: 0, updated: 0 };

  const msgs = await prisma.waMessage.findMany({
    where: { connectionId },
    select: { contactId: true, text: true },
    orderBy: { timestamp: "asc" },
  });
  const byContact = new Map<string, string[]>();
  for (const m of msgs) {
    if (!m.text) continue;
    const arr = byContact.get(m.contactId) ?? [];
    arr.push(m.text);
    byContact.set(m.contactId, arr);
  }

  let updated = 0;
  for (const c of convs) {
    const texts = byContact.get(c.contactId);
    if (!texts || texts.length === 0) continue;
    const stage = stageFromHistory(texts, vertical);
    if (stage && stage !== c.funnelStage) {
      await prisma.waConversation.update({ where: { contactId: c.contactId }, data: { funnelStage: stage } });
      updated++;
    }
  }
  return { scanned: convs.length, updated };
}

// Aplica a classificação a partir de uma mensagem. Best-effort: nunca lança.
export async function applyFunnelFromMessage(opts: {
  connectionId: string; contactId: string; clientId: string; text: string | null;
}): Promise<void> {
  const { connectionId, contactId, clientId, text } = opts;
  try {
    const conv = await prisma.waConversation.findUnique({
      where: { contactId },
      select: { funnelStage: true, funnelManual: true },
    });
    if (!conv || conv.funnelManual) return;            // operador é dono → não toca
    if (conv.funnelStage === "convertido") return;     // terminal de topo

    // O funil trabalha SÓ com leads de anúncio (Meta). Orgânico não entra.
    const isAd = await prisma.waLead.findUnique({ where: { contactId }, select: { contactId: true } });
    if (!isAd) return;

    const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId }, select: { vertical: true } });
    const candidate = detectStageFromMessage(text, cfg?.vertical);
    if (!candidate) return;

    const cur = conv.funnelStage;
    let next: string | null = null;
    if (candidate === "perdido") {
      next = "perdido"; // saída explícita do lead (cur não é convertido — já barrado acima)
    } else if (RANK[candidate] > currentRank(cur)) {
      next = candidate; // forward-only
    }

    if (next && next !== cur) {
      await prisma.waConversation.update({ where: { contactId }, data: { funnelStage: next } });
      await logWaEvent(connectionId, "funnel.auto", contactId, { from: cur, to: next });
    }
  } catch {
    /* nunca derruba o webhook */
  }
}
