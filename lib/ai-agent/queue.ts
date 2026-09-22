import { prisma } from "@/lib/prisma";
import { runAgentJob, type JobPayload } from "./respond";
import { createEscalationTask } from "./escalation";
import { consume, LIMITS } from "./security/quota";
import { emitSecurityEventAsync } from "./security/events";
import { securityMode } from "./security/policy";

// Fila DURÁVEL do agente (tabela AiJob). Garante "nenhum lead no vácuo" mesmo com
// deploy/restart no meio de uma rajada, e serializa por contato em multi-instância.
//
// Caminho rápido: o webhook enfileira e dispara um "nudge" em memória (baixa latência).
// Rede de segurança: o cron /api/cron/ai-agent chama processDueJobs periodicamente —
// se um deploy derrubar o nudge, o job persistido é processado no próximo tick.

const DEBOUNCE_MS = Number(process.env.AI_AGENT_DEBOUNCE_MS || 8000);          // base: espera 8s por novas msgs
const DEBOUNCE_FRAGMENT_MS = Number(process.env.AI_AGENT_DEBOUNCE_FRAG_MS || 25000); // msg parece incompleta: espera mais
const STALE_LOCK_MS = 2 * 60_000; // job "processing" preso há mais que isto é re-elegível
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = 30_000;

const nudges = new Map<string, ReturnType<typeof setTimeout>>();

// Detecta mensagem que provavelmente é um FRAGMENTO — o lead vai continuar digitando
// (ex.: "Eu moro", "No rio", "de onde"). Nesses casos esperamos mais antes de responder,
// pra não responder frase pela metade (o lead que escreve em partes é comum no WhatsApp).
const CONT_WORD = /(?:^|\s)(e|ou|de|do|da|dos|das|no|na|nos|nas|pra|para|que|com|em|meu|minha|se|mas|então|por|é|ta|tá|to|tô|um|uma|o|a|os|as|mais|só|sobre|tem|quero|queria|onde|quando|como|qual)$/i;
export function looksIncomplete(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  // Fragmento = termina em conjunção/preposição/verbo pendente ("Eu moro em", "quero").
  // NÃO usamos mais "curta = fragmento": no WhatsApp quase toda msg é curta e COMPLETA
  // ("Oi", "Porto Alegre", "Gourmet", "boa tarde") — tratá-las como fragmento fazia a IA
  // esperar o tempo de fragmento (12s) em TODA mensagem. Só 1-2 caracteres soltos ficam.
  if (CONT_WORD.test(t)) return true;    // termina em conjunção/preposição/pergunta pendente
  if (t.length <= 2) return true;        // "No", "de", "Eu" soltos → provável fragmento
  return false;                          // frase "fechada" → resposta normal
}
export function debounceFor(text: string): number {
  return looksIncomplete(text) ? DEBOUNCE_FRAGMENT_MS : DEBOUNCE_MS;
}

// Enfileira (ou reagenda) o atendimento de um contato. 1 linha por contato:
// rajadas de mensagens colapsam num único job (o orquestrador lê todo o histórico).
export async function enqueueAgentJob(job: {
  clientId: string;
  connectionId: string;
  contactId: string;
  idempotencyKey?: string;
  payload: JobPayload;
}): Promise<void> {
  // ── Segurança · Anel 0: admission control (C-02) ────────────────────────────
  // Teto de MENSAGENS por contato. A mensagem já está persistida em WaMessage — o
  // que fica de fora é o TURNO DE IA (o que custa). Ao estourar, o lead NÃO fica no
  // vácuo: vira tarefa de atendimento humano (fail-safe do RFC §P4).
  if (!(await admit("msg", job.clientId, job.contactId, LIMITS.inboundPerContact))) {
    await escalateThrottled(job.clientId, job.contactId, "volume de mensagens acima do normal");
    return;
  }

  const delay = debounceFor((job.payload as unknown as JobPayload)?.text ?? "");
  const runAfter = new Date(Date.now() + delay);
  // ⚠️ NÃO mexer em `status`/`lockedAt` aqui. Este update também acontece quando
  // JÁ EXISTE um turno em voo para este contato, e zerar a trava soltava um
  // SEGUNDO turno em paralelo sobre a mesma conversa.
  //
  // Caso real (Willian Ribeiro, 21/09/2026 09:52, produção): o lead mandou
  // "Fogão campeiro" e, 6s depois, "Queria saber os valores?". O bloco de 3
  // mensagens saiu DUAS VEZES, intercalado (49s, 52s, 54s, 55s, 56s, 58s) — e
  // só existe UMA linha em AiInteraction, porque o segundo turno colidiu na
  // chave de idempotência e foi descartado DEPOIS de já ter enviado. Mesmo
  // defeito na conversa do Henrique (3 blocos duplicados em 2,5s).
  //
  // Sem reset, um turno preso continua coberto: `claim` já reaproveita job
  // `processing` com `lockedAt` velho (STALE_LOCK_MS) e o catch do runner
  // devolve o job para `pending` com backoff.
  await prisma.aiJob.upsert({
    where: { contactId: job.contactId },
    create: {
      clientId: job.clientId, connectionId: job.connectionId, contactId: job.contactId,
      idempotencyKey: job.idempotencyKey ?? null, payload: job.payload as object,
      status: "pending", runAfter,
    },
    update: {
      idempotencyKey: job.idempotencyKey ?? null, payload: job.payload as object,
      attempts: 0, lastError: null, runAfter,
    },
  });

  // Nudge em memória: processa logo após o debounce (latência baixa no caminho feliz).
  agendarNudge(job.contactId, delay);
}

