import { prisma } from "@/lib/prisma";
import { sendPushToUser, type PushPayload } from "@/lib/notifications/web-push";
import { sendTelegramToUser } from "@/lib/notifications/telegram";
import { captureException } from "@/lib/observability";

// Quantas vezes um envio que falhou pode ser re-tentado nos ticks seguintes
// antes de desistir (evita loop infinito p/ usuário sem canal conectado).
export const MAX_ATTEMPTS = 5;

// Marca-de-execução idempotente (gate). Cria uma linha "sent" na hora — ao
// contrário do claim, nunca é re-reivindicável. Usada para gates temporais no
// banco (ex.: "já checei o token hoje"), funcionando igual no scheduler interno
// e no cron externo (sem estado em memória). Retorna true só na 1ª vez.
export async function gateOnce(key: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { dedupeKey: key, userId: "system", type: "gate", channel: "gate", status: "sent" } });
    return true;
  } catch {
    return false;
  }
}

// Reivindica o envio. Cria a linha com status "pending" (atômico via dedupeKey
// único). Se já existir, só re-reivindica quando a tentativa anterior FALHOU e
// ainda há orçamento — assim um envio que deu certo nunca repete, mas um que
// falhou (telegram fora do ar, etc.) é re-tentado no próximo tick. Idempotência
// real + auto-cura.
export async function claim(dedupeKey: string, userId: string, type: string): Promise<boolean> {
  try {
    await prisma.notificationLog.create({ data: { dedupeKey, userId, type, channel: "multi", status: "pending" } });
    return true;
  } catch {
    // Já existe → retoma se (a) falhou e ainda tem orçamento, ou (b) ficou preso
    // em "pending" (processo caiu no meio do envio) por mais de 10 min.
    const staleCut = new Date(Date.now() - 10 * 60 * 1000);
    const upd = await prisma.notificationLog.updateMany({
      where: {
        dedupeKey,
        attempts: { lt: MAX_ATTEMPTS },
        OR: [{ status: "failed" }, { status: "pending", createdAt: { lt: staleCut } }],
      },
      data: { status: "pending" },
    });
    return upd.count > 0;
  }
}

async function markSent(dedupeKey: string): Promise<void> {
  await prisma.notificationLog.update({ where: { dedupeKey }, data: { status: "sent" } }).catch(() => {});
}

async function markFailed(dedupeKey: string, error?: string): Promise<void> {
  const row = await prisma.notificationLog
    .update({ where: { dedupeKey }, data: { status: "failed", attempts: { increment: 1 }, error: error?.slice(0, 500) } })
    .catch(() => null);
  // Estourou o orçamento de tentativas → desistimos. Loga p/ observabilidade
  // (vira alerta no resumo de saúde e no Sentry/webhook se configurado).
  if (row && row.attempts >= MAX_ATTEMPTS) {
    captureException(new Error(`notificação desistiu após ${row.attempts} tentativas`), { where: "notif.giveup", dedupeKey, type: row.type });
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

// Reivindica + despacha + marca o resultado. Retorna true se entregou em ALGUM
// canal. Se nenhum canal entregou, marca "failed" → o próximo tick re-tenta
// (até MAX_ATTEMPTS). Substitui o antigo claim-antes-de-enviar que marcava como
// enviado mesmo quando o envio falhava (mensagem fantasma).
export async function claimDispatch(
  dedupeKey: string,
  userId: string,
  type: string,
  push: PushPayload,
  telegramText: string,
  pref: DispatchPref,
): Promise<boolean> {
  if (!(await claim(dedupeKey, userId, type))) return false;

  // Usuário sem nenhum canal habilitado: não há o que tentar. Mantém o claim
  // (status pending→sent) para não re-tentar pra sempre.
  if (!pref.pushEnabled && !pref.telegramEnabled) {
    await markSent(dedupeKey);
    return false;
  }

  const res = await dispatchToUser(userId, push, telegramText, pref);
  if (res.push || res.telegram) {
    await markSent(dedupeKey);
    return true;
  }
  await markFailed(dedupeKey, "nenhum canal entregou");
  return false;
}

// Usuários ativos que optaram por um tipo de notificação, com suas preferências.
export async function recipientsFor(type: "dailyDigest" | "criticalAlerts") {
  const prefs = await prisma.notificationPreference.findMany({
    where: { [type]: true, user: { active: true, deletedAt: null } },
    select: { userId: true, pushEnabled: true, telegramEnabled: true },
  });
  return prefs;
}
