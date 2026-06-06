import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import {
  verifySignature, onlyDigits, messageText, type WaWebhookBody, type WaChangeValue, type WaReferral,
} from "@/lib/whatsapp";

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

// POST — recebe eventos (mensagens) da Meta.
export async function POST(req: Request) {
  const raw = await req.text();

  let body: WaWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ignora corpo inválido
  }

  // Processa cada mudança, roteando pelo phone_number_id → conexão do cliente.
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) continue;

      const conn = await prisma.waConnection.findUnique({ where: { phoneNumberId } });
      if (!conn) continue;

      // Valida assinatura se houver appSecret configurado (env global ou da conexão)
      const appSecret = process.env.WHATSAPP_APP_SECRET
        ?? (conn.appSecret ? decryptSecret(conn.appSecret) : undefined);
      if (appSecret && !verifySignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
        return new NextResponse("invalid signature", { status: 401 });
      }

      await processChange(conn.id, conn.displayPhone, value);
      await prisma.waConnection.update({ where: { id: conn.id }, data: { lastEventAt: new Date() } });
    }
  }

  // A Meta exige 200 rápido, senão reenvia.
  return NextResponse.json({ ok: true });
}

async function processChange(connectionId: string, displayPhone: string | null, value: WaChangeValue) {
  const businessNumber = onlyDigits(displayPhone ?? value.metadata?.display_phone_number);
  const nameByWaId = new Map<string, string>();
  for (const c of value.contacts ?? []) {
    if (c.wa_id) nameByWaId.set(onlyDigits(c.wa_id), c.profile?.name ?? "");
  }

  for (const m of value.messages ?? []) {
    const fromDigits = onlyDigits(m.from);
    const outbound = businessNumber !== "" && fromDigits === businessNumber;
    // O contato é sempre o cliente (no inbound = remetente; no outbound o webhook
    // de coexistência ainda traz o cliente em contacts/from conforme o caso).
    const customerWaId = outbound ? (value.contacts?.[0]?.wa_id ? onlyDigits(value.contacts[0].wa_id) : fromDigits) : fromDigits;
    if (!customerWaId) continue;

    const ts = new Date(Number(m.timestamp) * 1000);

    // Upsert do contato
    const contact = await prisma.waContact.upsert({
      where: { connectionId_waId: { connectionId, waId: customerWaId } },
      create: { connectionId, waId: customerWaId, name: nameByWaId.get(customerWaId) || null, lastMessageAt: ts },
      update: {
        lastMessageAt: ts,
        ...(nameByWaId.get(customerWaId) ? { name: nameByWaId.get(customerWaId) } : {}),
      },
    });

    // Insere a mensagem (dedup por waMessageId)
    await prisma.waMessage.upsert({
      where: { connectionId_waMessageId: { connectionId, waMessageId: m.id } },
      create: {
        connectionId, contactId: contact.id, waMessageId: m.id,
        direction: outbound ? "out" : "in",
        type: m.type, text: messageText(m), timestamp: ts, raw: m as object,
      },
      update: {},
    });

    // Lead de anúncio: 1ª mensagem com "referral" (Click-to-WhatsApp)
    const ref: WaReferral | undefined = m.referral;
    if (ref && (ref.source_id || ref.source_type === "ad")) {
      await prisma.waLead.upsert({
        where: { contactId: contact.id },
        create: {
          connectionId, contactId: contact.id, waId: customerWaId,
          name: contact.name,
          adId: ref.source_id ?? null,
          adTitle: ref.headline ?? null,
          adBody: ref.body ?? null,
          sourceType: ref.source_type ?? null,
          sourceUrl: ref.source_url ?? null,
          ctwaClid: ref.ctwa_clid ?? null,
          enteredAt: ts,
        },
        update: {}, // mantém a 1ª atribuição
      });
    }
  }
}
