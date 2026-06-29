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
  image_url?: string;     // imagem do criativo (CTWA referral)
  video_url?: string;
  thumbnail_url?: string;
  media_type?: string;
}

interface WaMediaRef { id?: string; mime_type?: string; caption?: string; filename?: string }

export interface WaIncomingMessage {
  from: string;
  to?: string;
  id: string;
  timestamp: string; // unix seconds (string)
  type: string;
  text?: { body?: string };
  audio?: WaMediaRef;
  image?: WaMediaRef;
  document?: WaMediaRef;
  video?: WaMediaRef;
  sticker?: WaMediaRef;
  referral?: WaReferral;
}

// Metadados de mídia (sem baixar o conteúdo) — usado p/ o agente reconhecer o tipo.
export function mediaRef(m: WaIncomingMessage): { id?: string; mime?: string } | null {
  const ref = m.audio ?? m.image ?? m.document ?? m.video ?? m.sticker;
  return ref ? { id: ref.id, mime: ref.mime_type } : null;
}

export interface WaChangeValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WaIncomingMessage[];
  // Coexistência: mensagens enviadas pelo vendedor PELO APP do celular (echo).
  // A Meta pode entregar sob "message_echoes" ou "smb_message_echoes" — aceitamos ambos.
  message_echoes?: WaIncomingMessage[];
  smb_message_echoes?: WaIncomingMessage[];
  statuses?: unknown[];
}

// Normaliza o array de echoes independente da chave usada pela Meta.
export function messageEchoes(v: WaChangeValue): WaIncomingMessage[] {
  return v.message_echoes ?? v.smb_message_echoes ?? [];
}

export interface WaWebhookBody {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ value?: WaChangeValue; field?: string }> }>;
}

// Texto legível por tipo de mensagem. Para mídia, devolve a legenda (se houver) ou um
// marcador explícito — que o agente reconhece SEM analisar o conteúdo. Áudio é placeholder
// (substituído pela transcrição quando o agente atua).
export function messageText(m: WaIncomingMessage): string | null {
  switch (m.type) {
    case "text": return m.text?.body ?? null;
    case "image": return m.image?.caption || "[O lead enviou uma imagem]";
    case "document": return m.document?.caption || "[O lead enviou um documento]";
    case "video": return m.video?.caption || "[O lead enviou um vídeo]";
    case "sticker": return "[O lead enviou uma figurinha]";
    case "audio": return "[O lead enviou um áudio]";
    default: return `[O lead enviou um(a) ${m.type}]`;
  }
}
