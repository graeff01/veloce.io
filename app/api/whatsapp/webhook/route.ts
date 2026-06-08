import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature, onlyDigits, messageText, type WaWebhookBody, type WaChangeValue,
} from "@/lib/whatsapp";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { detectAdModel } from "@/lib/wa-ad-detect";
import { logWaEvent } from "@/lib/wa-events";
import { maybeRespondWithAgent } from "@/lib/ai-agent/respond";
import { scheduleAgentRun } from "@/lib/ai-agent/scheduler";
import type { WaConnection } from "@prisma/client";

export const runtime = "nodejs";

// GET — handshake de verificação do webhook (Meta).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// POST — recebe eventos (mensagens + status) da Meta. Somente leitura: nunca
// responde nem altera nada no WhatsApp da loja.
export async function POST(req: Request) {
  const raw = await req.text();

  // Proteção principal: valida a assinatura do corpo (HMAC com o App Secret).
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret && !verifySignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const conn = await prisma.waConnection.findUnique({ where: { phoneNumberId } });
      if (!conn) continue;

      try {
        if (value?.messages?.length) await processMessages(conn, value);
        if (value?.statuses?.length) await processStatuses(conn.id, value);
        await prisma.waConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } });
      } catch (e) {
        await logWaEvent(conn.id, "integration.error", null, { message: String(e) });
      }
    }
  }

  // A Meta exige 200 rápido, senão reenvia.
  return NextResponse.json({ ok: true });
}

async function processMessages(conn: WaConnection, value: WaChangeValue) {
  const connectionId = conn.id;
  const businessNumber = onlyDigits(conn.displayPhone ?? value.metadata?.display_phone_number);
  const nameByWaId = new Map<string, string>();
  for (const c of value.contacts ?? []) {
    if (c.wa_id) nameByWaId.set(onlyDigits(c.wa_id), c.profile?.name ?? "");
  }

  for (const m of value.messages ?? []) {
    const fromDigits = onlyDigits(m.from);
    const outbound = businessNumber !== "" && fromDigits === businessNumber;
    const customerWaId = outbound
      ? (value.contacts?.[0]?.wa_id ? onlyDigits(value.contacts[0].wa_id) : fromDigits)
      : fromDigits;
    if (!customerWaId) continue;

    const ts = new Date(Number(m.timestamp) * 1000);

    const contact = await prisma.waContact.upsert({
      where: { connectionId_waId: { connectionId, waId: customerWaId } },
      create: { connectionId, waId: customerWaId, name: nameByWaId.get(customerWaId) || null, lastMessageAt: ts },
      update: { lastMessageAt: ts, ...(nameByWaId.get(customerWaId) ? { name: nameByWaId.get(customerWaId) } : {}) },
    });

    // Idempotência: se já processamos essa mensagem, não recontabiliza.
    const exists = await prisma.waMessage.findUnique({
      where: { connectionId_waMessageId: { connectionId, waMessageId: m.id } },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.waMessage.create({
      data: {
        connectionId, contactId: contact.id, waMessageId: m.id,
        direction: outbound ? "out" : "in",
        type: m.type, text: messageText(m), timestamp: ts, raw: m as object,
      },
    });

    await applyMessageToConversation({ connectionId, contactId: contact.id, direction: outbound ? "out" : "in", timestamp: ts });

    // Veloce AI Agent: responde leads recebidos (decide internamente se atua).
    // Debounce + lock por contato evitam respostas duplicadas/concorrentes; o 200
    // não espera o agente.
    if (!outbound) {
      const connInfo = { id: conn.id, clientId: conn.clientId, phoneNumberId: conn.phoneNumberId, accessToken: conn.accessToken };
      const contactInfo = { id: contact.id, name: contact.name, waId: customerWaId };
      const text = messageText(m) ?? "";
      scheduleAgentRun(contact.id, () => maybeRespondWithAgent(connInfo, contactInfo, text));
    }

    // Atribuição de anúncio: pelo "referral" (Click-to-WhatsApp) E/OU pelo modelo
    // detectado na mensagem de abertura ("anúncio do {modelo}").
    const ref = m.referral;
    const adModel = outbound ? null : detectAdModel(messageText(m));
    const isAdLead = (ref && (ref.source_id || ref.source_type === "ad")) || !!adModel;
    if (isAdLead) {
      const lead = await prisma.waLead.findUnique({ where: { contactId: contact.id } });
      if (!lead) {
        await prisma.waLead.create({
          data: {
            connectionId, contactId: contact.id, waId: customerWaId,
            name: contact.name,
            adId: ref?.source_id ?? null,
            adTitle: ref?.headline ?? adModel ?? null,
            adModel: adModel ?? null,
            adBody: ref?.body ?? null,
            sourceType: ref?.source_type ?? (adModel ? "message" : null),
            sourceUrl: ref?.source_url ?? null,
            ctwaClid: ref?.ctwa_clid ?? null,
            enteredAt: ts,
          },
        });
        await logWaEvent(connectionId, "lead.created", contact.id, { adId: ref?.source_id, adModel, adTitle: ref?.headline });
      } else if (adModel && !lead.adModel) {
        await prisma.waLead.update({ where: { contactId: contact.id }, data: { adModel } });
      }
    }
  }
}

// Atualiza entrega/leitura das mensagens (evento "statuses").
async function processStatuses(connectionId: string, value: WaChangeValue) {
  const statuses = (value.statuses ?? []) as Array<{ id?: string; status?: string; timestamp?: string }>;
  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    const ts = s.timestamp ? new Date(Number(s.timestamp) * 1000) : new Date();
    const data = s.status === "read" ? { readAt: ts } : s.status === "delivered" ? { deliveredAt: ts } : null;
    if (!data) continue;
    await prisma.waMessage.updateMany({ where: { connectionId, waMessageId: s.id }, data });
  }
}
