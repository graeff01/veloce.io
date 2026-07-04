import { prismaUnscoped } from "@/lib/prisma";
import { detectStageFromMessage, stageRank } from "@/lib/wa-funnel";
import { excludedTokens, nameExcluded } from "@/lib/notifications/client-bot";
import { logWaEvent } from "@/lib/wa-events";
import { costOf } from "@/lib/ai-agent/usage";
import { funnelStageFor, type AutoStage } from "@/lib/ai-agent/scoring";
import { classifyFunnelLLM, type FunnelVerdict, type FunnelWindowMsg } from "@/lib/ai-agent/funnel-llm";

// ── Motor-cérebro do funil (LLM-first + gate de confiança) e runner de SHADOW ───
// Uma ÚNICA decisão (decideStage) por onde todo avanço automático deve passar. Hoje
// só OBSERVA (grava FunnelShadow, sem tocar funnelStage). No flip (FUNNEL_LLM_MODE=
// active) a mesma decideStage vira a autoridade — sem reescrever a regra em dois lugares.
//
// Regras de ouro preservadas na decisão:
//   • avanço-only (nunca regride por sinal genérico);
//   • piso determinístico SEMPRE aplicado (Recebido/Respondido) — nunca fica sem etapa;
//   • convertido é só humano (a LLM nem pode emiti-lo);
//   • gate de confiança: só move (avanço OU perdido) se confiança ≥ threshold;
//   • trava manual e exclusão de donos: fora do escopo (o runner nem avalia).

export type FunnelMode = "off" | "shadow" | "active";
export function funnelMode(): FunnelMode {
  const m = (process.env.FUNNEL_LLM_MODE || "off").toLowerCase();
  return m === "shadow" || m === "active" ? m : "off";
}

const THRESHOLD = Number(process.env.FUNNEL_CONF_THRESHOLD || 80);
const WINDOW_N = Number(process.env.FUNNEL_WINDOW_N || 8);

export interface StageDecision {
  proposedStage: string | null;
  source: "llm" | "profile" | "floor" | "llm_failed";
  wouldChange: boolean;
  gatedByConf: boolean;   // a LLM propôs mover mas a confiança ficou abaixo do gate
  review: boolean;        // segurou por baixa confiança → revisão humana
  evidence: string | null;
}

// Decisão PURA (sem I/O) — a AUTORIDADE única do funil automático. Compõe, por
// avanço-only (o maior vence), três candidatos:
//   • piso determinístico (sempre aplicado) — nunca fica sem etapa;
//   • profileStage: sinal determinístico da IA de atendimento (slots extraídos) —
//     SEM gate (não é alucinação de LLM; é dado estruturado que o lead revelou);
//   • verdict da LLM: COM gate de confiança (proteção contra alucinação).
// convertido é sempre humano (nem a LLM nem o perfil o emitem). verdict=null →
// LLM falhou/timeout: decide só com piso + profileStage.
export function decideStage(opts: {
  currentStage: string | null;
  hasOutbound: boolean;
  verdict: FunnelVerdict | null;
  profileStage?: AutoStage | null;
  suppressAdvance?: boolean; // opener de anúncio (1ª msg-template) → só piso, não qualifica
  threshold?: number;
}): StageDecision {
  const thr = opts.threshold ?? THRESHOLD;
  const cur = opts.currentStage ?? null;

  // 1) Piso determinístico — SEMPRE garante etapa (nunca fica sem classificação).
  const floor = opts.hasOutbound ? "respondido" : "recebido";
  let proposed = cur;
  let source: StageDecision["source"] = opts.verdict ? "floor" : "llm_failed";
  // proposed nulo = "sem etapa" (rank -1 efetivo): o piso sempre aplica.
  if (!proposed || stageRank(floor) > stageRank(proposed)) proposed = floor;

  // Opener de anúncio: a 1ª msg é template ("tenho interesse no anúncio do X") — não
  // qualifica. Aplica só o piso e ignora perfil/LLM (o léxico já fazia via inboundCount).
  if (opts.suppressAdvance) {
    return { proposedStage: proposed, source, wouldChange: proposed !== cur, gatedByConf: false, review: false, evidence: null };
  }

  let gatedByConf = false;
  let evidence: string | null = null;

  // 2) Sinal determinístico do perfil (sem gate) — avanço-only.
  if (opts.profileStage && stageRank(opts.profileStage) > stageRank(proposed)) {
    proposed = opts.profileStage;
    source = "profile";
  }

  // 3) Sinal da LLM (com gate). convertido é impossível vindo da LLM (não está no enum).
  const v = opts.verdict;
  if (v && v.etapa !== "nenhum") {
    const confident = v.confianca >= thr;
    if (v.etapa === "perdido") {
      // Perdido é lateral (saída): também passa pelo gate (marcar perdido errado mata lead vivo).
      if (confident && cur !== "perdido") { proposed = "perdido"; source = "llm"; evidence = v.evidencia; }
      else if (!confident) gatedByConf = true;
    } else if (stageRank(v.etapa) > stageRank(proposed)) {
      // É um AVANÇO real além do piso/perfil/etapa atual.
      if (confident) { proposed = v.etapa; source = "llm"; evidence = v.evidencia; }
      else gatedByConf = true; // segurou: mantém a etapa proposta até aqui, marca revisão
    }
    // etapa da LLM ≤ proposto → concorda ou é regressão: avanço-only ignora (nunca rebaixa).
  }

  return {
    proposedStage: proposed,
    source,
    wouldChange: proposed !== cur,
    gatedByConf,
    review: gatedByConf,
    evidence,
  };
}

