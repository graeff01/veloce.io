// ── Fila durável de mensagens recebidas (F0) ─────────────────────────────────
// Dedupe/idempotência + replay que SOBREVIVEM a reinício. O debounce em memória
// (scheduler) agrupa rajadas, mas some quando a instância cai — então uma mensagem
// em processamento num deploy/crash poderia ser respondida duas vezes ou perdida.
//
// Fluxo:
//   1) webhook chama enqueueInbound() → grava a mensagem como "received" (com payload).
//   2) caminho ao vivo chama claimInbound() → received/failed → "processing".
//   3) worker (drainInbound) varre o que ficou pra trás (received/failed/travado) e
//      reprocessa a partir do payload. markInboundDone/Failed fecham o ciclo.
//
// Filosofia: NUNCA deixar o lead no vácuo. Só pula quando tem certeza (processing/done).

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type ClaimResult = "claimed" | "duplicate";

export interface InboundPayload {
  text: string | null;
  type: string;
  mediaId?: string;
  mime?: string;
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

// Grava a mensagem na fila assim que chega (idempotente). Se já existe, não mexe
// no estado (não regride um processing/done). Guarda o payload para replay.
export async function enqueueInbound(connectionId: string, contactId: string, waMessageId: string, payload: InboundPayload): Promise<void> {
  try {
    await prisma.aiInboundEvent.create({
      data: { connectionId, contactId, waMessageId, payload: payload as unknown as Prisma.InputJsonValue, status: "received" },
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // já enfileirada: ok
  }
}

// Toma posse para processar. received/failed → processing (claimed). Se já está em
// processing/done → duplicate. Se ainda não existe (ex: enqueue falhou), cria já em
// processing com o payload. Race-safe via updateMany condicional.
export async function claimInbound(connectionId: string, contactId: string, waMessageId: string, payload?: InboundPayload): Promise<ClaimResult> {
  try {
    const upd = await prisma.aiInboundEvent.updateMany({
      where: { connectionId, waMessageId, status: { in: ["received", "failed"] } },
      data: { status: "processing", attempts: { increment: 1 }, error: null },
    });
    if (upd.count > 0) return "claimed";

    const existing = await prisma.aiInboundEvent
      .findUnique({ where: { connectionId_waMessageId: { connectionId, waMessageId } } })
      .catch(() => null);
    if (existing) return "duplicate"; // processing ou done

    await prisma.aiInboundEvent.create({
      data: {
        connectionId, contactId, waMessageId, status: "processing", attempts: 1,
        payload: payload ? (payload as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    return "claimed";
  } catch (e) {
    if (isUniqueViolation(e)) return "duplicate"; // corrida: outro processo assumiu
    // Falha inesperada do ledger não pode travar o atendimento (fail-open).
    return "claimed";
  }
}

export async function markInboundDone(connectionId: string, waMessageId: string): Promise<void> {
  await prisma.aiInboundEvent
    .updateMany({ where: { connectionId, waMessageId }, data: { status: "done", processedAt: new Date() } })
    .catch(() => {});
}

export async function markInboundFailed(connectionId: string, waMessageId: string, error: string): Promise<void> {
  await prisma.aiInboundEvent
    .updateMany({ where: { connectionId, waMessageId }, data: { status: "failed", error: error.slice(0, 500) } })
    .catch(() => {});
}
