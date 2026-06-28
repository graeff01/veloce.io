import { prisma } from "@/lib/prisma";
import { sendClientAlert, waMe, excludedTokens, nameExcluded, botMsg, checkClientBotHealth, type BotCta } from "@/lib/notifications/client-bot";
import { recipientsFor, claimDispatch } from "@/lib/notifications/dispatch";
import { getOrCreatePortal } from "@/lib/notifications/client-portal";
import { getClientDashboard, waitingWithTemp } from "@/lib/notifications/client-report";
import { gateOnce } from "@/lib/notifications/dispatch";
import { esc } from "@/lib/notifications/digest";
import { captureException } from "@/lib/observability";
import { nowParts, wallToInstant } from "@/lib/tz";

// Jobs periódicos por cliente (bot do cliente): SLA escalonado, lead esfriando,
// resumo do dia, resumo de segunda e digest de rajada. Links apontam para FORA
// do sistema (wa.me do lead / painel). Respeita flag, quiet hours, snooze e
// exclusão de nomes (ex.: família do dono).

const TZ = "America/Sao_Paulo";
const BURST_WINDOW_MS = 8 * 60 * 1000;
const BURST_MAX = 3;

async function connIdsFor(clientId: string): Promise<string[]> {
  const conns = await prisma.waConnection.findMany({ where: { clientId }, select: { id: true } });
  return conns.map((c) => c.id);
}
async function portalLink(clientId: string): Promise<string> {
  return (await getOrCreatePortal(clientId)).link;
}

// ── SLA escalonado (15 min importante, 30 min crítico) ───────────────────────
async function runClientSla(clientId: string, day: string, excl: string[]): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const now = Date.now();

  const waiting = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, status: "waiting", firstResponseSec: null, firstInboundAt: { gte: new Date(now - 6 * 3600_000), lt: new Date(now - 15 * 60_000) } },
    select: { contactId: true, firstInboundAt: true, funnelStage: true, contact: { select: { name: true, waId: true } } },
  });
  if (waiting.length === 0) return;

  // Temperatura dos que estão esperando — o quente parado é a MAIOR perda.
  const profs = await prisma.leadProfile.findMany({ where: { contactId: { in: waiting.map((w) => w.contactId) } }, select: { contactId: true, score: true, temperature: true } });
  const pmap = new Map(profs.map((p) => [p.contactId, p]));
  const isHot = (w: { contactId: string; funnelStage: string | null }) => {
    const p = pmap.get(w.contactId);
    return w.funnelStage === "negociacao" || (p?.score ?? 0) >= 70 || p?.temperature === "hot";
  };

  for (const w of waiting) {
    if (nameExcluded(w.contact.name, excl)) continue;
    const mins = Math.round((now - (w.firstInboundAt as Date).getTime()) / 60_000);
    const tier = mins >= 30 ? 30 : 15;
    if (!(await gateOnce(`cb-sla:${day}:${w.contactId}:${tier}`))) continue;
    const nome = (w.contact.name || "").trim() || "Lead";
    const wa = waMe(w.contact.waId);
    const cta: BotCta | null = wa ? { label: "💬 Responder no WhatsApp →", url: wa } : null;
    const hot = isHot(w);
    // Enquadramento de PERDA (aversão à perda) + speed-to-lead.
    const tg = hot
      ? botMsg(`🔥 <b>Lead QUENTE parado há ${mins} min</b>`, [`👤 ${esc(nome)}`, `⚠️ Você está prestes a perder — responda agora.`], cta)
      : tier === 30
        ? botMsg(`🔴 <b>Lead sem resposta há ${mins} min</b>`, [`👤 ${esc(nome)}`, `⚠️ Esfriando — quanto mais demora, menor a chance.`], cta)
        : botMsg(`⏱️ <b>Lead aguardando há ${mins} min</b>`, [`👤 ${esc(nome)}`], cta);
    await sendClientAlert(clientId, "slaAlerts", tg, { urgent: hot || tier === 30 });
  }
}

// ── Briefing da manhã (ritmo fixo, conciso) ──────────────────────────────────
async function runBriefingManha(clientId: string, excl: string[]): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const startToday = wallToInstant(nowParts(TZ).ymd, "00:00", TZ);
  const startOntem = new Date(startToday.getTime() - 24 * 3600_000);

  const [ontemRaw, w] = await Promise.all([
    prisma.waConversation.findMany({ where: { connectionId: { in: connIds }, firstInboundAt: { gte: startOntem, lt: startToday } }, select: { contact: { select: { name: true } } } }),
    waitingWithTemp(connIds, excl),
  ]);
  const ontem = ontemRaw.filter((c) => !nameExcluded(c.contact.name, excl)).length;
  const hot = w.filter((x) => x.temp === "hot").length;

  const tg = botMsg("☀️ <b>Bom dia!</b>", [
    `• 💬 ${ontem} lead${ontem !== 1 ? "s" : ""} ontem`,
    `• ⏳ ${w.length} aguardando agora${hot > 0 ? ` (🔥 ${hot} quente${hot > 1 ? "s" : ""})` : ""}`,
    hot > 0 ? `🔥 Comece pelos quentes — eles esfriam rápido.` : null,
  ], { label: "📊 Painel", url: await portalLink(clientId) });
  await sendClientAlert(clientId, "resumoDiario", tg);
}

