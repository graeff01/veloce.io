import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyLinkToken, sendTelegramMessage } from "@/lib/notifications/telegram";

export const runtime = "nodejs";

// Webhook do bot do Telegram. Trata /start <token> (vínculo) e /stop (desvincular).
// Segurança: o vínculo só ocorre com token HMAC válido; opcionalmente valida o
// header secreto do Telegram (TELEGRAM_WEBHOOK_SECRET).
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  const text: string = msg?.text ?? "";
  if (!chatId) return NextResponse.json({ ok: true });

  if (text.startsWith("/start")) {
    const token = text.split(/\s+/)[1] ?? "";
    const userId = verifyLinkToken(token);
    if (!userId) {
      await sendTelegramMessage(chatId, "Link inválido ou expirado. Gere um novo no Veloce em Configurações → Notificações.");
      return NextResponse.json({ ok: true });
    }
    const username = msg?.chat?.username ?? msg?.from?.username ?? null;
    await prisma.telegramLink.upsert({
      where: { userId },
      create: { userId, chatId, username },
      update: { chatId, username },
    });
    await sendTelegramMessage(chatId, "✅ Telegram conectado ao Veloce! Você receberá aqui o resumo do dia e alertas críticos.");
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/stop")) {
    await prisma.telegramLink.deleteMany({ where: { chatId } });
    await sendTelegramMessage(chatId, "🔕 Notificações desativadas. Reative no Veloce quando quiser.");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
