import { prismaUnscoped } from "@/lib/prisma";
import { gateOnce, recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";
import { spendToday } from "./usage";

// ── Hardening: alertas de custo + auto-pause ───────────────────────────────────
// Antes o teto pausava em SILÊNCIO. Agora avisamos em 70/85/95/100% (1x/dia por
// limiar) e, ao bater 100%, pausamos a IA do cliente com motivo + alerta crítico.

const THRESHOLDS = [70, 85, 95, 100] as const;

async function notify(title: string, body: string) {
  const recipients = await recipientsFor("criticalAlerts");
  const day = new Date().toISOString().slice(0, 10);
  const tg = `<b>${title}</b>\n${body}`;
  for (const r of recipients) {
    await claimDispatch(`cost:${title}:${day}:${r.userId}`, r.userId, "cost_alert", { title, body, url: "/clients" }, tg, r);
  }
}

export async function runCostAlerts(): Promise<{ checked: number; alerts: number }> {
  const day = new Date().toISOString().slice(0, 10);
  let alerts = 0;

  // Global.
  const globalCap = Number(process.env.AI_AGENT_DAILY_USD_CAP || 0);
  if (globalCap > 0) {
    const spent = await spendToday({});
    const pct = (spent / globalCap) * 100;
    for (const th of THRESHOLDS) {
      if (pct >= th && (await gateOnce(`gate:cost:global:${th}:${day}`))) {
        await notify(`💸 Custo global ${th}%`, `Gasto hoje US$ ${spent.toFixed(2)} de US$ ${globalCap.toFixed(2)} (${pct.toFixed(0)}%).`);
        alerts++;
      }
    }
  }

  // Por cliente (só os com teto definido).
  const cfgs = await prismaUnscoped.aiAgentConfig.findMany({
    where: { dailyUsdCap: { not: null } },
    select: { clientId: true, dailyUsdCap: true, paused: true, client: { select: { name: true } } },
  });
  for (const c of cfgs) {
    const cap = c.dailyUsdCap ?? 0;
    if (cap <= 0) continue;
    const spent = await spendToday({ clientId: c.clientId });
    const pct = (spent / cap) * 100;
    for (const th of THRESHOLDS) {
      if (pct >= th && (await gateOnce(`gate:cost:${c.clientId}:${th}:${day}`))) {
        await notify(`💸 ${c.client?.name ?? "Cliente"} — custo ${th}%`, `Gasto hoje US$ ${spent.toFixed(2)} de US$ ${cap.toFixed(2)}.`);
        alerts++;
      }
    }
    // 100%: pausa (kill-switch) com motivo, se ainda não pausado.
    if (pct >= 100 && !c.paused) {
      await prismaUnscoped.aiAgentConfig.update({
        where: { clientId: c.clientId },
        data: { paused: true, pausedReason: `Teto de custo diário atingido (US$ ${cap.toFixed(2)}) em ${day}` },
      }).catch(() => {});
    }
  }

  return { checked: cfgs.length, alerts };
}