// ── Lead esfriando (1x/dia, agrupado) ────────────────────────────────────────
async function runEsfriando(clientId: string, excl: string[]): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const cut = new Date(Date.now() - 2 * 24 * 3600_000);

  const cold = (await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, funnelStage: { in: ["qualificado", "negociacao"] }, lastMessageAt: { lt: cut } },
    select: { contact: { select: { name: true } }, lastMessageAt: true },
    orderBy: { lastMessageAt: "asc" }, take: 12,
  })).filter((c) => !nameExcluded(c.contact.name, excl));
  if (cold.length === 0) return;

  const dias = (d: Date | null) => (d ? Math.floor((Date.now() - d.getTime()) / 86_400_000) : 0);
  const lines = cold.slice(0, 6).map((c) => `• ${esc((c.contact.name || "").trim() || "Lead")} — ${dias(c.lastMessageAt)}d sem retorno`);
  const tg = botMsg(
    "🧊 <b>Leads esfriando</b>",
    [`${cold.length} lead${cold.length > 1 ? "s" : ""} qualificado${cold.length > 1 ? "s" : ""} sem retorno — vale reativar:`, ...lines],
    { label: "📊 Ver no painel", url: await portalLink(clientId) },
  );
  await sendClientAlert(clientId, "leadEsfriando", tg);
}

// ── Resumo do dia (placar + termômetro) ──────────────────────────────────────
async function runResumo(clientId: string, excl: string[]): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const start = wallToInstant(nowParts(TZ).ymd, "00:00", TZ);
  const end = new Date(start.getTime() + 24 * 3600_000);

  const [convsRaw, waitingRaw] = await Promise.all([
    prisma.waConversation.findMany({ where: { connectionId: { in: connIds }, firstInboundAt: { gte: start, lt: end } }, select: { firstResponseSec: true, funnelStage: true, contact: { select: { name: true } } } }),
    prisma.waConversation.findMany({ where: { connectionId: { in: connIds }, status: "waiting", funnelStage: { notIn: ["convertido", "perdido"] } }, select: { contactId: true, funnelStage: true, contact: { select: { name: true } } } }),
  ]);
  const convs = convsRaw.filter((c) => !nameExcluded(c.contact.name, excl));
  const waiting = waitingRaw.filter((c) => !nameExcluded(c.contact.name, excl));

  const leads = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const semResposta = leads - respondidos;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxa = leads > 0 ? Math.round((respondidos / leads) * 100) : 0;

  const profiles = waiting.length ? await prisma.leadProfile.findMany({ where: { contactId: { in: waiting.map((w) => w.contactId) } }, select: { contactId: true, score: true, temperature: true } }) : [];
  const pmap = new Map(profiles.map((p) => [p.contactId, p]));
  let hot = 0, warm = 0, cold = 0;
  for (const w of waiting) {
    const p = pmap.get(w.contactId);
    if (w.funnelStage === "negociacao" || (p?.score ?? 0) >= 70 || p?.temperature === "hot") hot++;
    else if (w.funnelStage === "qualificado" || (p?.score ?? 0) >= 40 || p?.temperature === "warm") warm++;
    else cold++;
  }
  const cta: BotCta = { label: "📊 Painel completo", url: await portalLink(clientId) };
  const tg = leads === 0 && waiting.length === 0
    ? botMsg("🌙 <b>Resumo do dia</b>", ["Dia tranquilo — nenhum lead novo hoje. 🌿"], cta)
    : botMsg("🌙 <b>Resumo do dia</b>", [
        `• 💬 ${leads} lead${leads !== 1 ? "s" : ""}`,
        `• ✅ ${respondidos} respondido${respondidos !== 1 ? "s" : ""} <i>(${taxa}%)</i>`,
        semResposta > 0 ? `• ⏳ ${semResposta} sem resposta` : null,
        `• 🎯 ${conversoes} conversã${conversoes !== 1 ? "ões" : "o"}`,
        avgMin != null ? `• ⏱️ Tempo médio de resposta: ${avgMin} min` : null,
        waiting.length > 0 ? `🌡️ Aguardando agora: 🔥 ${hot} · 🟠 ${warm} · 🧊 ${cold}` : null,
      ], cta);
  await sendClientAlert(clientId, "resumoDiario", tg);
}

