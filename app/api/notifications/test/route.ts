import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { sendTelegramToUser } from "@/lib/notifications/telegram";
import { buildDailyDigest } from "@/lib/notifications/digest";

// POST — envia o RESUMO DO DIA real (preview) para o usuário atual (push + telegram).
export async function POST() {
  const { error, session } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  const digest = await buildDailyDigest();
  const tg = `<b>${digest.title}</b> (teste)\n${digest.body}`;

  const [push, telegram] = await Promise.all([
    sendPushToUser(userId, { title: `${digest.title} (teste)`, body: digest.body, url: digest.url }).catch(() => false),
    sendTelegramToUser(userId, tg).catch(() => false),
  ]);

  return NextResponse.json({ push, telegram });
}
