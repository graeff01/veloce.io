import {
  runDailyDigest, runCriticalAlerts, runEndOfDay,
  runTokenExpiryAlerts, runMonthlyReports, runFailureAlert,
} from "@/lib/notifications/run";
import { gateOnce } from "@/lib/notifications/dispatch";
import { sweepExpiredTelegramMessages } from "@/lib/notifications/telegram";
import { prisma } from "@/lib/prisma";
import { nowParts } from "@/lib/tz";
import { captureException } from "@/lib/observability";
import { pruneOldAiLogs } from "@/lib/ai-agent/retention";
import { runCostAlerts } from "@/lib/ai-agent/cost-alerts";

// Núcleo de decisão "o que enviar agora", compartilhado pelo agendador interno
// (setInterval) e pelo cron externo. Gates são no BANCO (gateOnce), não em
// memória — assim funciona idêntico nos dois e sobrevive a deploy/reinício.

const TZ = "America/Sao_Paulo";

// Cada job é isolado: uma falha não impede os demais de rodar no mesmo ciclo.
async function safe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    captureException(e, { where: `notif.${label}` });
  }
}

export async function runDueJobs(): Promise<void> {
  const p = nowParts(TZ);              // relógio de parede em BRT (DST-safe)
  const h = Math.floor(p.minutes / 60);
  const day = p.ymd;
  const isFirstOfMonth = p.ymd.endsWith("-01");
  const bucket4h = Math.floor(h / 4);  // janela de ~4h p/ alertas críticos

  // Resumo do dia: a partir das 09h BRT (claim garante 1x/dia).
  if (h >= 9 && h < 23) await safe("digest", runDailyDigest);

  // Token Meta: 1x/dia (gate no banco evita martelar a Graph API).
  if (h >= 9 && (await gateOnce(`gate:token:${day}`))) await safe("token", runTokenExpiryAlerts);

  // Relatórios mensais: dia 1, a partir das 09h (claim garante 1x/mês).
  if (isFirstOfMonth && h >= 9) await safe("monthly", runMonthlyReports);

  // Resumo de fim de dia: a partir das 18h BRT (claim garante 1x/dia).
  if (h >= 18 && h < 23) await safe("eod", runEndOfDay);

  // Resumo de saúde: 1x/dia a partir das 09h, se houve falhas.
  if (h >= 9 && (await gateOnce(`gate:health:${day}`))) await safe("health", runFailureAlert);

  // Alertas críticos de mídia: 1x por janela de ~4h (gate no banco).
  if (await gateOnce(`gate:critical:${day}:${bucket4h}`)) await safe("critical", runCriticalAlerts);

  // Auto-limpeza das mensagens do Telegram com +24h.
  await safe("sweep", () => sweepExpiredTelegramMessages());

  // Poda do histórico de logs (>90 dias): 1x/dia.
  if (await gateOnce(`gate:prune:${day}`)) await safe("prune", pruneOldLogs);

  // LGPD: anonimiza o texto de interações antigas da IA (>retenção): 1x/dia.
  if (await gateOnce(`gate:ai-prune:${day}`)) await safe("ai-prune", pruneOldAiLogs);

  // Custo: alertas de limiar (70/85/95/100%) + auto-pause. gateOnce interno garante 1x/dia.
  await safe("cost-alerts", runCostAlerts);
}

async function pruneOldLogs(): Promise<void> {
  const cut = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.notificationLog.deleteMany({ where: { createdAt: { lt: cut } } });
}
