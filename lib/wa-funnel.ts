import { prisma } from "@/lib/prisma";
import { logWaEvent } from "@/lib/wa-events";
import { groqChat, extractJson } from "@/lib/groq";

// ── Auto-classificação do funil (determinística + reforço semântico opcional) ──
// Roda no webhook a cada mensagem. Princípios anti-erro:
//   • PISO determinístico: todo lead tem etapa real (Recebido/Respondido por fato).
//   • forward-only: só avança (nunca rebaixa por mensagem genérica);
//   • convertido/perdido exigem frase forte (alta precisão);
//   • trava manual: se o operador editou a etapa, o auto não toca;
//   • cobre TODOS os leads (anúncio E orgânico);
//   • evidência: guarda a frase que justificou a etapa (auditável);
//   • Groq (free tier) só entra no AMBÍGUO (léxico não achou) — sem custo no volume.

export type FunnelStage = "recebido" | "respondido" | "qualificado" | "negociacao" | "convertido" | "perdido";

const RANK: Record<string, number> = { recebido: 0, respondido: 1, qualificado: 2, negociacao: 3, convertido: 4 };

function currentRank(stage: string | null | undefined): number {
  if (!stage || stage === "perdido") return 0;
  return RANK[stage] ?? 0;
}

// Rank de avanço-only, reutilizável (mesma verdade do léxico). "perdido" é lateral
// (rank 0): não conta como avanço; é tratado à parte por quem chama.
export function stageRank(stage: string | null | undefined): number {
  return currentRank(stage);
}

// Piso a partir de fatos da conversa: respondeu? → Respondido; senão Recebido.
// Funde com o sinal: a etapa final é a MAIOR entre sinal e piso.
function mergeFloor(signalStage: string | null, hasOutbound: boolean): string | null {
  if (signalStage === "perdido") return "perdido";
  const floor = hasOutbound ? "respondido" : "recebido";
  const sigRank = signalStage ? RANK[signalStage] ?? -1 : -1;
  return sigRank >= RANK[floor] ? signalStage : floor;
}

type SignalStage = "qualificado" | "negociacao" | "convertido" | "perdido";
type Who = "lead" | "store" | "any";
interface Signal { stage: SignalStage; re: RegExp; who: Who }

const SIGNALS_BASE: Signal[] = [
  // Perdido — o LEAD declara saída/compra em outro.
  { stage: "perdido", who: "lead", re: /(n[ãa]o tenho (mais )?interesse|desisti|j[áa] comprei|comprei (em |n)outro|fechei com outr|encontrei outr|n[ãa]o quero mais|deixa pra l[áa]|n[ãa]o vou (querer|levar))/i },
  // CONVERTIDO é MANUAL — o automático NÃO marca venda (alta acurácia + base do CAPI).
  // Só vira "convertido" quando alguém (cliente/time) marca como vendido. O automático
  // avança no máximo até Negociação.
  // Negociação — LEAD negociando o negócio (preço/condição/compromisso de pagamento).
  { stage: "negociacao", who: "lead", re: /(aceita (a )?troca|dou (na |de )?troca|troco (o |meu|na)|troca no meu|\bna troca\b|aceita meu (carro|ve[íi]culo|im[óo]vel)|tenho .{0,20}(pra|para) (dar na )?troca|\bdesconto\b|abaixa (o |um )?(pre[çc]o|valor|pouco)|faz por (r\$|\d|quanto|menos)|consegue (fazer )?por (r\$|\d|menos)|qual o m[íi]nimo|melhor (pre[çc]o|valor)|[úu]ltimo (pre[çc]o|valor)|quero financiar|vou financiar|quero parcelar|vou parcelar|parcelar em \d|financiar em \d|(r\$ ?)?\d[\d.,]* ?(mil )?de entrada|de entrada de (r\$|\d)|dar (de |o )?entrada|dar (o )?sinal|fazer (uma )?proposta|podemos? fechar|vamos fechar|pode fechar|quero fechar|vou fechar|vou comprar|vou levar\b|quero levar|vou ficar com|quero ficar com|pode (reservar|separar)|quero (esse|essa)\b)/i },
  // Qualificado — interesse concreto do LEAD: preço, specs, estado, fotos, condição
  // de pagamento, visita/agendamento, disponibilidade, localização.
  { stage: "qualificado", who: "lead", re: /(qual (o |a |seu )?(valor|pre[çc]o|ano|km|quilometragem|cor|bairro|metragem)|quanto (custa|fica|sai|\bé\b)|qual (é )?o (valor|pre[çc]o)|condi[çc][õo]es? do (carro|ve[íi]culo|im[óo]vel)|estado do (carro|ve[íi]culo|im[óo]vel)|tem (algum )?(problema|sinistro|batid|d[ée]bito|multa)|tem garantia|tem (foto|v[íi]deo)|(manda|mandar|envia|enviar|me manda|pode mandar) .{0,14}(foto|v[íi]deo)|(ainda |voc[êe]s )?tem(em)? (em estoque|dispon[íi]vel|esse|essa|a[íi])|ainda (tem|est[áa] dispon[íi]vel)|aceita (pix|cart[ãa]o|d[ée]bito|financiamento)|tem financiamento|trabalha(m)? com financiamento|tem como (parcelar|financiar)|qual (a |o )?entrada|tem entrada|em quantas (vezes|parcelas)|quantas parcelas|quantos quartos|\bvaga\b|\bsu[íi]te|condom[íi]nio|\bfgts\b|agendar (uma )?(visita|hor[áa]rio)|marcar (uma )?(visita|hor[áa]rio)|quero (visitar|agendar|ver o|ver a|saber mais)|posso (ir|passar|visitar)|test[ -]?drive|onde (fica|[ée]|voc[êe]s)|qual (o )?endere[çc]o|gostei|mais (informa[çc][õo]es|detalhes))/i },
];

