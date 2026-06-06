import crypto from "crypto";

// ── WhatsApp Cloud API (oficial) ─────────────────────────────────────────────
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

// Valida a assinatura X-Hub-Signature-256 do webhook (HMAC-SHA256 do corpo cru).
export function verifySignature(rawBody: string, signature: string | null, appSecret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// ── Tipos do payload do webhook ──────────────────────────────────────────────
export interface WaReferral {
  source_url?: string;
  source_type?: string; // "ad" | "post"
  source_id?: string;   // ID do anúncio
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}

export interface WaIncomingMessage {
  from: string;
  id: string;
  timestamp: string; // unix seconds (string)
  type: string;
  text?: { body?: string };
  referral?: WaReferral;
}

export interface WaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WaIncomingMessage[];
  statuses?: unknown[];
}

export interface WaWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ value?: WaChangeValue; field?: string }> }>;
}

// Texto legível por tipo de mensagem (best-effort).
export function messageText(m: WaIncomingMessage): string | null {
  if (m.type === "text") return m.text?.body ?? null;
  return `[${m.type}]`;
}
