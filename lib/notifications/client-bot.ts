import { prisma } from "@/lib/prisma";
import { nowParts } from "@/lib/tz";
import { isWindowOpen, sendWhatsAppBotMessage } from "@/lib/notifications/whatsapp-bot";

// Bot de alertas POR CLIENTE, no WhatsApp: os alertas saem pela LINHA DA LOJA
// (a mesma WABA que atende lead) para o WhatsApp do dono. Config (quais alertas,
// quiet hours, nomes excluídos) fica em ClientBot; destinatários em ClientBotRecipient
// (channel=whatsapp, waId). O transporte/janela/hold-and-flush vive em whatsapp-bot.ts.

const TZ = "America/Sao_Paulo";

export type AlertKind = "novoLead" | "slaAlerts" | "leadQuente" | "leadEsfriando" | "resumoDiario";

// ── Padrão visual das mensagens (style guide) ────────────────────────────────
// CABEÇALHO (emoji + título em negrito) → CONTEXTO (linhas curtas) → 1 CTA.
// Continua emitindo "HTML" leve (<b>/<i>/<a>); o transporte converte pro WhatsApp.
export interface BotCta { label: string; url: string }
export function botMsg(head: string, lines: (string | null | undefined)[], cta?: BotCta | null): string {
  const body = lines.filter(Boolean).join("\n");
  const action = cta ? `\n\n<a href="${cta.url}">${cta.label}</a>` : "";
  return `${head}${body ? `\n${body}` : ""}${action}`;
}

// ── Link do WhatsApp do lead + exclusão de nomes ─────────────────────────────

// Abre o WhatsApp direto na conversa com o lead (telefone E.164 sem "+").
export function waMe(waId: string | null): string | null {
  const d = (waId || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : null;
}

// Tokens (sobrenomes/nomes) que o cliente marcou para ignorar.
export async function excludedTokens(clientId: string): Promise<string[]> {
  const bot = await prisma.clientBot.findUnique({ where: { clientId }, select: { excludedNames: true } });
  return (bot?.excludedNames || "").split(/[,\n;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// O nome do contato bate com algum termo ignorado? (ex.: "Erling").
export function nameExcluded(name: string | null, tokens: string[]): boolean {
  if (!name || tokens.length === 0) return false;
  const n = name.toLowerCase();
  return tokens.some((t) => n.includes(t));
}

// ── Quiet hours ──────────────────────────────────────────────────────────────

// Está dentro do "não perturbe"? (janela em BRT; suporta virar a meia-noite).
function inQuietHours(quietStart: string | null, quietEnd: string | null): boolean {
  if (!quietStart || !quietEnd) return false;
  const min = nowParts(TZ).minutes;
  const toMin = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + (m || 0); };
  const a = toMin(quietStart), b = toMin(quietEnd);
  return a <= b ? (min >= a && min < b) : (min >= a || min < b); // janela normal vs. atravessa meia-noite
}

// ── Envio ────────────────────────────────────────────────────────────────────

// Envia um alerta de um cliente para os destinatários ativos (WhatsApp), pela linha
// da loja. Respeita: bot ativo, alerta habilitado e quiet hours (urgent fura o silêncio).
// Janela de 24h aberta → envia agora (grátis); fechada/sem conexão → RETÉM (HeldAlert),
// solto em digest quando o dono reabre a janela (hold-and-flush em whatsapp-bot.ts).
export async function sendClientAlert(clientId: string, kind: AlertKind, text: string, opts: { urgent?: boolean } = {}): Promise<number> {
  const bot = await prisma.clientBot.findUnique({ where: { clientId } });
  if (!bot || !bot.active) return 0;
  if (!bot[kind]) return 0; // alerta desligado para este cliente
  if (!opts.urgent && inQuietHours(bot.quietStart, bot.quietEnd)) return 0;

  const recipients = await prisma.clientBotRecipient.findMany({
    where: { clientId, active: true, channel: "whatsapp", waId: { not: null }, OR: [{ mutedUntil: null }, { mutedUntil: { lt: new Date() } }] },
    select: { waId: true },
  });
  if (recipients.length === 0) return 0;

  const conn = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true, phoneNumberId: true, accessToken: true } });

  let sent = 0;
  for (const r of recipients) {
    const waId = r.waId!;
    // Envia só se a janela estiver aberta E houver linha; senão RETÉM (nada se perde).
    const open = conn ? await isWindowOpen(conn.id, waId) : false;
    if (open && conn) {
      const res = await sendWhatsAppBotMessage(conn, waId, text);
      if (res.ok) sent++;
    } else {
      await prisma.heldAlert.create({ data: { clientId, waId, kind, text, urgent: !!opts.urgent } }).catch(() => {});
    }
  }
  if (sent > 0) await prisma.clientBot.update({ where: { clientId }, data: { lastAlertAt: new Date() } }).catch(() => {});
  return sent;
}

// Saúde do bot de um cliente: WhatsApp conectado + há destinatários (número do dono).
export interface ClientBotHealth { tokenOk: boolean; webhookOk: boolean; recipients: number; lastAlertAt: Date | null; issues: string[] }
export async function checkClientBotHealth(clientId: string): Promise<ClientBotHealth | null> {
  const bot = await prisma.clientBot.findUnique({ where: { clientId } });
  if (!bot || !bot.active) return null;
  const recipients = await prisma.clientBotRecipient.count({ where: { clientId, active: true, channel: "whatsapp" } });
  const conn = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });

  const ready = !!conn; // "canal pronto" = a linha da loja está conectada
  const issues: string[] = [];
  if (!conn) issues.push("WhatsApp não conectado");
  if (recipients === 0) issues.push("sem destinatários (número do dono) cadastrados");

  return { tokenOk: ready, webhookOk: ready, recipients, lastAlertAt: bot.lastAlertAt, issues };
}