// O léxico (regex atual) teria disparado um AVANÇO aqui? Mede o miss do gatilho no shadow.
function lexiconWouldTrigger(window: FunnelWindowMsg[], currentStage: string | null, vertical?: string | null): boolean {
  for (const m of window) {
    if (m.direction === "out") continue;
    const cand = detectStageFromMessage(m.text, vertical, "in");
    if (!cand) continue;
    if (cand === "perdido") return true;
    if (stageRank(cand) > stageRank(currentStage)) return true;
  }
  return false;
}

// Escrita da etapa (autoridade). Só grava se houver avanço real e a guarda já
// tiver liberado. Preserva funnelEvidence quando não há frase nova. Registra o evento.
//
// Optimistic concurrency: grava com WHERE funnelStage = `from` (a etapa que lemos).
// Se outro escritor concorrente (runFunnelClassify / applyProfileStage / piso) já
// avançou nesse meio-tempo, o WHERE casa 0 linhas e a nossa escrita (potencialmente
// mais baixa) é descartada — nunca regride. É o que garante avanço-only sob corrida.
async function writeStage(connectionId: string, contactId: string, decision: StageDecision, from: string | null): Promise<void> {
  if (!decision.wouldChange || !decision.proposedStage) return;
  const res = await prismaUnscoped.waConversation.updateMany({
    where: { contactId, funnelStage: from },
    data: {
      funnelStage: decision.proposedStage,
      ...(decision.evidence ? { funnelEvidence: decision.evidence } : {}),
    },
  }).catch(() => ({ count: 0 }));
  if (res.count > 0) {
    await logWaEvent(connectionId, "funnel.auto", contactId, { from, to: decision.proposedStage, source: decision.source }).catch(() => {});
  }
}