function score(stage: SignalStage): number {
  if (stage === "perdido") return 100;
  if (stage === "convertido") return 90;
  return RANK[stage];
}

export function detectStageFromMessage(text: string | null | undefined, vertical?: string | null, direction?: "in" | "out"): SignalStage | null {
  if (!text) return null;
  const t = text.normalize("NFC");
  const who: Who = direction === "out" ? "store" : "lead";
  let best: SignalStage | null = null;
  let bestScore = -Infinity;
  for (const s of SIGNALS_BASE) {
    if (s.who !== "any" && s.who !== who) continue;
    if (s.re.test(t) && score(s.stage) > bestScore) { bestScore = score(s.stage); best = s.stage; }
  }
  return best;
}

// Reforço semântico (Groq free tier) — SÓ pro ambíguo (léxico não achou). Best-effort:
// sem chave / erro / baixa confiança → null (cai no determinístico). Sem custo no volume.
async function semanticStage(text: string | null | undefined): Promise<SignalStage | null> {
  if (!process.env.GROQ_API_KEY || !text || text.trim().length < 3) return null;
  try {
    const sys =
      "Você classifica a INTENÇÃO de UMA mensagem de um lead no WhatsApp para um funil de vendas. " +
      "Etapas válidas: qualificado (mostrou interesse concreto: preço, specs, disponibilidade, visita, condição de pagamento), " +
      "negociacao (negocia preço/condição ou compromisso de pagamento/proposta), " +
      "convertido (confirma compra/fechamento/pagamento), perdido (declara desistência/sem interesse), nenhum. " +
      "Só classifique com EVIDÊNCIA explícita na frase. Na dúvida, 'nenhum'.";
    const user = `Mensagem do lead: "${text.slice(0, 400)}"\nResponda só JSON: {"stage":"qualificado|negociacao|convertido|perdido|nenhum","confidence":0..1}`;
    const raw = await groqChat(sys, user, 120);
    const j = extractJson<{ stage: string; confidence: number }>(raw);
    if (!j || (j.confidence ?? 0) < 0.7) return null;
    const allowed: SignalStage[] = ["qualificado", "negociacao", "convertido", "perdido"];
    return (allowed as string[]).includes(j.stage) ? (j.stage as SignalStage) : null;
  } catch {
    return null;
  }
}

// Replay do histórico → etapa final (com piso determinístico). isAd controla o
// "opener" (1ª msg do lead de anúncio = template, não qualifica).
export function stageFromHistory(msgs: { text: string | null; direction: string }[], vertical?: string | null, isAd = false): string | null {
  let cur: string | null = null;
  let firstInboundSeen = false;
  let hasOutbound = false;
  for (const m of msgs) {
    if (m.direction === "out") hasOutbound = true;
    const isOpener = m.direction !== "out" && !firstInboundSeen;
    if (m.direction !== "out") firstInboundSeen = true;
    const cand = detectStageFromMessage(m.text, vertical, m.direction === "out" ? "out" : "in");
    if (!cand) continue;
    if (isAd && isOpener && (cand === "qualificado" || cand === "negociacao")) continue;
    if (cur === "convertido") break;
    if (cand === "perdido") cur = "perdido";
    else if (RANK[cand] > currentRank(cur)) cur = cand;
  }
  return mergeFloor(cur, hasOutbound);
}

// Frase que justificou a etapa (última mensagem que disparou o sinal final).
function findEvidence(msgs: { text: string | null; direction: string }[], stage: string | null, vertical?: string | null): string | null {
  if (!stage || stage === "recebido" || stage === "respondido") return null;
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i];
    const cand = detectStageFromMessage(m.text, vertical, m.direction === "out" ? "out" : "in");
    if (cand === stage && m.text) return m.text.slice(0, 160);
  }
  return null;
}

