import { prisma } from "@/lib/prisma";
import { sendPushToUser, type PushPayload } from "@/lib/notifications/web-push";
import { sendTelegramToUser } from "@/lib/notifications/telegram";

// Claim atômico: cria o log com a dedupeKey única. Se já existir (corrida/retry
// do cron), o create falha e retornamos false → NÃO reenvia. Idempotência real.
export async function claim(dedupeKey: string, userId: string, type: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { dedupeKey, userId, type, channel: "multi" } });
    return true;
  } catch {
    return false; // unique violation → já enviado
  }
}

export interface DispatchPref {
  pushEnabled: boolean;
  telegramEnabled: boolean;
}

// Envia para os canais ativos do usuário (falha de um canal não derruba o outro).
export async function dispatchToUser(
  userId: string,
  push: PushPayload,
  telegramText: string,
  pref: DispatchPref,
): Promise<{ push: boolean; telegram: boolean }> {
  const [pushOk, tgOk] = await Promise.all([
    pref.pushEnabled ? sendPushToUser(userId, push).catch(() => false) : Promise.resolve(false),
    pref.telegramEnabled ? sendTelegramToUser(userId, telegramText).catch(() => false) : Promise.resolve(false),
  ]);
  return { push: pushOk, telegram: tgOk };
}

// Usuários ativos que optaram por um tipo de notificação, com suas preferências.
export async function recipientsFor(type: "dailyDigest" | "criticalAlerts") {
  const prefs = await prisma.notificationPreference.findMany({
    where: { [type]: true, user: { active: true, deletedAt: null } },
    select: { userId: true, pushEnabled: true, telegramEnabled: true },
  });
  return prefs;
}
