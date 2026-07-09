// ── Worker de replay da fila durável (F0) ────────────────────────────────────
// Rede de segurança do caminho ao vivo: reprocessa o que ficou pra trás — mensagens
// "received" que nunca foram processadas (ex: crash antes do fast-path), "failed"
// dentro do limite de tentativas e "processing" travadas (reaper). Reconstrói a
// mensagem a partir do payload e chama o mesmo agente (skipClaim: já assumimos aqui).
//
// Disparo: sem processo residente no Railway, roda por rota HTTP acionada por cron
// (app/api/ai-agent/drain). Idempotente e seguro para rodar em paralelo (claim atômico).

import { prisma } from "@/lib/prisma";
import { maybeRespondWithAgent } from "./respond";
import type { InboundPayload } from "./inbound-ledger";

const MAX_ATTEMPTS = Number(process.env.AI_QUEUE_MAX_ATTEMPTS || 4);
const REAPER_MS = Number(process.env.AI_QUEUE_REAPER_MS || 5 * 60 * 1000);

export interface DrainResult { scanned: number; processed: number; failed: number; skipped: number }

export async function drainInbound(limit = 20): Promise<DrainResult> {
  const stuckBefore = new Date(Date.now() - REAPER_MS);
  const rows = await prisma.aiInboundEvent.findMany({
    where: {
      OR: [
        { status: "received" },
        { status: "failed", attempts: { lt: MAX_ATTEMPTS } },
        { status: "processing", createdAt: { lt: stuckBefore } }, // reaper: travadas
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  const res: DrainResult = { scanned: rows.length, processed: 0, failed: 0, skipped: 0 };

  for (const ev of rows) {
    // Claim atômico: só assume se ainda não concluiu (evita corrida com o fast-path).
    const claimed = await prisma.aiInboundEvent.updateMany({
      where: { id: ev.id, status: { not: "done" } },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    if (claimed.count === 0) { res.skipped++; continue; }

    if (!ev.payload) {
      await prisma.aiInboundEvent.update({ where: { id: ev.id }, data: { status: "failed", error: "sem payload para replay" } }).catch(() => {});
      res.failed++; continue;
    }

    const [conn, contact] = await Promise.all([
      prisma.waConnection.findUnique({ where: { id: ev.connectionId } }),
      prisma.waContact.findUnique({ where: { id: ev.contactId }, select: { id: true, name: true, waId: true } }),
    ]);
    if (!conn || !contact) {
      await prisma.aiInboundEvent.update({ where: { id: ev.id }, data: { status: "failed", error: "conexão/contato ausente" } }).catch(() => {});
      res.failed++; continue;
    }

    const p = ev.payload as unknown as InboundPayload;
    try {
      await maybeRespondWithAgent(
        { id: conn.id, clientId: conn.clientId, phoneNumberId: conn.phoneNumberId, accessToken: conn.accessToken },
        { id: contact.id, name: contact.name, waId: contact.waId },
        { text: p.text ?? null, type: p.type ?? "text", mediaId: p.mediaId, mime: p.mime },
        ev.waMessageId,
        { skipClaim: true },
      );
      res.processed++;
    } catch (e) {
      await prisma.aiInboundEvent.update({ where: { id: ev.id }, data: { status: "failed", error: String(e).slice(0, 500) } }).catch(() => {});
      res.failed++;
    }
  }

  return res;
}