/** Agenda (ou reagenda) o processamento em memória. Um timer por contato. */
function agendarNudge(contactId: string, delay: number): void {
  const existing = nudges.get(contactId);
  if (existing) clearTimeout(existing);
  nudges.set(contactId, setTimeout(() => {
    nudges.delete(contactId);
    void runOneContact(contactId).catch(() => {});
  }, Math.max(0, delay) + 250));
}

/**
 * Solta a trava de um job que ganhou mensagem NOVA durante o turno e agenda o
 * reprocessamento para quando vencer o debounce dessa mensagem.
 *
 * Só mexe em linha `processing`: se outro worker já assumiu, não interfere.
 */
async function liberarEReagendar(contactId: string): Promise<void> {
  const job = await prisma.aiJob.findUnique({ where: { contactId }, select: { runAfter: true, status: true } }).catch(() => null);
  if (!job) return;
  const soltou = await prisma.aiJob.updateMany({
    where: { contactId, status: "processing" },
    data: { status: "pending", lockedAt: null },
  }).catch(() => ({ count: 0 }));
  if (soltou.count === 0) return;
  agendarNudge(contactId, job.runAfter.getTime() - Date.now());
}

// ── Segurança · admissão ──────────────────────────────────────────────────────
// Consome a cota e devolve se pode seguir. Em shadow apenas registra (sempre admite).
// FAIL-OPEN: erro no controle nunca barra atendimento.
async function admit(
  kind: "msg" | "turn",
  clientId: string,
  key: string,
  limit: { limit: number; windowMs: number },
): Promise<boolean> {
  try {
    const d = await consume(`agent:${kind}`, key, limit.limit, limit.windowMs);
    if (d.allowed) return true;
    const enforce = securityMode() === "enforce";
    emitSecurityEventAsync({
      clientId, contactId: kind === "msg" || kind === "turn" ? key : null,
      ring: "admission", control: "C-02", severity: "high",
      action: enforce ? "blocked" : "observed",
      labels: [`quota:${kind}`, `count:${d.count}/${d.limit}`, ...(d.degraded ? ["degraded"] : [])],
      evidence: `${kind} acima do teto (${d.count}/${d.limit} na janela)`,
      shadow: !enforce,
    });
    return !enforce;
  } catch {
    return true;
  }
}

// Tarefa de atendimento humano quando a cota corta a IA — no máximo 1 por hora
// por contato (a própria cota serve de dedupe).
async function escalateThrottled(clientId: string, contactId: string, reason: string): Promise<void> {
  try {
    const once = await consume("agent:abuse-task", contactId, 1, 3_600_000);
    if (!once.allowed) return;
    const contact = await prisma.waContact.findUnique({ where: { id: contactId }, select: { name: true, waId: true } });
    if (!contact) return;
    await createEscalationTask({
      clientId, contactId, contactName: contact.name, waId: contact.waId,
      reason: `A IA foi pausada neste contato por proteção (${reason}). Atenda manualmente.`,
      kind: "failure",
    });
  } catch { /* nunca propaga */ }
}

