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
