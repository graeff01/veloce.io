import { decryptSecret } from "@/lib/crypto";

// Envio de texto pela Cloud API. Usado SOMENTE pelo agente (controlado e logado).
export async function sendWhatsAppText(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  text: string,
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${decryptSecret(conn.accessToken)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}

// Sobe um arquivo para a Cloud API e retorna o mediaId (passo 1 do envio de documento).
export async function uploadWhatsAppMedia(
  conn: { phoneNumberId: string; accessToken: string },
  file: Buffer,
  filename: string,
  mime: string,
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([new Uint8Array(file)], { type: mime }), filename);

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${decryptSecret(conn.accessToken)}` },
    body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, mediaId: payload?.id };
}

// Envia um documento (ex: PDF de orçamento) por mediaId. Faz upload antes se receber Buffer.
export async function sendWhatsAppDocument(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  doc: { buffer: Buffer; filename: string; mime?: string; caption?: string },
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const up = await uploadWhatsAppMedia(conn, doc.buffer, doc.filename, doc.mime ?? "application/pdf");
  if (!up.ok || !up.mediaId) return { ok: false, error: up.error ?? "falha no upload da mídia" };

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${decryptSecret(conn.accessToken)}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "document",
      document: { id: up.mediaId, filename: doc.filename, ...(doc.caption ? { caption: doc.caption } : {}) },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}
