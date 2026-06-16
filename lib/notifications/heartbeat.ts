import { prisma } from "@/lib/prisma";

// Batimento (liveness) do agendador. Gravado a cada ciclo completo, pelo
// agendador interno E pelo cron externo — então "último batimento" reflete o
// driver mais recente, qualquer que seja.

// Último batimento ANTES de gravar o novo — usado p/ detectar buraco (downtime).
export async function lastTickAt(): Promise<Date | null> {
  const row = await prisma.schedulerHeartbeat.findUnique({ where: { name: "tick" } }).catch(() => null);
  return row?.at ?? null;
}

// Grava o batimento atual e (best-effort) pinga o monitor externo — o
// dead-man's switch. Só é chamado quando um ciclo COMPLETOU; se o ciclo quebrar
// antes, o monitor externo deixa de receber o ping e alerta VOCÊ por um canal
// independente do app (e-mail/SMS/Telegram do próprio monitor).
// Configure HEARTBEAT_URL com a URL de um check em healthchecks.io (ou similar).
export async function recordTick(): Promise<void> {
  const now = new Date();
  await prisma.schedulerHeartbeat
    .upsert({ where: { name: "tick" }, create: { name: "tick", at: now }, update: { at: now } })
    .catch(() => {});

  const url = process.env.HEARTBEAT_URL;
  if (url) {
    void fetch(url, { method: "GET", signal: AbortSignal.timeout(8000) }).catch(() => {});
  }
}
