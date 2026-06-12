import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { sendTelegramToUser } from "@/lib/notifications/telegram";

// POST — envia uma notificação de teste para o usuário atual (push + telegram).
export async function POST() {
  const { error, session } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  const [push, telegram] = await Promise.all([
    sendPushToUser(userId, { title: "🔔 Teste do Veloce", body: "Se você está vendo isso, as notificações no navegador funcionam!", url: "/" }).catch(() => false),
    sendTelegramToUser(userId, "🔔 <b>Teste do Veloce</b>\nSe você recebeu isso, o Telegram está conectado e funcionando!").catch(() => false),
  ]);

  return NextResponse.json({ push, telegram });
}
