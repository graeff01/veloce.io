import {
  runDailyDigest, runCriticalAlerts, runEndOfDay,
  runTokenExpiryAlerts, runMonthlyReports, runFailureAlert,
} from "@/lib/notifications/run";
import { gateOnce, recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";
import { sweepExpiredTelegramMessages } from "@/lib/notifications/telegram";
import { prisma } from "@/lib/prisma";
import { nowParts } from "@/lib/tz";
import { captureException } from "@/lib/observability";
import { pruneOldAiLogs } from "@/lib/ai-agent/retention";
import { runCostAlerts } from "@/lib/ai-agent/cost-alerts";
import { syncAllCatalogs } from "@/lib/ai-agent/catalog-sync";
import { runAdsHealth } from "@/lib/notifications/ads-health";
import { runSlaFirstResponse } from "@/lib/notifications/sla-first-response";
import { runClientBotJobs, runClientBotHealthAudit } from "@/lib/notifications/client-bot-jobs";
import { lastTickAt, recordTick } from "@/lib/notifications/heartbeat";

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

// Buraco mínimo (min) p/ considerar que o agendador esteve fora do ar. Maior que
// o intervalo do safety-net externo (15min) — deploy normal não dispara.
const GAP_ALERT_MIN = 30;

export async function runDueJobs(): Promise<void> {
  const p = nowParts(TZ);              // relógio de parede em BRT (DST-safe)
  const h = Math.floor(p.minutes / 60);
  const day = p.ymd;
  const isFirstOfMonth = p.ymd.endsWith("-01");
  const bucket4h = Math.floor(h / 4);  // janela de ~4h p/ alertas críticos

  // Detecção de buraco: lê o batimento anterior ANTES de tudo. Se o último ciclo
  // (de qualquer driver) foi há muito tempo, o bot esteve fora do ar → avisa na volta.
  const prevTick = await lastTickAt();
  if (prevTick) {
    const gapMin = Math.round((Date.now() - prevTick.getTime()) / 60000);
    if (gapMin >= GAP_ALERT_MIN) await safe("downtime", () => alertDowntime(gapMin, prevTick));
  }

  // JANELAS DE HORÁRIO (BRT). Estreitas de propósito: o claim/gate garante 1x,
  // então a janela define O QUANDO. O resumo é às 09h (janela 09:00–09:59 → sai
  // ~09:00 no primeiro disparo). O disparo determinístico vem do cron externo
  // (GitHub Action) batendo 09:00 e 09:30 BRT; o scheduler interno (tick 5min) é
  // backup. Se o sistema ficar fora a janela inteira, PULA em vez de enviar fora
  // de hora.
  const morning = h === 9;             // resumo do dia / mensal / token / saúde → 09h BRT
  const evening = h === 18 || h === 19; // resumo de fim de dia → 18h–19h BRT (janela folgada)
  const businessHours = h >= 8 && h < 21; // alertas críticos (não acordar ninguém)

  // Resumo do dia: manhã (claim garante 1x/dia).
  if (morning) await safe("digest", runDailyDigest);

  // Token Meta: 1x/dia de manhã (gate no banco evita martelar a Graph API).
  if (morning && (await gateOnce(`gate:token:${day}`))) await safe("token", runTokenExpiryAlerts);

  // Relatórios mensais: dia 1 de manhã (claim garante 1x/mês).
  if (isFirstOfMonth && morning) await safe("monthly", runMonthlyReports);

  // Resumo de fim de dia: começo da noite (claim garante 1x/dia).
  if (evening) await safe("eod", runEndOfDay);

  // Resumo de saúde: 1x/dia de manhã, se houve falhas.
  if (morning && (await gateOnce(`gate:health:${day}`))) await safe("health", runFailureAlert);

  // Alertas críticos de mídia: 1x por janela de ~4h, só em horário comercial.
  if (businessHours && (await gateOnce(`gate:critical:${day}:${bucket4h}`))) await safe("critical", runCriticalAlerts);

  // Saúde de anúncios intraday (reprovado / sem entrega): ~a cada 4h em horário comercial.
  if (businessHours && (await gateOnce(`gate:ads-health:${day}:${bucket4h}`))) await safe("ads-health", runAdsHealth);

  // SLA de 1º atendimento: a cada tick em horário comercial (a função refina a
  // janela da agência e dedupa por lead). Não gated — precisa de granularidade fina.
  if (businessHours) await safe("sla", runSlaFirstResponse);

  // Bot do CLIENTE: SLA escalonado + lead esfriando + resumo do dia (cada um se
  // auto-agenda por hora/dia; respeita flags e quiet hours de cada cliente).
  await safe("client-bot", runClientBotJobs);

  // Saúde dos bots de cliente: 1x/dia de manhã, avisa o time se algum quebrou.
  if (morning && (await gateOnce(`gate:clientbot-health:${day}`))) await safe("clientbot-health", runClientBotHealthAudit);

  // Auto-limpeza das mensagens do Telegram com +24h.
  await safe("sweep", () => sweepExpiredTelegramMessages());

  // Poda do histórico de logs (>90 dias): 1x/dia.
  if (await gateOnce(`gate:prune:${day}`)) await safe("prune", pruneOldLogs);

  // LGPD: anonimiza o texto de interações antigas da IA (>retenção): 1x/dia.
  if (await gateOnce(`gate:ai-prune:${day}`)) await safe("ai-prune", pruneOldAiLogs);

  // Custo: alertas de limiar (70/85/95/100%) + auto-pause. gateOnce interno garante 1x/dia.
  await safe("cost-alerts", runCostAlerts);

  // Estoque: re-sync diário do catálogo (anti "carro vendido"), a partir das 4h.
  if (h >= 4 && (await gateOnce(`gate:catalog-sync:${day}`))) await safe("catalog-sync", syncAllCatalogs);

  // Batimento + ping do dead-man's switch externo. Por último: só "vivo" se o
  // ciclo chegou até aqui. Se algo acima travar o ciclo inteiro, o ping não sai
  // e o monitor externo te alerta.
  await safe("heartbeat", recordTick);
}

// Avisa que o agendador ficou fora do ar e voltou (1x por buraco). Deploy normal
// não chega aqui — o safety-net externo mantém o intervalo abaixo do limite.
async function alertDowntime(gapMin: number, prev: Date): Promise<void> {
  const recipients = await recipientsFor("criticalAlerts");
  if (recipients.length === 0) return;
  const key = `downtime:${Math.floor(prev.getTime() / 60000)}`; // dedupe por buraco
  const title = "🟠 Bot ficou fora do ar";
  const body = `O agendador de notificações ficou ~${gapMin}min sem rodar e acabou de voltar.`;
  const tg = `🟠 <b>Bot ficou fora do ar</b>\nO agendador ficou ~${gapMin}min sem rodar e voltou agora.\nSe foi um deploy longo, ok. Se repetir, verifique o serviço no Railway.`;
  for (const r of recipients) {
    await claimDispatch(`${key}:${r.userId}`, r.userId, "downtime",
      { title, body, url: "/clients" }, tg,
      { pushEnabled: r.pushEnabled, telegramEnabled: r.telegramEnabled });
  }
}

async function pruneOldLogs(): Promise<void> {
  const cut = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  await prisma.notificationLog.deleteMany({ where: { createdAt: { lt: cut } } });
}
