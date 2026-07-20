import { decryptSecret } from "@/lib/crypto";

// Envio de texto pela Cloud API. Usado SOMENTE pelo agente (controlado e logado).
export async function sendWhatsAppText(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  text: string,
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

// Envio de mensagem INTERATIVA com reply buttons (até 3). SÓ funciona dentro da janela
// de 24h (fora dela a Meta exige template). Usado no "fechou?" ao gestor.
export async function sendWhatsAppInteractiveButtons(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  body: string,
  buttons: { id: string; title: string }[],
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        // title máx. 20 chars (limite da Meta).
        action: { buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}

// Envia mídia JÁ SUBIDA (mediaId) por tipo. Usado no envio manual do painel (imagem/
// documento/áudio que a equipe manda ao lead). O upload é feito antes com uploadWhatsAppMedia.
export async function sendWhatsAppMediaById(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  kind: "image" | "audio" | "document",
  mediaId: string,
  opts?: { filename?: string; caption?: string },
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const media: Record<string, unknown> =
    kind === "document" ? { id: mediaId, ...(opts?.filename ? { filename: opts.filename } : {}), ...(opts?.caption ? { caption: opts.caption } : {}) }
    : kind === "image" ? { id: mediaId, ...(opts?.caption ? { caption: opts.caption } : {}) }
    : { id: mediaId }; // audio não aceita caption

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toWaId, type: kind, [kind]: media }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}

// Envio de IMAGEM por link (foto do produto). A Cloud API baixa a URL e entrega.
export async function sendWhatsAppImage(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  link: string,
  caption?: string,
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "image",
      image: { link, ...(caption ? { caption } : {}) },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}

// Envia um VÍDEO por link público (ex.: vídeo de apresentação). Link deve ser MP4 acessível.
export async function sendWhatsAppVideo(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  link: string,
  caption?: string,
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: toWaId,
      type: "video", video: { link, ...(caption ? { caption } : {}) },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}

// Pede a LOCALIZAÇÃO do cliente com o botão nativo do WhatsApp ("Enviar localização").
// A resposta volta como uma mensagem type:"location" (lat/lng) no webhook. Só funciona
// dentro da janela de 24h (o cliente acabou de escrever, então ok).
export async function sendWhatsAppLocationRequest(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  body: string,
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: toWaId,
      type: "interactive",
      interactive: { type: "location_request_message", body: { text: body }, action: { name: "send_location" } },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}

// Sobe um arquivo (ex: PDF de orçamento) para a Cloud API → mediaId.
export async function uploadWhatsAppMedia(
  conn: { phoneNumberId: string; accessToken: string },
  file: Buffer,
  filename: string,
  mime: string,
): Promise<{ ok: boolean; mediaId?: string; error?: string }> {
  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mime);
  form.append("file", new Blob([new Uint8Array(file)], { type: mime }), filename);

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/media`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, mediaId: payload?.id };
}

// Envia um documento (PDF) por upload de Buffer.
export async function sendWhatsAppDocument(
  conn: { phoneNumberId: string; accessToken: string },
  toWaId: string,
  doc: { buffer: Buffer; filename: string; mime?: string; caption?: string },
): Promise<{ ok: boolean; waMessageId?: string; error?: string }> {
  const up = await uploadWhatsAppMedia(conn, doc.buffer, doc.filename, doc.mime ?? "application/pdf");
  if (!up.ok || !up.mediaId) return { ok: false, error: up.error ?? "falha no upload da mídia" };

  let token: string;
  try { token = decryptSecret(conn.accessToken); }
  catch { return { ok: false, error: "Token do WhatsApp inválido — reconecte a conta." }; }

  const res = await fetch(`https://graph.facebook.com/v25.0/${conn.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: toWaId,
      type: "document", document: { id: up.mediaId, filename: doc.filename, ...(doc.caption ? { caption: doc.caption } : {}) },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: payload?.error?.message ?? `Erro ${res.status}` };
  return { ok: true, waMessageId: payload?.messages?.[0]?.id };
}
