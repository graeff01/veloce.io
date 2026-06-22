import { prisma } from "@/lib/prisma";
import { sendClientAlert } from "@/lib/notifications/client-bot";
import { gateOnce } from "@/lib/notifications/dispatch";
import { esc, APP_URL } from "@/lib/notifications/digest";
import { captureException } from "@/lib/observability";
import { nowParts, wallToInstant } from "@/lib/tz";

// Jobs periódicos por cliente que enviam pelo BOT DO CLIENTE:
//   • SLA de 1ª resposta escalonado (15 e 30 min) — em horário comercial
//   • Lead esfriando (1x/dia, agrupado)
//   • Resumo do dia (1x/dia, placar do atendimento)
// O sendClientAlert respeita a flag e o quiet hours de cada cliente.

const TZ = "America/Sao_Paulo";

async function connIdsFor(clientId: string): Promise<string[]> {
  const conns = await prisma.waConnection.findMany({ where: { clientId }, select: { id: true } });
  return conns.map((c) => c.id);
}

function leadsLink(clientId: string): string {
  return `<a href="${APP_URL}/clients/${clientId}?tab=leads">Responder →</a>`;
}

// ── SLA escalonado (15 min importante, 30 min crítico) ───────────────────────
// "Para ao responder": o filtro firstResponseSec=null tira o lead assim que
// alguém responde. Cada degrau dispara 1x (gate por contato+degrau). O degrau de
// 5 min é "leve" e fica só no resumo do dia — não pinga, para não poluir.
async function runClientSla(clientId: string, day: string): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const now = Date.now();

  const waiting = await prisma.waConversation.findMany({
    where: {
      connectionId: { in: connIds },
      status: "waiting",
      firstResponseSec: null,
      firstInboundAt: { gte: new Date(now - 6 * 3600_000), lt: new Date(now - 15 * 60_000) },
    },
    select: { contactId: true, firstInboundAt: true, contact: { select: { name: true } } },
  });

  for (const w of waiting) {
    const mins = Math.round((now - (w.firstInboundAt as Date).getTime()) / 60_000);
    const tier = mins >= 30 ? 30 : 15;
    if (!(await gateOnce(`cb-sla:${day}:${w.contactId}:${tier}`))) continue;
    const nome = (w.contact.name || "").trim() || "Lead";
    const urgent = tier === 30;
    const tg = urgent
      ? `🔴 <b>Lead SEM RESPOSTA há ${mins} min</b>\n👤 ${esc(nome)}\n⚠️ Risco de esfriar — responda agora.\n\n${leadsLink(clientId)}`
      : `⚠️ <b>Lead aguardando há ${mins} min</b>\n👤 ${esc(nome)}\n\n${leadsLink(clientId)}`;
    await sendClientAlert(clientId, "slaAlerts", tg, { urgent });
  }
}

// ── Lead esfriando (1x/dia, agrupado) ────────────────────────────────────────
async function runEsfriando(clientId: string): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const cut = new Date(Date.now() - 2 * 24 * 3600_000);

  const cold = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, funnelStage: { in: ["qualificado", "negociacao"] }, lastMessageAt: { lt: cut } },
    select: { contact: { select: { name: true } }, lastMessageAt: true },
    orderBy: { lastMessageAt: "asc" },
    take: 8,
  });
  if (cold.length === 0) return;

  const dias = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : 0);
  const lines = cold.slice(0, 6).map((c) => `• ${esc((c.contact.name || "").trim() || "Lead")} — ${dias(c.lastMessageAt)}d sem retorno`);
  const tg =
    `🧊 <b>Leads esfriando</b>\n` +
    `${cold.length} lead${cold.length > 1 ? "s" : ""} qualificado${cold.length > 1 ? "s" : ""} sem retorno — vale reativar:\n` +
    lines.join("\n") +
    `\n\n<a href="${APP_URL}/clients/${clientId}?tab=leads">Ver leads →</a>`;
  await sendClientAlert(clientId, "leadEsfriando", tg);
}

