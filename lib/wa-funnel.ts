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
type Who = "lead" | "store" | "any"; // quem precisa ter dito a frase
interface Signal { stage: SignalStage; re: RegExp; who: Who }

// Sinais base. CONVERTIDO é ciente de quem falou — a loja NUNCA converte por
// "fechado/combinado" (isso é marcar visita), só com confirmação de venda real.
const SIGNALS_BASE: Signal[] = [
  // Perdido: o LEAD declara que saiu / já comprou. (A loja não "perde" por texto.)
  { stage: "perdido", who: "lead", re: /(n[ãa]o tenho (mais )?interesse|desisti|j[áa] comprei|comprei (em |n)outro|n[ãa]o quero mais|deixa pra l[áa]|n[ãa]o vou (querer|levar))/i },
  // Convertido — só o LEAD declara compra (intenção/ação explícita). "fechar/fechamos"
  // SÓ junto de negócio/compra; nunca "fechado/tá fechado" isolado (= combinado).
  { stage: "convertido", who: "lead", re: /(vou comprar|vou levar\b|\bcomprei\b|quero fechar|fech(ei|amos|ar) (o |a )?(neg[óo]cio|negocio|compra)|neg[óo]cio fechado)/i },
  // Convertido — LOJA só com confirmação INEQUÍVOCA de venda.
  { stage: "convertido", who: "store", re: /(parab[ée]ns pela compra|(venda|compra) (confirmada|fechada)|pode (emitir|faturar))/i },
  // Negociação — SÓ conversa de DINHEIRO/negócio do LEAD: pagamento (financiamento/
  // parcela/entrada-de-pagamento/à vista), troca DO CARRO, ou barganha (desconto/
  // melhor preço). NÃO inclui "condições" (= estado do carro), "entrada" solta
  // (= horário/porta) nem "troca" solta (= troca de óleo). Visita é qualificado.
  { stage: "negociacao", who: "lead", re: /(financiamento|financiar|\bfinancia\b|parcela(s|r|do|mento)?|em quantas vezes|quantas parcelas|dar (de )?entrada|valor de entrada|quanto (de |fica de )?entrada|sem entrada|entrada de (r\$|\d)|[àa] vista|aceita (a )?troca|dou (na |de )?troca|troco (o |meu|na)|troca no meu|aceita meu (carro|ve[íi]culo)|\bdesconto\b|abaixa|faz por|consegue por|qual o m[íi]nimo|melhor (pre[çc]o|valor)|[úu]ltimo (pre[çc]o|valor))/i },
  // Qualificado — interesse CONCRETO no carro pelo LEAD: preço, specs, ESTADO/
  // condição, fotos, ou pedido de visita. NÃO inclui template de anúncio.
  { stage: "qualificado", who: "lead", re: /(qual (o |a |seu )?(valor|pre[çc]o|ano|km|quilometragem|cor)|quanto (custa|fica|sai|\bé\b)|qual (é )?o (valor|pre[çc]o)|condi[çc][õo]es? do (carro|ve[íi]culo)|condi[çc][ãa]o do (carro|ve[íi]culo)|em (bom|boas) (estado|condi[çc][õo]es)|estado do (carro|ve[íi]culo)|tem (algum )?(problema|sinistro|batid|d[ée]bito|multa|le[íi]l[ãa]o)|\b[ée] de leil[ãa]o|tem garantia|tem (foto|v[íi]deo)|(manda|mandar|envia|enviar|me manda|pode mandar) .{0,14}(foto|v[íi]deo)|tem em estoque|aceita (pix|cart[ãa]o|d[ée]bito)|agendar (uma )?visita|marcar (uma )?(visita|hor[áa]rio)|quero (visitar|agendar|ver o)|posso (ir|passar|visitar)|test[ -]?drive)/i },
];

// Reforços por vertical (opcionais — a base já cobre bem). Também só do LEAD.
const SIGNALS_BY_VERTICAL: Record<string, Signal[]> = {
  imobiliario: [
    { stage: "negociacao", who: "lead", re: /(\bfgts\b|financiamento|documenta[çc][ãa]o|escritura|\bsinal\b|parcela)/i },
    { stage: "qualificado", who: "lead", re: /(quantos quartos|metragem|qual o bairro|condom[íi]nio|\bvaga\b|\bsu[íi]te|quero (agendar|visitar)|posso visitar|visitar (o |a )?(im[óo]vel|apto|apartamento|casa))/i },
  ],
};

