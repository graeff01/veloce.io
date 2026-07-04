// ── Bot Veloce no WhatsApp (fundação) ────────────────────────────────────────
// Transporte WhatsApp dos alertas/comandos do dono, pela PRÓPRIA linha da loja.
// Três primitivos puros/isolados (Fase 0), ainda não plugados no fluxo:
//   • formatForWhatsApp — converte o HTML do Telegram (<b>/<i>/<a>) p/ markdown do WhatsApp
//   • isWindowOpen      — a janela de 24h (custo-zero) está aberta? (deriva de lastInboundAt)
//   • sendWhatsAppBotMessage — envia pela WABA da loja, com retry leve
// NADA aqui atende lead nem dispara sozinho — é só a camada de transporte.

import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp-send";

// Converte o HTML que os builders de alerta emitem (estilo Telegram) para o
// markdown do WhatsApp. Puro e testável — sem esse passo o dono veria "<b>" cru.
export function formatForWhatsApp(html: string): string {
  let s = html;
  // <a href="URL">LABEL</a> → "LABEL: URL" (WhatsApp linka URL crua sozinho)
  s = s.replace(/<a\s+href="([^"]*)"\s*>([\s\S]*?)<\/a>/gi, (_m, url, label) => {
    const l = String(label).trim();
    return l && l !== url ? `${l}: ${url}` : url;
  });
  // negrito e itálico
  s = s.replace(/<\/?(?:b|strong)>/gi, "*").replace(/<\/?(?:i|em)>/gi, "_");
  // qualquer outra tag remanescente → remove
  s = s.replace(/<[^>]+>/g, "");
  // desescapa entidades (o esc() dos builders escapa & < > para o Telegram)
  s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return s.trim();
}

const WINDOW_MS = 24 * 60 * 60 * 1000; // janela de atendimento do WhatsApp (24h)

// A janela de 24h está aberta para este destinatário? Dentro dela, texto livre é
// GRÁTIS; fora, só template pago — por isso o gate. Deriva do último inbound do
// contato (WaConversation.lastInboundAt), sem chamar a API da Meta.
export async function isWindowOpen(connectionId: string, waId: string): Promise<boolean> {
  const contact = await prisma.waContact.findFirst({ where: { connectionId, waId }, select: { id: true } });
  if (!contact) return false;
  const conv = await prisma.waConversation.findUnique({ where: { contactId: contact.id }, select: { lastInboundAt: true } });
  if (!conv?.lastInboundAt) return false;
  return Date.now() - conv.lastInboundAt.getTime() < WINDOW_MS;
}

// Envia uma mensagem do bot pela linha da loja (WABA), formatando p/ WhatsApp.
// Retry leve para hipo de rede — nunca lança (falha é devolvida, não quebra o chamador).
export async function sendWhatsAppBotMessage(
  conn: { phoneNumberId: string; accessToken: string },
  waId: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const text = formatForWhatsApp(html);
  let lastErr: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await sendWhatsAppText(conn, waId, text);
    if (r.ok) return { ok: true };
    lastErr = r.error;
    if (attempt < 2) await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
  }
  return { ok: false, error: lastErr };
}
