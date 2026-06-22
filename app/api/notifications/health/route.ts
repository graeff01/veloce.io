import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { prisma } from "@/lib/prisma";
import { getFailureStats } from "@/lib/notifications/digest";
import { MAX_ATTEMPTS } from "@/lib/notifications/dispatch";
import { lastTickAt } from "@/lib/notifications/heartbeat";
import { telegramAvailable } from "@/lib/notifications/telegram";
import { pushAvailable } from "@/lib/notifications/web-push";

export const runtime = "nodejs";

// GET — painel de saúde do bot de notificações para auto-auditoria:
//  • live: o agendador rodou recentemente? (batimento < 20min)
//  • canais configurados, destinatários e vínculos
//  • falhas que esgotaram tentativas nas últimas 24h
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const activeUser = { user: { active: true, deletedAt: null } };
  const [stats, tick, digestR, criticalR, tgLinks, pushSubs] = await Promise.all([
    getFailureStats(MAX_ATTEMPTS),
    lastTickAt(),
    prisma.notificationPreference.count({ where: { dailyDigest: true, ...activeUser } }),
    prisma.notificationPreference.count({ where: { criticalAlerts: true, ...activeUser } }),
    prisma.telegramLink.count(),
    prisma.pushSubscription.count(),
  ]);

  const secondsSinceTick = tick ? Math.round((Date.now() - tick.getTime()) / 1000) : null;
  const live = secondsSinceTick != null && secondsSinceTick < 20 * 60;

  return NextResponse.json({
    live,
    lastTickAt: tick,
    secondsSinceTick,
    channels: { telegram: telegramAvailable(), push: pushAvailable() },
    deadMansSwitch: !!process.env.HEARTBEAT_URL,
    recipients: { dailyDigest: digestR, criticalAlerts: criticalR },
    links: { telegram: tgLinks, push: pushSubs },
    failures24h: stats,
    maxAttempts: MAX_ATTEMPTS,
  });
}
