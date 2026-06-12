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

// Token de vínculo: assinado com o segredo da app (sem tabela extra).
import crypto from "crypto";
function linkSecret(): string {
  return process.env.NEXTAUTH_SECRET || "veloce-fallback-key";
}
export function makeLinkToken(userId: string): string {
  const ts = Date.now().toString(36);
  const sig = crypto.createHmac("sha256", linkSecret()).update(`${userId}.${ts}`).digest("base64url").slice(0, 16);
  return `${userId}.${ts}.${sig}`;
}
export function verifyLinkToken(token: string): string | null {
  const [userId, ts, sig] = token.split(".");
  if (!userId || !ts || !sig) return null;
  const expected = crypto.createHmac("sha256", linkSecret()).update(`${userId}.${ts}`).digest("base64url").slice(0, 16);
  if (sig !== expected) return null;
  // Validade de 1h para o deep-link.
  if (Date.now() - parseInt(ts, 36) > 60 * 60 * 1000) return null;
  return userId;
}
