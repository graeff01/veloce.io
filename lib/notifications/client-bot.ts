import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { captureException } from "@/lib/observability";
import { nowParts } from "@/lib/tz";

// Bot do Telegram POR CLIENTE (marca branca). Cada cliente tem seu bot (criado no
// BotFather); os alertas dele saem por esse bot, isolados dos outros clientes.

const API = "https://api.telegram.org/bot";
const TZ = "America/Sao_Paulo";
const APP_URL = (process.env.NEXTAUTH_URL || "https://veloceio-production.up.railway.app").replace(/\/$/, "");

export type AlertKind = "novoLead" | "slaAlerts" | "leadQuente" | "leadEsfriando" | "resumoDiario";

// ── Conexão / configuração ───────────────────────────────────────────────────

// Salva (ou atualiza) o bot do cliente: cifra o token, gera o segredo de webhook
// e registra o webhook na Meta do Telegram. Retorna o resultado do setWebhook.
export async function connectClientBot(clientId: string, rawToken: string, username: string): Promise<{ ok: boolean; error?: string }> {
  const token = rawToken.trim();
  const uname = username.trim().replace(/^@/, "");
  if (!/^\d+:[\w-]+$/.test(token)) return { ok: false, error: "Token inválido (formato do BotFather: 123456:ABC...)." };

  // Valida o token chamando getMe.
  const me = await tg(token, "getMe", {}).catch(() => null);
  if (!me?.ok) return { ok: false, error: "Token não autenticou no Telegram (getMe falhou)." };

  const existing = await prisma.clientBot.findUnique({ where: { clientId } });
  const webhookSecret = existing?.webhookSecret ?? crypto.randomBytes(18).toString("base64url");

  await prisma.clientBot.upsert({
    where: { clientId },
    create: { clientId, token: encryptSecret(token), username: uname, webhookSecret, active: true },
    update: { token: encryptSecret(token), username: uname, active: true },
  });

  const hook = await setClientWebhook(token, webhookSecret);
  if (!hook.ok) return { ok: false, error: `Bot salvo, mas o webhook falhou: ${hook.error}` };
  return { ok: true };
}

async function setClientWebhook(token: string, webhookSecret: string): Promise<{ ok: boolean; error?: string }> {
  const url = `${APP_URL}/api/telegram/webhook/${webhookSecret}`;
  const res = await tg(token, "setWebhook", {
    url,
    secret_token: webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  }).catch((e) => ({ ok: false, description: String(e) }));
  return res?.ok ? { ok: true } : { ok: false, error: res?.description ?? "erro desconhecido" };
}

// Resolve o bot pelo segredo do webhook (path), com o token já decifrado.
export async function clientBotByWebhook(webhookSecret: string): Promise<{ clientId: string; token: string; webhookSecret: string; welcomeMessage: string | null; brandName: string | null } | null> {
  const bot = await prisma.clientBot.findUnique({ where: { webhookSecret } });
  if (!bot) return null;
  try {
    return { clientId: bot.clientId, token: decryptSecret(bot.token), webhookSecret: bot.webhookSecret, welcomeMessage: bot.welcomeMessage, brandName: bot.brandName };
  } catch (e) {
    captureException(e, { where: "client-bot.decrypt", clientId: bot.clientId });
    return null;
  }
}

// Mensagem de boas-vindas (custom do cliente ou padrão, com a marca se houver).
export function welcomeText(welcomeMessage: string | null, brandName: string | null): string {
  if (welcomeMessage?.trim()) return welcomeMessage.trim();
  const marca = brandName?.trim() ? ` da <b>${brandName.trim()}</b>` : "";
  return `✅ Conectado ao assistente${marca}! Você vai receber aqui os novos leads e o andamento do atendimento.`;
}

// Marca branca: nome do bot no Telegram (best-effort; o Telegram limita trocas/dia).
export async function applyBranding(token: string, brandName: string): Promise<void> {
  const name = brandName.trim().slice(0, 64);
  if (!name) return;
  await tg(token, "setMyName", { name }).catch(() => {});
  await tg(token, "setMyShortDescription", { short_description: `Assistente de atendimento — ${name}`.slice(0, 120) }).catch(() => {});
}

// ── Convite / destinatários ──────────────────────────────────────────────────

// Convite genérico: quem entra é só destinatário (recebe alertas), sem papel
// específico e sem qualquer acesso de edição.
export async function makeInviteToken(clientId: string, role = "membro"): Promise<string | null> {
  const bot = await prisma.clientBot.findUnique({ where: { clientId }, select: { username: true } });
  if (!bot) return null;
  const token = crypto.randomBytes(12).toString("base64url");
  await prisma.clientBotLinkToken.create({ data: { token, clientId, role, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
  return `https://t.me/${bot.username}?start=${token}`;
}

// Consome o token de convite (uso único) e vincula o chat ao cliente+papel.
export async function consumeInvite(token: string, chatId: string, username: string | null): Promise<{ clientId: string } | null> {
  const row = await prisma.clientBotLinkToken.findUnique({ where: { token } });
  if (!row) return null;
  await prisma.clientBotLinkToken.delete({ where: { token } }).catch(() => {});
  if (row.expiresAt < new Date()) return null;
  await prisma.clientBotRecipient.upsert({
    where: { clientId_chatId: { clientId: row.clientId, chatId } },
    create: { clientId: row.clientId, chatId, username, role: row.role, active: true },
    update: { active: true, role: row.role, username },
  });
  return { clientId: row.clientId };
}

export async function deactivateRecipientByChat(clientId: string, chatId: string): Promise<void> {
  await prisma.clientBotRecipient.updateMany({ where: { clientId, chatId }, data: { active: false } });
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

// Envia um alerta de um cliente para todos os destinatários ativos do bot dele.
// Respeita: bot ativo, o alerta habilitado e quiet hours (urgent fura o silêncio).
export async function sendClientAlert(clientId: string, kind: AlertKind, text: string, opts: { urgent?: boolean } = {}): Promise<number> {
  const bot = await prisma.clientBot.findUnique({ where: { clientId } });
  if (!bot || !bot.active) return 0;
  if (!bot[kind]) return 0; // alerta desligado para este cliente
  if (!opts.urgent && inQuietHours(bot.quietStart, bot.quietEnd)) return 0;

  let token: string;
  try { token = decryptSecret(bot.token); } catch (e) { captureException(e, { where: "client-bot.send.decrypt", clientId }); return 0; }

  const recipients = await prisma.clientBotRecipient.findMany({ where: { clientId, active: true }, select: { chatId: true } });
  if (recipients.length === 0) return 0;

  let sent = 0;
  await Promise.all(recipients.map(async (r) => {
    const ok = await sendMessage(token, r.chatId, text).catch(() => false);
    if (ok) sent++;
  }));
  return sent;
}

// Envio direto (usado no fluxo de vínculo e no teste).
export async function sendMessage(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await tg(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }).catch(() => null);
  return !!res?.ok;
}

// Chamada base à Bot API com um token específico.
async function tg(token: string, method: string, body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; description?: string } | null> {
  try {
    const res = await fetch(`${API}${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    return await res.json().catch(() => ({ ok: res.ok }));
  } catch (e) {
    captureException(e, { where: `client-bot.${method}` });
    return null;
  }
}