// Motor do funil no webhook: classifica com CONTEXTO e, no modo `active`, GRAVA a etapa
// (autoridade). Em `shadow`, só observa (grava FunnelShadow, sem tocar funnelStage).
// Best-effort e fire-and-forget: nunca lança, nunca bloqueia o webhook.
export async function runFunnelClassify(opts: {
  connectionId: string; contactId: string; clientId: string; direction: "in" | "out";
}): Promise<void> {
  const { connectionId, contactId, clientId, direction } = opts;
  const mode = funnelMode();
  if (mode === "off") return;
  try {
    const conv = await prismaUnscoped.waConversation.findUnique({
      where: { contactId },
      select: { funnelStage: true, funnelManual: true, outboundCount: true },
    });
    if (!conv || conv.funnelManual) return;              // operador é dono → não avalia
    if (conv.funnelStage === "convertido") return;       // terminal de topo

    // Exclusão de donos (nameExcluded) — a regra de ouro que o léxico atual NÃO aplica.
    // isAd + contagem de inbound → detecta o opener de anúncio (1ª msg-template).
    const [contact, excl, cfg, isAd, inboundCount] = await Promise.all([
      prismaUnscoped.waContact.findUnique({ where: { id: contactId }, select: { name: true } }),
      excludedTokens(clientId),
      prismaUnscoped.aiAgentConfig.findFirst({ where: { clientId }, select: { vertical: true } }),
      prismaUnscoped.waLead.findUnique({ where: { contactId }, select: { contactId: true } }).then((l) => !!l),
      prismaUnscoped.waMessage.count({ where: { contactId, direction: "in" } }),
    ]);
    if (nameExcluded(contact?.name ?? null, excl)) return;

    // Janela das últimas N mensagens (contexto — a raiz do acerto).
    const recent = await prismaUnscoped.waMessage.findMany({
      where: { contactId },
      orderBy: { timestamp: "desc" },
      take: WINDOW_N,
      select: { text: true, direction: true },
    });
    const window: FunnelWindowMsg[] = [...recent].reverse();
    if (!window.some((m) => m.direction === "in" && m.text)) return; // nada do lead ainda

    const vertical = cfg?.vertical ?? null;
    const hasOutbound = direction === "out" || (conv.outboundCount ?? 0) > 0;
    const lexiconTriggered = lexiconWouldTrigger(window, conv.funnelStage, vertical);
    const suppressAdvance = isAd && direction === "in" && inboundCount <= 1; // opener de anúncio

    const verdict = await classifyFunnelLLM({ window, clientId, vertical, currentStage: conv.funnelStage });
    const decision = decideStage({ currentStage: conv.funnelStage, hasOutbound, verdict, suppressAdvance });

    // Log de auditoria (sempre — em shadow E active: mantém o histórico comparável).
    await prismaUnscoped.funnelShadow.create({
      data: {
        connectionId, contactId, clientId, direction,
        currentStage: conv.funnelStage ?? null,
        proposedStage: decision.proposedStage,
        llmStage: verdict?.etapa ?? null,
        confidence: verdict?.confianca ?? null,
        evidence: decision.evidence,
        signals: verdict ? (verdict.sinais as unknown as Record<string, boolean>) : undefined,
        source: decision.source,
        wouldChange: decision.wouldChange,
        gatedByConf: decision.gatedByConf,
        review: decision.review,
        lexiconTriggered,
        latencyMs: verdict?.latencyMs ?? null,
        tokensIn: verdict?.tokensIn ?? null,
        tokensOut: verdict?.tokensOut ?? null,
        costUsd: verdict ? costOf(verdict.model, verdict.tokensIn, verdict.tokensOut) : null,
        model: verdict?.model ?? null,
      },
    }).catch(() => {});

    // Flip: no modo `active`, a autoridade GRAVA a etapa (guardas já aplicadas acima).
    if (mode === "active") await writeStage(connectionId, contactId, decision, conv.funnelStage ?? null);
  } catch {
    /* nunca derruba o webhook */
  }
}

// Subordina o motor de PERFIL da IA (funnelStageFor) à autoridade única. Substitui a
// escrita direta em tools.ts/qualify-extract.ts. Aplica trava manual + convertido +
// exclusão de donos (guardas que a escrita direta NÃO fazia — bug de trava manual) e
// avança por avanço-only. Best-effort: nunca lança.
export async function applyProfileStage(opts: {
  connectionId: string; contactId: string; clientId: string; profileStage: AutoStage;
}): Promise<void> {
  const { connectionId, contactId, clientId, profileStage } = opts;
  try {
    const conv = await prismaUnscoped.waConversation.findUnique({
      where: { contactId },
      select: { funnelStage: true, funnelManual: true, outboundCount: true },
    });
    if (!conv || conv.funnelManual) return;          // trava manual (antes NÃO respeitada)
    if (conv.funnelStage === "convertido" || conv.funnelStage === "perdido") return; // terminal/humano

    const [contact, excl] = await Promise.all([
      prismaUnscoped.waContact.findUnique({ where: { id: contactId }, select: { name: true } }),
      excludedTokens(clientId),
    ]);
    if (nameExcluded(contact?.name ?? null, excl)) return;

    // Sem verdict de LLM (o perfil já é sinal determinístico): decide por piso + perfil.
    const hasOutbound = (conv.outboundCount ?? 0) > 0;
    const decision = decideStage({ currentStage: conv.funnelStage, hasOutbound, verdict: null, profileStage });
    await writeStage(connectionId, contactId, decision, conv.funnelStage ?? null);
  } catch {
    /* nunca derruba o atendimento */
  }
}

