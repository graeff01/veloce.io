// ── Bot Veloce no WhatsApp (fundação) ────────────────────────────────────────
// Transporte WhatsApp dos alertas/comandos do dono, pela PRÓPRIA linha da loja.
// Três primitivos puros/isolados (Fase 0), ainda não plugados no fluxo:
//   • formatForWhatsApp — converte o HTML do Telegram (<b>/<i>/<a>) p/ markdown do WhatsApp
//   • isWindowOpen      — a janela de 24h (custo-zero) está aberta? (deriva de lastInboundAt)
//   • sendWhatsAppBotMessage — envia pela WABA da loja, com retry leve
// NADA aqui atende lead nem dispara sozinho — é só a camada de transporte.

import { prisma } from "@/lib/prisma";
import { sendWhatsAppText } from "@/lib/whatsapp-send";
import { sameBrazilNumber } from "@/lib/phone-br";

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

// O inbound veio de um destinatário do bot no WhatsApp (dono)? Devolve o waId REGISTRADO
// dele (tolerando o 9º dígito BR), ou null. Usado pra: (a) não tratar o dono como lead,
// (b) saber sob qual waId os alertas foram retidos. Escopado ao cliente (isolamento).
export async function matchWaBotRecipient(clientId: string, waId: string): Promise<string | null> {
  const recs = await prisma.clientBotRecipient.findMany({
    where: { clientId, channel: "whatsapp", active: true },
    select: { waId: true },
  });
  const hit = recs.find((r) => r.waId && sameBrazilNumber(r.waId, waId));
  return hit?.waId ?? null;
}

const FLUSH_MAX = 15; // no digest, mostra até N; o resto vira contagem (protege 4096 chars)

// Hold-and-flush: quando o dono reabre a janela (mandou msg), solta os alertas retidos
// num ÚNICO digest — nada se perde, e é 1 mensagem, não N (protege o quality rating).
export async function flushHeldAlerts(
  clientId: string,
  registeredWaId: string,
  conn: { phoneNumberId: string; accessToken: string },
  sendToWaId: string,
): Promise<number> {
  const held = await prisma.heldAlert.findMany({
    where: { clientId, waId: registeredWaId, flushedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (!held.length) return 0;

  const shown = held.slice(0, FLUSH_MAX);
  const extra = held.length - shown.length;
  const header = `📥 <b>Enquanto você esteve fora</b> — ${held.length} alerta(s):`;
  const body = shown.map((h) => h.text).join("\n———\n");
  const tail = extra > 0 ? `\n———\n<i>+${extra} alerta(s) mais antigos</i>` : "";
  const res = await sendWhatsAppBotMessage(conn, sendToWaId, `${header}\n${body}${tail}`);
  if (!res.ok) return 0; // falhou → NÃO marca (tenta de novo no próximo inbound)

  await prisma.heldAlert.updateMany({ where: { id: { in: held.map((h) => h.id) } }, data: { flushedAt: new Date() } }).catch(() => {});
  return held.length;
}
