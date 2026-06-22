import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  verifySignature, onlyDigits, messageText, mediaRef, messageEchoes, type WaWebhookBody, type WaChangeValue,
} from "@/lib/whatsapp";
import { applyMessageToConversation } from "@/lib/wa-conversation";
import { applyFunnelFromMessage } from "@/lib/wa-funnel";
import { detectAdModel } from "@/lib/wa-ad-detect";
import { logWaEvent } from "@/lib/wa-events";
import { enqueueAgentJob } from "@/lib/ai-agent/queue";
import { notifyNovoLead } from "@/lib/notifications/novo-lead";
import { notifyLeadQuente } from "@/lib/notifications/lead-quente";
import { captureException } from "@/lib/observability";
import { createHash } from "crypto";
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
  // Fail-closed em produção: sem App Secret configurado, recusa (evita injeção de
  // lead forjado). Em dev permite sem assinatura para facilitar testes locais.
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse("webhook não configurado", { status: 503 });
    }
  } else if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Persist-first: grava o payload cru antes de processar (rede de replay/auditoria).
  // Best-effort: se falhar, segue o processamento como antes. Dedupe por hash do
  // corpo evita linhas duplicadas em retry da Meta; idempotência real é por waMessageId.
  let eventId: string | null = null;
  try {
    const dedupeKey = createHash("sha256").update(raw).digest("hex");
    const evt = await prisma.webhookEvent.upsert({
      where: { dedupeKey },
      create: { source: "whatsapp", dedupeKey, payload: body as object },
      update: {},
      select: { id: true, status: true },
    });
    if (evt.status === "processed") return NextResponse.json({ ok: true }); // retry de evento já tratado
    eventId = evt.id;
  } catch (e) {
    captureException(e, { where: "webhook.persist" });
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
        if (messageEchoes(value).length) await processMessageEchoes(conn, value);
        if (value?.statuses?.length) await processStatuses(conn.id, value);
        await prisma.waConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } });
      } catch (e) {
        await logWaEvent(conn.id, "integration.error", null, { message: String(e) });
        captureException(e, { where: "webhook.process", connectionId: conn.id });
      }
    }
  }

  // Marca o evento como processado (best-effort).
  if (eventId) {
    try {
      await prisma.webhookEvent.update({ where: { id: eventId }, data: { status: "processed", processedAt: new Date() } });
    } catch { /* não bloqueia o 200 */ }
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
    // Para mensagens enviadas pelo negócio, o destinatário vem em m.to.
    // value.contacts pode estar vazio em mensagens outbound da API ou do app nativo.
    const customerWaId = outbound
      ? (m.to ? onlyDigits(m.to) : value.contacts?.[0]?.wa_id ? onlyDigits(value.contacts[0].wa_id) : null)
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

    // Auto-classificação do funil (determinística, sem custo). Vale para lead E
    // loja (ex.: "parabéns pela compra"). Fire-and-forget: nunca bloqueia o webhook.
    // Encadeia o alerta de "lead quente" (lê o funil já atualizado).
    void applyFunnelFromMessage({ connectionId, contactId: contact.id, clientId: conn.clientId, text: messageText(m), direction: outbound ? "out" : "in" })
      .then(() => { if (!outbound) return notifyLeadQuente({ clientId: conn.clientId, contactId: contact.id, contactName: contact.name, text: messageText(m) }); })
      .catch(() => {});

    // Veloce AI Agent: responde leads recebidos (decide internamente se atua).
    // Enfileira na fila DURÁVEL (AiJob): 1 job por contato, coalescendo rajadas.
    // Sobrevive a deploy/restart e serializa em multi-instância; o 200 não espera o agente.
    // Atribuição de anúncio: pelo "referral" (Click-to-WhatsApp) E/OU pelo modelo
    // detectado na mensagem de abertura ("anúncio do {modelo}"). Capturamos ANTES
    // de notificar para a notificação já saber de qual anúncio o lead veio —
    // independente do texto que o lead digitou.
    // Lead de anúncio NOSSO (Meta) = referral (Click-to-WhatsApp) OU a mensagem
    // padrão com o modelo do carro ("anúncio do {modelo}"). Marketplace/site
    // (AutoCarro, OLX, "anúncio do site"...) NÃO contam como nosso lead de Meta.
    const ref = m.referral;
    const text = outbound ? null : messageText(m);
    const adModel = outbound ? null : detectAdModel(text);
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

    // Veloce AI Agent: responde leads recebidos (decide internamente se atua).
    // Enfileira na fila DURÁVEL (AiJob): 1 job por contato, coalescendo rajadas.
    // Sobrevive a deploy/restart e serializa em multi-instância; o 200 não espera o agente.
    if (!outbound) {
      const media = mediaRef(m);
      void enqueueAgentJob({
        clientId: conn.clientId, connectionId: conn.id, contactId: contact.id,
        idempotencyKey: m.id,
        payload: { text: messageText(m), type: m.type, mediaId: media?.id, mime: media?.mime },
      }).catch(() => {});

      // Alerta "Novo lead" no BOT DO CLIENTE (só no 1º contato). Fire-and-forget.
      void notifyNovoLead({
        clientId: conn.clientId, contactId: contact.id,
        contactName: contact.name, waId: customerWaId, text: messageText(m),
      }).catch(() => {});
    }
  }
}

// Coexistência: mensagens que o VENDEDOR enviou pelo app do celular (echo).
// São tratadas como outbound — alimentam a conversa e as métricas de resposta.
// Nunca disparam o agente nem criam lead.
async function processMessageEchoes(conn: WaConnection, value: WaChangeValue) {
  const connectionId = conn.id;
  for (const m of messageEchoes(value)) {
    // No echo: from = número do negócio, to = cliente.
    const customerWaId = m.to ? onlyDigits(m.to) : "";
    if (!customerWaId) continue;
    const ts = new Date(Number(m.timestamp) * 1000);

    const contact = await prisma.waContact.upsert({
      where: { connectionId_waId: { connectionId, waId: customerWaId } },
      create: { connectionId, waId: customerWaId, lastMessageAt: ts },
      update: { lastMessageAt: ts },
    });

    const exists = await prisma.waMessage.findUnique({
      where: { connectionId_waMessageId: { connectionId, waMessageId: m.id } },
      select: { id: true },
    });
    if (exists) continue;

    await prisma.waMessage.create({
      data: {
        connectionId, contactId: contact.id, waMessageId: m.id,
        direction: "out", type: m.type, text: messageText(m), timestamp: ts, raw: m as object,
      },
    });
    await applyMessageToConversation({ connectionId, contactId: contact.id, direction: "out", timestamp: ts });
    // Funil: mensagem da loja (echo). Só converte com confirmação de venda real.
    void applyFunnelFromMessage({ connectionId, contactId: contact.id, clientId: conn.clientId, text: messageText(m), direction: "out" }).catch(() => {});
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