// "Força" para escolher a etapa mais relevante quando uma mensagem casa vários
// sinais. Perdido e convertido ganham de tudo (sinais explícitos de saída/fechamento).
function score(stage: SignalStage): number {
  if (stage === "perdido") return 100;
  if (stage === "convertido") return 90;
  return RANK[stage];
}

// Detecta a etapa sinalizada por UMA mensagem, considerando quem falou
// (direction "in" = lead, "out" = loja). null = nenhum sinal.
export function detectStageFromMessage(text: string | null | undefined, vertical?: string | null, direction?: "in" | "out"): SignalStage | null {
  if (!text) return null;
  const t = text.normalize("NFC");
  const who: Who = direction === "out" ? "store" : "lead";
  const signals = [...SIGNALS_BASE, ...(vertical && SIGNALS_BY_VERTICAL[vertical] ? SIGNALS_BY_VERTICAL[vertical] : [])];
  let best: SignalStage | null = null;
  let bestScore = -Infinity;
  for (const s of signals) {
    if (s.who !== "any" && s.who !== who) continue;
    if (s.re.test(t) && score(s.stage) > bestScore) { bestScore = score(s.stage); best = s.stage; }
  }
  return best;
}

// Reproduz o classificador sobre o histórico (em ordem, com a direção de cada
// mensagem) e devolve a etapa final. Mesma lógica forward-only do tempo real.
export function stageFromHistory(msgs: { text: string | null; direction: string }[], vertical?: string | null): string | null {
  let cur: string | null = null;
  let firstInboundSeen = false;
  for (const m of msgs) {
    const isOpener = m.direction !== "out" && !firstInboundSeen; // 1ª msg do lead = template do anúncio
    if (m.direction !== "out") firstInboundSeen = true;
    const cand = detectStageFromMessage(m.text, vertical, m.direction === "out" ? "out" : "in");
    if (!cand) continue;
    // O opener do anúncio (template automático) NUNCA qualifica/negocia. Só conta
    // engajamento real (mensagem seguinte do lead). Compra/perda ainda valem.
    if (isOpener && (cand === "qualificado" || cand === "negociacao")) continue;
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
    select: { contactId: true, text: true, direction: true },
    orderBy: { timestamp: "asc" },
  });
  const byContact = new Map<string, { text: string | null; direction: string }[]>();
  for (const m of msgs) {
    if (!m.text) continue;
    const arr = byContact.get(m.contactId) ?? [];
    arr.push({ text: m.text, direction: m.direction });
    byContact.set(m.contactId, arr);
  }

  let updated = 0;
  for (const c of convs) {
    const hist = byContact.get(c.contactId);
    if (!hist || hist.length === 0) continue;
    // Re-sincroniza: recomputa do histórico e grava o resultado, inclusive
    // CORRIGINDO para baixo ou limpando (null) — só em conversas não-travadas.
    // Assim "Recalcular histórico" conserta falsos-positivos antigos.
    const stage = stageFromHistory(hist, vertical);
    if (stage !== c.funnelStage) {
      await prisma.waConversation.update({ where: { contactId: c.contactId }, data: { funnelStage: stage } });
      updated++;
    }
  }
  return { scanned: convs.length, updated };
}

// Aplica a classificação a partir de uma mensagem. Best-effort: nunca lança.
export async function applyFunnelFromMessage(opts: {
  connectionId: string; contactId: string; clientId: string; text: string | null; direction: "in" | "out";
}): Promise<void> {
  const { connectionId, contactId, clientId, text, direction } = opts;
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
    const candidate = detectStageFromMessage(text, cfg?.vertical, direction);
    if (!candidate) return;

    // O opener do anúncio (1ª mensagem do lead) é template automático e NÃO
    // qualifica/negocia. Só conta a partir da 2ª mensagem do lead (engajamento real).
    if (direction === "in" && (candidate === "qualificado" || candidate === "negociacao")) {
      const inboundCount = await prisma.waMessage.count({ where: { contactId, direction: "in" } });
      if (inboundCount <= 1) return;
    }

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
