import { NextRequest, NextResponse } from "next/server";
import { clientBotByWebhook, consumeInvite, deactivateRecipientByChat, sendMessage, welcomeText } from "@/lib/notifications/client-bot";

export const runtime = "nodejs";

// Webhook de um bot POR CLIENTE. O `ref` no path é o webhookSecret do bot, que
// identifica de qual cliente é o update (e isola um cliente do outro). Trata
// /start <token-de-convite> (vincula o chat ao cliente) e /stop (descadastra).
export async function POST(req: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const bot = await clientBotByWebhook(ref);
  if (!bot) return new NextResponse("not found", { status: 404 });

  // Telegram envia o secret_token configurado no setWebhook neste header.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== bot.webhookSecret) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const chatId = msg?.chat?.id ? String(msg.chat.id) : null;
  const text: string = msg?.text ?? "";
  if (!chatId) return NextResponse.json({ ok: true });

  if (text.startsWith("/start")) {
    const inviteToken = text.split(/\s+/)[1] ?? "";
    const username = msg?.chat?.username ?? msg?.from?.username ?? null;
    const res = await consumeInvite(inviteToken, chatId, username);
    if (!res || res.clientId !== bot.clientId) {
      await sendMessage(bot.token, chatId, "Convite inválido ou expirado. Peça um novo link à sua agência.");
      return NextResponse.json({ ok: true });
    }
    await sendMessage(bot.token, chatId, welcomeText(bot.welcomeMessage, bot.brandName));
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/stop")) {
    await deactivateRecipientByChat(bot.clientId, chatId);
    await sendMessage(bot.token, chatId, "🔕 Alertas desativados. Peça um novo link para reativar.");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
