import { prisma } from "@/lib/prisma";
import { captureException } from "@/lib/observability";

const API = "https://api.telegram.org/bot";

export function telegramAvailable(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

// Envio direto para um chat (usado no fluxo de vínculo).
// Registra o message_id retornado para auto-limpeza após 24h (ver sweep).
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    const messageId = data?.result?.message_id;
    if (typeof messageId === "number") {
      await prisma.telegramMessage.create({ data: { chatId, messageId } }).catch(() => {});
    }
    return true;
  } catch (e) {
    captureException(e, { where: "telegram.send" });
    return false;
  }
}

// Apaga uma mensagem do bot. Bots podem apagar as próprias mensagens sem o
// limite de 48h. Retorna true se apagou (ou se já não existia).
async function deleteTelegramMessage(chatId: string, messageId: number): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API}${token}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
    });
    // 400 "message to delete not found" → já sumiu, tratamos como sucesso.
    return res.ok || res.status === 400;
  } catch {
    return false;
  }
}

// Varre mensagens com mais de `ttlHours` e as apaga do chat (mantém o histórico
// limpo). Limita o lote por execução para não estourar rate limit do Telegram;
// roda a cada tick do agendador.
export async function sweepExpiredTelegramMessages(ttlHours = 24, batch = 100): Promise<number> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return 0;
  const cut = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
  const old = await prisma.telegramMessage.findMany({
    where: { sentAt: { lt: cut } },
    orderBy: { sentAt: "asc" },
    take: batch,
  });
  let removed = 0;
  for (const m of old) {
    const ok = await deleteTelegramMessage(m.chatId, m.messageId);
    if (ok) {
      await prisma.telegramMessage.delete({ where: { id: m.id } }).catch(() => {});
      removed++;
    }
  }
  return removed;
}

// Envio para o usuário (resolve o chat vinculado).
export async function sendTelegramToUser(userId: string, text: string): Promise<boolean> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return false;
  const link = await prisma.telegramLink.findUnique({ where: { userId } });
  if (!link) return false;
  return sendTelegramMessage(link.chatId, text);
}

// Token de vínculo: curto, aleatório, guardado no banco (uso único + expira).
// Charset base64url ([A-Za-z0-9_-]) é compatível com o parâmetro `start` do
// Telegram (que NÃO aceita ".", limite 64 chars).
import crypto from "crypto";

export async function makeLinkToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(12).toString("base64url"); // 16 chars seguros
  await prisma.telegramLinkToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });
  return token;
}

export async function verifyLinkToken(token: string): Promise<string | null> {
  if (!token) return null;
  const row = await prisma.telegramLinkToken.findUnique({ where: { token } });
  if (!row) return null;
  await prisma.telegramLinkToken.delete({ where: { token } }).catch(() => {}); // uso único
  if (row.expiresAt < new Date()) return null;
  return row.userId;
}