// ── Resumo do dia (placar do atendimento) ────────────────────────────────────
async function runResumo(clientId: string): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const start = wallToInstant(nowParts(TZ).ymd, "00:00", TZ);
  const end = new Date(start.getTime() + 24 * 3600_000);

  // Placar do dia + termômetro da carteira (quem está aguardando agora, por temperatura).
  const [convs, waiting] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId: { in: connIds }, firstInboundAt: { gte: start, lt: end } },
      select: { firstResponseSec: true, funnelStage: true },
    }),
    prisma.waConversation.findMany({
      where: { connectionId: { in: connIds }, status: "waiting", funnelStage: { notIn: ["convertido", "perdido"] } },
      select: { contactId: true, funnelStage: true },
    }),
  ]);

  const leads = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const semResposta = leads - respondidos;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxa = leads > 0 ? Math.round((respondidos / leads) * 100) : 0;

  // Termômetro: temperatura por lead (funil grátis + score da IA quando houver).
  const profiles = waiting.length
    ? await prisma.leadProfile.findMany({ where: { contactId: { in: waiting.map((w) => w.contactId) } }, select: { contactId: true, score: true, temperature: true } })
    : [];
  const pmap = new Map(profiles.map((p) => [p.contactId, p]));
  let hot = 0, warm = 0, cold = 0;
  for (const w of waiting) {
    const p = pmap.get(w.contactId);
    if (w.funnelStage === "negociacao" || (p?.score ?? 0) >= 70 || p?.temperature === "hot") hot++;
    else if (w.funnelStage === "qualificado" || (p?.score ?? 0) >= 40 || p?.temperature === "warm") warm++;
    else cold++;
  }

  const termometro = waiting.length > 0 ? `\n🌡️ Aguardando agora: 🔥 ${hot} · 🟠 ${warm} · 🧊 ${cold}` : "";

  const tg = leads === 0 && waiting.length === 0
    ? `🌙 <b>Resumo do dia</b>\nDia tranquilo — nenhum lead novo hoje. 🌿`
    : `🌙 <b>Resumo do dia</b>\n` +
      `• 💬 ${leads} lead${leads !== 1 ? "s" : ""}\n` +
      `• ✅ ${respondidos} respondido${respondidos !== 1 ? "s" : ""} <i>(${taxa}%)</i>` +
      (semResposta > 0 ? `\n• ⏳ ${semResposta} sem resposta` : "") +
      `\n• 🎯 ${conversoes} conversã${conversoes !== 1 ? "ões" : "o"}` +
      (avgMin != null ? `\n• ⏱️ Tempo médio de resposta: ${avgMin} min` : "") +
      termometro;
  await sendClientAlert(clientId, "resumoDiario", tg);
}

// ── Orquestrador (chamado pelo scheduler a cada ciclo) ───────────────────────
export async function runClientBotJobs(): Promise<void> {
  const bots = await prisma.clientBot.findMany({
    where: { active: true },
    select: { clientId: true, slaAlerts: true, leadEsfriando: true, resumoDiario: true },
  });
  if (bots.length === 0) return;

  const p = nowParts(TZ);
  const h = Math.floor(p.minutes / 60);
  const day = p.ymd;
  const business = h >= 8 && h < 21;

  for (const bot of bots) {
    try {
      if (business && bot.slaAlerts) await runClientSla(bot.clientId, day);
      if (bot.leadEsfriando && h === 9 && (await gateOnce(`cb-esfria:${day}:${bot.clientId}`))) await runEsfriando(bot.clientId);
      if (bot.resumoDiario && h === 18 && (await gateOnce(`cb-resumo:${day}:${bot.clientId}`))) await runResumo(bot.clientId);
    } catch (e) {
      captureException(e, { where: "client-bot-jobs", clientId: bot.clientId });
    }
  }
}