// ── Resumo de segunda (placar da semana) ─────────────────────────────────────
async function runResumoSemana(clientId: string): Promise<void> {
  const d = await getClientDashboard(clientId, "week");
  const a = d.atendimento;
  if (a.leads === 0) return;
  const tg = botMsg("📅 <b>Resumo da semana</b>", [
    `• 💬 ${a.leads} leads${a.deltaPct != null ? ` <i>(${a.deltaPct >= 0 ? "+" : ""}${a.deltaPct}% vs. semana anterior)</i>` : ""}`,
    `• ✅ ${a.respondidos} respondidos <i>(${a.taxaResposta}%)</i>`,
    `• 🎯 ${a.conversoes} conversões`,
    a.tempoMedioMin != null ? `• ⏱️ Tempo médio: ${a.tempoMedioMin} min` : null,
  ], { label: "📊 Painel completo", url: await portalLink(clientId) });
  await sendClientAlert(clientId, "resumoDiario", tg);
}

// ── Digest de rajada (pico de novos leads) ───────────────────────────────────
async function runBurstDigest(clientId: string): Promise<void> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return;
  const n = await prisma.waConversation.count({ where: { connectionId: { in: connIds }, firstInboundAt: { gte: new Date(Date.now() - BURST_WINDOW_MS) } } });
  if (n <= BURST_MAX) return;
  const bucket = Math.floor(Date.now() / BURST_WINDOW_MS);
  if (!(await gateOnce(`cb-burst:${bucket}:${clientId}`))) return;
  const tg = botMsg("📥 <b>Pico de leads</b>", [`${n} novos leads nos últimos minutos.`], { label: "📊 Ver no painel", url: await portalLink(clientId) });
  await sendClientAlert(clientId, "novoLead", tg, { urgent: true });
}

// ── Auditoria de saúde dos bots de cliente (avisa o TIME INTERNO) ────────────
// 1x/dia: se o bot de algum cliente está quebrado (token/webhook/sem destinatário)
// ou mudo (sem entregar há +48h apesar de ter destinatário), alerta a agência.
export async function runClientBotHealthAudit(): Promise<void> {
  const internal = await recipientsFor("criticalAlerts");
  if (internal.length === 0) return; // ninguém interno pra avisar
  const bots = await prisma.clientBot.findMany({ where: { active: true }, select: { clientId: true } });
  const day = nowParts(TZ).ymd;
  const staleCut = Date.now() - 48 * 3600_000;

  for (const b of bots) {
    const h = await checkClientBotHealth(b.clientId);
    if (!h) continue;
    const issues = [...h.issues];
    // Mudo: tem destinatário mas não entrega nada há +48h (scheduler/entrega quebrada).
    if (h.recipients > 0 && h.tokenOk && (!h.lastAlertAt || h.lastAlertAt.getTime() < staleCut)) {
      issues.push("sem entregar há +48h");
    }
    if (issues.length === 0) continue;

    const client = await prisma.client.findUnique({ where: { id: b.clientId }, select: { name: true } });
    const name = client?.name ?? b.clientId;
    const title = `⚠️ Bot do cliente com problema — ${name}`;
    const body = `${name}: ${issues.join(", ")}.`;
    const tg = `⚠️ <b>Bot do cliente: ${esc(name)}</b>\n${issues.map((i) => `• ${i}`).join("\n")}`;
    for (const r of internal) {
      await claimDispatch(`clientbot-health:${day}:${b.clientId}:${r.userId}`, r.userId, "clientbot_health",
        { title, body, url: `/clients/${b.clientId}?tab=bot` }, tg,
        { pushEnabled: r.pushEnabled, telegramEnabled: r.telegramEnabled });
    }
  }
}

// ── Orquestrador (chamado pelo scheduler a cada ciclo) ───────────────────────
export async function runClientBotJobs(): Promise<void> {
  const bots = await prisma.clientBot.findMany({ where: { active: true }, select: { clientId: true, slaAlerts: true, leadEsfriando: true, resumoDiario: true, novoLead: true } });
  if (bots.length === 0) return;

  const p = nowParts(TZ);
  const h = Math.floor(p.minutes / 60);
  const day = p.ymd;
  const business = h >= 8 && h < 21;
  const isMonday = p.weekday === 1;

  for (const bot of bots) {
    try {
      const excl = await excludedTokens(bot.clientId);
      if (business && bot.novoLead) await runBurstDigest(bot.clientId);
      if (business && bot.slaAlerts) await runClientSla(bot.clientId, day, excl);
      if (bot.leadEsfriando && h === 9 && (await gateOnce(`cb-esfria:${day}:${bot.clientId}`))) await runEsfriando(bot.clientId, excl);
      if (bot.resumoDiario && h === 18 && (await gateOnce(`cb-resumo:${day}:${bot.clientId}`))) await runResumo(bot.clientId, excl);
      // Ritmo da manhã (9h): segunda = placar da semana; demais dias = briefing curto.
      if (bot.resumoDiario && h === 9 && isMonday && (await gateOnce(`cb-week:${day}:${bot.clientId}`))) await runResumoSemana(bot.clientId);
      if (bot.resumoDiario && h === 9 && !isMonday && (await gateOnce(`cb-brief:${day}:${bot.clientId}`))) await runBriefingManha(bot.clientId, excl);
    } catch (e) {
      captureException(e, { where: "client-bot-jobs", clientId: bot.clientId });
    }
  }
}