// ── Backfill: reclassifica conversas ABERTAS pelo motor novo (LLM + contexto) ────
// Pra que ao ligar o `active` o painel INTEIRO já apareça correto — não só os leads
// que mandarem msg depois. Reusa a autoridade única (classifyFunnelLLM → decideStage),
// então respeita todas as regras de ouro. Dry-run por padrão; só grava com apply=true.
export interface BackfillChange { contactId: string; name: string | null; from: string | null; to: string; confidence: number | null; evidence: string | null }
export async function backfillFunnelLLM(opts: {
  connectionId: string; apply: boolean; limit?: number;
}): Promise<{ scanned: number; changes: BackfillChange[]; applied: number; costUsd: number }> {
  const { connectionId, apply } = opts;
  const conn = await prismaUnscoped.waConnection.findUnique({ where: { id: connectionId }, select: { clientId: true } });
  if (!conn) return { scanned: 0, changes: [], applied: 0, costUsd: 0 };
  const clientId = conn.clientId;

  const [cfg, excl] = await Promise.all([
    prismaUnscoped.aiAgentConfig.findFirst({ where: { clientId }, select: { vertical: true } }),
    excludedTokens(clientId),
  ]);
  const vertical = cfg?.vertical ?? null;

  // Só não-manuais e não-terminais (convertido/perdido são do humano/higiene).
  const convs = await prismaUnscoped.waConversation.findMany({
    where: { connectionId, funnelManual: false, funnelStage: { notIn: ["convertido", "perdido"] } },
    orderBy: { lastMessageAt: "desc" },
    ...(opts.limit ? { take: opts.limit } : {}),
    select: { contactId: true, funnelStage: true, outboundCount: true, contact: { select: { name: true } } },
  });

  const changes: BackfillChange[] = [];
  let applied = 0;
  let costUsd = 0;

  // Sequencial de propósito: evita estourar o rate limit da LLM num lote grande.
  for (const c of convs) {
    if (nameExcluded(c.contact?.name ?? null, excl)) continue;
    const recent = await prismaUnscoped.waMessage.findMany({
      where: { contactId: c.contactId }, orderBy: { timestamp: "desc" }, take: WINDOW_N,
      select: { text: true, direction: true },
    });
    const window: FunnelWindowMsg[] = [...recent].reverse();
    if (!window.some((m) => m.direction === "in" && m.text)) continue;

    // Perfil determinístico (se houver) entra como candidato, igual ao modo active.
    const prof = await prismaUnscoped.leadProfile.findUnique({ where: { contactId: c.contactId } });
    const profileStage = prof ? funnelStageFor(prof) : null;

    const verdict = await classifyFunnelLLM({ window, clientId, vertical, currentStage: c.funnelStage });
    if (verdict) costUsd += costOf(verdict.model, verdict.tokensIn, verdict.tokensOut);
    const hasOutbound = (c.outboundCount ?? 0) > 0;
    const decision = decideStage({ currentStage: c.funnelStage, hasOutbound, verdict, profileStage });

    if (!decision.wouldChange) continue;
    changes.push({ contactId: c.contactId, name: c.contact?.name ?? null, from: c.funnelStage, to: decision.proposedStage!, confidence: verdict?.confianca ?? null, evidence: decision.evidence });
    if (apply) { await writeStage(connectionId, c.contactId, decision, c.funnelStage ?? null); applied++; }
  }

  return { scanned: convs.length, changes, applied, costUsd: Math.round(costUsd * 1e4) / 1e4 };
}
