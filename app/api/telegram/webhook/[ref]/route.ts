import { NextRequest, NextResponse } from "next/server";
import { clientBotByWebhook, consumeInvite, deactivateRecipientByChat, sendMessage, welcomeText, isActiveRecipient, snoozeRecipient } from "@/lib/notifications/client-bot";
import { statusNow, quentesAguardando, resultadosHoje, resumoPeriodo, ajuda } from "@/lib/notifications/client-report";
import { getOrCreatePortal } from "@/lib/notifications/client-portal";

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

  // Comandos de consulta sob demanda — só para destinatários ativos do cliente.
  const cmd = text.trim().split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
  if (cmd.startsWith("/")) {
    if (!(await isActiveRecipient(bot.clientId, chatId))) {
      await sendMessage(bot.token, chatId, "Você ainda não está conectado. Use o link de convite da sua agência.");
      return NextResponse.json({ ok: true });
    }
    let reply: string | null = null;
    if (cmd === "/status" || cmd === "/agora") reply = await statusNow(bot.clientId);
    else if (cmd === "/quentes") reply = await quentesAguardando(bot.clientId);
    else if (cmd === "/resultados" || cmd === "/hoje") reply = await resultadosHoje(bot.clientId);
    else if (cmd === "/semana") reply = await resumoPeriodo(bot.clientId, "week");
    else if (cmd === "/mes" || cmd === "/mês") reply = await resumoPeriodo(bot.clientId, "month");
    else if (cmd === "/painel") { const p = await getOrCreatePortal(bot.clientId); reply = `📊 <b>Seu painel</b>\n${p.link}`; }
    else if (cmd === "/silenciar") {
      const h = Math.min(24, Math.max(1, Number(text.trim().split(/\s+/)[1]) || 2));
      await snoozeRecipient(bot.clientId, chatId, h);
      reply = `🔕 Alertas pausados por ${h}h. Volto a avisar depois disso.`;
    }
    else reply = ajuda(bot.brandName); // /ajuda, /help e desconhecidos
    await sendMessage(bot.token, chatId, reply);
  }

  return NextResponse.json({ ok: true });
}