export function explainHistory(msgs: { text: string | null; direction: string }[], vertical?: string | null, isAd = false): { final: string | null; perMsg: (string | null)[] } {
  let cur: string | null = null;
  let firstInboundSeen = false;
  let hasOutbound = false;
  const perMsg: (string | null)[] = [];
  for (const m of msgs) {
    if (m.direction === "out") hasOutbound = true;
    const isOpener = m.direction !== "out" && !firstInboundSeen;
    if (m.direction !== "out") firstInboundSeen = true;
    let cand = detectStageFromMessage(m.text, vertical, m.direction === "out" ? "out" : "in");
    if (cand && isAd && isOpener && (cand === "qualificado" || cand === "negociacao")) cand = null;
    let contributed: string | null = null;
    if (cand) {
      if (cur === "convertido") { /* terminal */ }
      else if (cand === "perdido") { if (cur !== "perdido") contributed = "perdido"; cur = "perdido"; }
      else if (RANK[cand] > currentRank(cur)) { cur = cand; contributed = cand; }
    }
    perMsg.push(contributed);
  }
  return { final: mergeFloor(cur, hasOutbound), perMsg };
}

// Backfill: reclassifica TODAS as conversas (anúncio E orgânico) pelo histórico.
// Idempotente. Ignora as travadas manualmente.
export async function backfillFunnelForConnection(connectionId: string, vertical?: string | null): Promise<{ scanned: number; updated: number }> {
  const adIds = new Set(
    (await prisma.waLead.findMany({ where: { connectionId }, select: { contactId: true } })).map((l) => l.contactId),
  );
  const convs = await prisma.waConversation.findMany({
    where: { connectionId, funnelManual: false },
    select: { contactId: true, funnelStage: true },
  });
  if (convs.length === 0) return { scanned: 0, updated: 0 };

  const msgs = await prisma.waMessage.findMany({
    where: { connectionId },
    select: { contactId: true, text: true, direction: true },
    orderBy: { timestamp: "asc" },
  });
  const byContact = new Map<string, { text: string | null; direction: string }[]>();
  for (const m of msgs) {
    const arr = byContact.get(m.contactId) ?? [];
    arr.push({ text: m.text, direction: m.direction });
    byContact.set(m.contactId, arr);
  }

  let updated = 0;
  for (const c of convs) {
    const hist = byContact.get(c.contactId);
    if (!hist || hist.length === 0) continue;
    const isAd = adIds.has(c.contactId);
    const stage = stageFromHistory(hist, vertical, isAd);
    if (stage !== c.funnelStage) {
      await prisma.waConversation.update({
        where: { contactId: c.contactId },
        data: { funnelStage: stage, funnelEvidence: findEvidence(hist, stage, vertical) },
      });
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
      select: { funnelStage: true, funnelManual: true, outboundCount: true },
    });
    if (!conv || conv.funnelManual) return;            // operador é dono → não toca
    if (conv.funnelStage === "convertido") return;     // terminal de topo

    const isAd = !!(await prisma.waLead.findUnique({ where: { contactId }, select: { contactId: true } }));
    const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId }, select: { vertical: true } });

    // 1) Piso determinístico: garante Respondido quando a loja respondeu.
    const hasOutbound = direction === "out" || (conv.outboundCount ?? 0) > 0;
    const floor = hasOutbound ? "respondido" : "recebido";
    if (RANK[floor] > currentRank(conv.funnelStage)) {
      await prisma.waConversation.update({ where: { contactId }, data: { funnelStage: floor } });
      conv.funnelStage = floor;
    }

    // Flip (FUNNEL_LLM_MODE=active): a autoridade dos AVANÇOS é a LLM-first
    // (runFunnelClassify). Aqui o léxico fica só no piso — não avança nem chama Groq.
    if ((process.env.FUNNEL_LLM_MODE || "").toLowerCase() === "active") return;

    // 2) Sinal de avanço — léxico primeiro.
    let candidate = detectStageFromMessage(text, cfg?.vertical, direction);

    // Opener do anúncio (1ª msg do lead) = template → não qualifica. Só pra lead de anúncio.
    if (isAd && direction === "in" && (candidate === "qualificado" || candidate === "negociacao")) {
      const inboundCount = await prisma.waMessage.count({ where: { contactId, direction: "in" } });
      if (inboundCount <= 1) candidate = null;
    }

    // 3) Ambíguo (léxico não achou) numa mensagem do lead → reforço semântico (Groq free).
    if (!candidate && direction === "in" && text && text.trim().length >= 3) {
      candidate = await semanticStage(text);
    }
    if (!candidate) return;

    const cur = conv.funnelStage;
    let next: string | null = null;
    if (candidate === "perdido") next = "perdido";
    else if (RANK[candidate] > currentRank(cur)) next = candidate;

    if (next && next !== cur) {
      await prisma.waConversation.update({
        where: { contactId },
        data: { funnelStage: next, funnelEvidence: direction === "in" && text ? text.slice(0, 160) : undefined },
      });
      await logWaEvent(connectionId, "funnel.auto", contactId, { from: cur, to: next });
    }
  } catch {
    /* nunca derruba o webhook */
  }
}
