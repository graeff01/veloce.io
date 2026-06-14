import { prisma } from "@/lib/prisma";
import { runAgentJob, type JobPayload } from "./respond";
import { createEscalationTask } from "./escalation";

// Fila DURÁVEL do agente (tabela AiJob). Garante "nenhum lead no vácuo" mesmo com
// deploy/restart no meio de uma rajada, e serializa por contato em multi-instância.
//
// Caminho rápido: o webhook enfileira e dispara um "nudge" em memória (baixa latência).
// Rede de segurança: o cron /api/cron/ai-agent chama processDueJobs periodicamente —
// se um deploy derrubar o nudge, o job persistido é processado no próximo tick.

const DEBOUNCE_MS = Number(process.env.AI_AGENT_DEBOUNCE_MS || 6000);
const STALE_LOCK_MS = 2 * 60_000; // job "processing" preso há mais que isto é re-elegível
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = 30_000;

const nudges = new Map<string, ReturnType<typeof setTimeout>>();

// Enfileira (ou reagenda) o atendimento de um contato. 1 linha por contato:
// rajadas de mensagens colapsam num único job (o orquestrador lê todo o histórico).
export async function enqueueAgentJob(job: {
  clientId: string;
  connectionId: string;
  contactId: string;
  idempotencyKey?: string;
  payload: JobPayload;
}): Promise<void> {
  const runAfter = new Date(Date.now() + DEBOUNCE_MS);
  await prisma.aiJob.upsert({
    where: { contactId: job.contactId },
    create: {
      clientId: job.clientId, connectionId: job.connectionId, contactId: job.contactId,
      idempotencyKey: job.idempotencyKey ?? null, payload: job.payload as object,
      status: "pending", runAfter,
    },
    update: {
      idempotencyKey: job.idempotencyKey ?? null, payload: job.payload as object,
      status: "pending", attempts: 0, lockedAt: null, lastError: null, runAfter,
    },
  });

  // Nudge em memória: processa logo após o debounce (latência baixa no caminho feliz).
  const existing = nudges.get(job.contactId);
  if (existing) clearTimeout(existing);
  nudges.set(job.contactId, setTimeout(() => {
    nudges.delete(job.contactId);
    void runOneContact(job.contactId).catch(() => {});
  }, DEBOUNCE_MS + 250));
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
  try {
    const outcome = await runAgentJob({
      clientId: job.clientId, connectionId: job.connectionId, contactId: job.contactId,
      idempotencyKey: job.idempotencyKey ?? undefined, payload: (job.payload as unknown as JobPayload) ?? { type: "text" },
    });
    if (outcome === "error") throw new Error("runner retornou erro");
    await prisma.aiJob.delete({ where: { contactId } }).catch(() => {});
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
