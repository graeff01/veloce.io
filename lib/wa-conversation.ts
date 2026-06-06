import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logWaEvent } from "@/lib/wa-events";

// ── Domínio da conversa operacional ──────────────────────────────────────────
// Mantém o estado por contato (SLA, status, contadores) de forma incremental.
// 100% interno: NUNCA envia nem altera nada no WhatsApp da loja.

const maxDate = (a: Date | null, b: Date) => (!a || b > a ? b : a);

export interface MessageApply {
  connectionId: string;
  contactId: string;
  direction: "in" | "out";
  timestamp: Date;
}

// Aplica uma mensagem ao estado da conversa (chamado pelo webhook).
export async function applyMessageToConversation({ connectionId, contactId, direction, timestamp }: MessageApply) {
  const conv = await prisma.waConversation.findUnique({ where: { contactId } });

  if (!conv) {
    return prisma.waConversation.create({
      data: {
        connectionId,
        contactId,
        status: direction === "in" ? "waiting" : "open",
        openedAt: timestamp,
        lastMessageAt: timestamp,
        firstInboundAt: direction === "in" ? timestamp : null,
        lastInboundAt: direction === "in" ? timestamp : null,
        lastOutboundAt: direction === "out" ? timestamp : null,
        inboundCount: direction === "in" ? 1 : 0,
        outboundCount: direction === "out" ? 1 : 0,
      },
    });
  }

  const data: Prisma.WaConversationUpdateInput = {
    lastMessageAt: maxDate(conv.lastMessageAt, timestamp),
    closedAt: null, // qualquer atividade reabre o rótulo interno
  };

  if (direction === "in") {
    data.inboundCount = { increment: 1 };
    data.lastInboundAt = maxDate(conv.lastInboundAt, timestamp);
    data.status = "waiting";
    if (!conv.firstInboundAt) data.firstInboundAt = timestamp;
    if (conv.status === "closed") data.openedAt = timestamp; // nova sessão
  } else {
    data.outboundCount = { increment: 1 };
    data.lastOutboundAt = maxDate(conv.lastOutboundAt, timestamp);
    data.status = "open";
    if (!conv.firstResponseAt && conv.firstInboundAt && timestamp >= conv.firstInboundAt) {
      data.firstResponseAt = timestamp;
      data.firstResponseSec = Math.round((timestamp.getTime() - conv.firstInboundAt.getTime()) / 1000);
    }
  }

  const updated = await prisma.waConversation.update({ where: { contactId }, data });

  if (direction === "out" && !conv.firstResponseAt && updated.firstResponseAt) {
    await logWaEvent(connectionId, "first.response", contactId, { sec: updated.firstResponseSec });
  }
  return updated;
}

// Marca como "closed" (rótulo interno) conversas inativas há mais de `hours`.
// Não dispara nada no WhatsApp — só atualiza o nosso registro.
export async function closeInactiveConversations(connectionId: string, hours = 24): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const res = await prisma.waConversation.updateMany({
    where: { connectionId, status: { not: "closed" }, lastMessageAt: { lt: cutoff } },
    data: { status: "closed", closedAt: new Date() },
  });
  return res.count;
}

// Reconstrói as conversas a partir das mensagens já armazenadas (backfill).
interface Accum {
  status: string;
  firstInboundAt: Date | null; firstResponseAt: Date | null; firstResponseSec: number | null;
  lastInboundAt: Date | null; lastOutboundAt: Date | null; lastMessageAt: Date | null;
  inboundCount: number; outboundCount: number; openedAt: Date | null;
}

export async function rebuildConversations(connectionId: string): Promise<number> {
  const messages = await prisma.waMessage.findMany({
    where: { connectionId },
    select: { contactId: true, direction: true, timestamp: true },
    orderBy: { timestamp: "asc" },
  });

  const acc = new Map<string, Accum>();
  for (const m of messages) {
    const a = acc.get(m.contactId) ?? {
      status: "open", firstInboundAt: null, firstResponseAt: null, firstResponseSec: null,
      lastInboundAt: null, lastOutboundAt: null, lastMessageAt: null,
      inboundCount: 0, outboundCount: 0, openedAt: m.timestamp,
    };
    a.lastMessageAt = maxDate(a.lastMessageAt, m.timestamp);
    if (m.direction === "in") {
      a.inboundCount++;
      a.lastInboundAt = maxDate(a.lastInboundAt, m.timestamp);
      if (!a.firstInboundAt) a.firstInboundAt = m.timestamp;
      a.status = "waiting";
    } else {
      a.outboundCount++;
      a.lastOutboundAt = maxDate(a.lastOutboundAt, m.timestamp);
      a.status = "open";
      if (!a.firstResponseAt && a.firstInboundAt && m.timestamp >= a.firstInboundAt) {
        a.firstResponseAt = m.timestamp;
        a.firstResponseSec = Math.round((m.timestamp.getTime() - a.firstInboundAt.getTime()) / 1000);
      }
    }
    acc.set(m.contactId, a);
  }

  await prisma.waConversation.deleteMany({ where: { connectionId } });
  const rows = [...acc.entries()].map(([contactId, a]) => ({ connectionId, contactId, ...a }));
  if (rows.length) await prisma.waConversation.createMany({ data: rows });
  return rows.length;
}