// Claim atômico de um job específico: vence quem conseguir marcar processing.
async function claim(contactId: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const res = await prisma.aiJob.updateMany({
    where: {
      contactId,
      runAfter: { lte: new Date() },
      OR: [{ status: "pending" }, { status: "processing", lockedAt: { lt: staleBefore } }],
    },
    data: { status: "processing", lockedAt: new Date() },
  });
  return res.count === 1;
}

async function runOneContact(contactId: string): Promise<void> {
  if (!(await claim(contactId))) return; // outro worker pegou, ou ainda não venceu o debounce
  const job = await prisma.aiJob.findUnique({ where: { contactId } });
  if (!job) return;

  // Cota de TURNOS de IA (o que efetivamente custa) — por contato e por cliente.
  // Estourou: descarta o job (não fica reciclando) e joga para o humano.
  const okContact = await admit("turn", job.clientId, contactId, LIMITS.agentTurnsPerContactHour);
  const okClient = await admit("turn", job.clientId, job.clientId, LIMITS.agentTurnsPerClientHour);
  if (!okContact || !okClient) {
    await prisma.aiJob.delete({ where: { contactId } }).catch(() => {});
    await escalateThrottled(job.clientId, contactId, okContact ? "volume do cliente acima do teto" : "muitos turnos de IA neste contato");
    return;
  }

  try {
    const outcome = await runAgentJob({
      clientId: job.clientId, connectionId: job.connectionId, contactId: job.contactId,
      idempotencyKey: job.idempotencyKey ?? undefined, payload: (job.payload as unknown as JobPayload) ?? { type: "text" },
    });
    if (outcome === "error") throw new Error("runner retornou erro");
    // Apaga só o job QUE FOI PROCESSADO. Se o lead escreveu durante o turno, o
    // enqueue reescreveu a linha com a chave da mensagem nova — e o delete cego
    // apagava essa mensagem junto, sem nunca respondê-la.
    //
    // Caso real (Willian, 21/09 09:52:48): "Queria saber os valores?" chegou com
    // o turno anterior em voo, não gerou nenhum AiInteraction e nunca foi
    // respondida. O lead pediu preço e recebeu a mensagem anterior duplicada.
    const apagados = await prisma.aiJob.deleteMany({ where: { contactId, idempotencyKey: job.idempotencyKey } });
    if (apagados.count === 0) {
      // Chegou mensagem nova durante o turno: solta a trava e reprocessa quando
      // vencer o debounce dela. Sem isto, o job ficaria `processing` até o
      // STALE_LOCK_MS (2 min) e o lead esperaria por nada.
      await liberarEReagendar(contactId);
    }
  } catch (e) {
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      // Desiste após N tentativas: garante que o lead não fica no vácuo silencioso —
      // cria uma Task de falha (prioridade alta) e avisa o operador.
      const contact = await prisma.waContact.findUnique({ where: { id: contactId }, select: { name: true, waId: true } }).catch(() => null);
      if (contact) {
        await createEscalationTask({
          clientId: job.clientId, contactId, contactName: contact.name, waId: contact.waId,
          reason: `A IA tentou responder ${MAX_ATTEMPTS}x e não conseguiu (${job.lastError ?? "erro"}). Atenda manualmente.`,
          kind: "failure",
        }).catch(() => {});
      }
      await prisma.aiJob.delete({ where: { contactId } }).catch(() => {});
      return;
    }
    await prisma.aiJob.update({
      where: { contactId },
      data: { status: "pending", attempts, lockedAt: null, lastError: String(e).slice(0, 500), runAfter: new Date(Date.now() + BACKOFF_MS * attempts) },
    }).catch(() => {});
  }
}

// Worker do cron: processa todos os jobs vencidos (rede de segurança pós-deploy).
export async function processDueJobs(limit = 25): Promise<{ processed: number }> {
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS);
  const due = await prisma.aiJob.findMany({
    where: {
      runAfter: { lte: new Date() },
      OR: [{ status: "pending" }, { status: "processing", lockedAt: { lt: staleBefore } }],
    },
    orderBy: { runAfter: "asc" }, take: limit, select: { contactId: true },
  });
  let processed = 0;
  for (const j of due) { await runOneContact(j.contactId); processed++; }
  return { processed };
}
