import { prisma } from "@/lib/prisma";
import { captureException } from "@/lib/observability";

const API = "https://api.telegram.org/bot";

export function telegramAvailable(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN;
}

// Envio direto para um chat (usado no fluxo de vínculo).
export async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const res = await fetch(`${API}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return res.ok;
  } catch (e) {
    captureException(e, { where: "telegram.send" });
    return false;
  }
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
