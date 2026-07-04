import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { sendPushToUser } from "@/lib/notifications/web-push";
import { buildDailyDigest } from "@/lib/notifications/digest";

// POST — envia o RESUMO DO DIA real (preview) para o usuário atual (web-push).
export async function POST() {
  const { error, session } = await requireAuth();
  if (error) return error;
  const userId = session!.user.id;

  const digest = await buildDailyDigest();
  const push = await sendPushToUser(userId, { title: `${digest.title} (teste)`, body: digest.body, url: digest.url }).catch(() => false);

  return NextResponse.json({ push });
}
