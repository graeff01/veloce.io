import { prisma } from "@/lib/prisma";
import { esc, APP_URL } from "@/lib/notifications/digest";
import { nowParts, wallToInstant } from "@/lib/tz";

// Read-model client-safe: respostas sob demanda do bot do cliente. Só lê dado que
// o cliente pode ver (leads/atendimento daquele clientId) — embrião da camada
// client-facing que o dashboard vai reusar.

const TZ = "America/Sao_Paulo";

async function connIdsFor(clientId: string): Promise<string[]> {
  const conns = await prisma.waConnection.findMany({ where: { clientId }, select: { id: true } });
  return conns.map((c) => c.id);
}

type Temp = "hot" | "warm" | "cold";
function tempOf(funnelStage: string | null, score: number | null, temperature: string | null): Temp {
  if (funnelStage === "negociacao" || (score ?? 0) >= 70 || temperature === "hot") return "hot";
  if (funnelStage === "qualificado" || (score ?? 0) >= 40 || temperature === "warm") return "warm";
  return "cold";
}

// Leads aguardando agora, com temperatura de cada um (funil grátis + score IA).
async function waitingWithTemp(connIds: string[]) {
  const waiting = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, status: "waiting", funnelStage: { notIn: ["convertido", "perdido"] } },
    select: { contactId: true, funnelStage: true, lastInboundAt: true, contact: { select: { name: true } } },
    orderBy: { lastInboundAt: "asc" },
  });
  if (waiting.length === 0) return [];
  const profiles = await prisma.leadProfile.findMany({
    where: { contactId: { in: waiting.map((w) => w.contactId) } },
    select: { contactId: true, score: true, temperature: true },
  });
  const pmap = new Map(profiles.map((p) => [p.contactId, p]));
  return waiting.map((w) => {
    const p = pmap.get(w.contactId);
    return { name: (w.contact.name || "").trim() || "Lead", lastInboundAt: w.lastInboundAt, temp: tempOf(w.funnelStage, p?.score ?? null, p?.temperature ?? null) };
  });
}

function hoursAgo(d: Date | null): string {
  if (!d) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 60) return `há ${min}min`;
  return `há ${Math.floor(min / 60)}h`;
}

// /status — quantos aguardando agora + termômetro.
export async function statusNow(clientId: string): Promise<string> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return "Sem WhatsApp conectado ainda.";
  const w = await waitingWithTemp(connIds);
  if (w.length === 0) return "🔔 <b>Status agora</b>\nNenhum lead aguardando resposta. 👌";
  const hot = w.filter((x) => x.temp === "hot").length;
  const warm = w.filter((x) => x.temp === "warm").length;
  const cold = w.filter((x) => x.temp === "cold").length;
  return `🔔 <b>Status agora</b>\n${w.length} lead${w.length > 1 ? "s" : ""} aguardando resposta\n🌡️ 🔥 ${hot} · 🟠 ${warm} · 🧊 ${cold}`;
}

// /quentes — leads quentes aguardando.
export async function quentesAguardando(clientId: string): Promise<string> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return "Sem WhatsApp conectado ainda.";
  const hot = (await waitingWithTemp(connIds)).filter((x) => x.temp === "hot");
  if (hot.length === 0) return "🔥 <b>Leads quentes</b>\nNenhum lead quente aguardando agora.";
  const lines = hot.slice(0, 10).map((x) => `• <b>${esc(x.name)}</b> ${hoursAgo(x.lastInboundAt)}`);
  return `🔥 <b>Leads quentes aguardando</b> (${hot.length})\n${lines.join("\n")}\n\n<a href="${APP_URL}/clients/${clientId}?tab=leads">Abrir conversas →</a>`;
}

// /resultados — placar de hoje.
export async function resultadosHoje(clientId: string): Promise<string> {
  const connIds = await connIdsFor(clientId);
  if (connIds.length === 0) return "Sem WhatsApp conectado ainda.";
  const start = wallToInstant(nowParts(TZ).ymd, "00:00", TZ);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const convs = await prisma.waConversation.findMany({
    where: { connectionId: { in: connIds }, firstInboundAt: { gte: start, lt: end } },
    select: { firstResponseSec: true, funnelStage: true },
  });
  const leads = convs.length;
  if (leads === 0) return "📊 <b>Hoje</b>\nNenhum lead novo ainda hoje.";
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxa = Math.round((respondidos / leads) * 100);
  return (
    `📊 <b>Hoje</b>\n` +
    `• 💬 ${leads} lead${leads > 1 ? "s" : ""}\n` +
    `• ✅ ${respondidos} respondido${respondidos !== 1 ? "s" : ""} <i>(${taxa}%)</i>\n` +
    `• 🎯 ${conversoes} conversã${conversoes !== 1 ? "ões" : "o"}` +
    (avgMin != null ? `\n• ⏱️ Tempo médio: ${avgMin} min` : "")
  );
}

// ── Read-model do DASHBOARD (client-safe) ────────────────────────────────────
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export interface ClientDashboard {
  generatedAt: string;
  periodLabel: string;
  atendimento: { leads: number; leadsPrev: number; deltaPct: number | null; respondidos: number; taxaResposta: number; tempoMedioMin: number | null; conversoes: number };
  termometro: { hot: number; warm: number; cold: number; total: number };
  midia: { spend: number; leads: number; cpl: number | null } | null;
}

export async function getClientDashboard(clientId: string): Promise<ClientDashboard> {
  const p = nowParts(TZ);
  const [y, m] = p.ymd.split("-").map(Number);
  const mm = (yy: number, mo: number) => wallToInstant(`${yy}-${String(mo).padStart(2, "0")}-01`, "00:00", TZ);
  const monthStart = mm(y, m);
  const now = new Date();
  const span = now.getTime() - monthStart.getTime();
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevStart = mm(prevY, prevM);
  const prevEnd = new Date(prevStart.getTime() + span); // mesmo nº de dias do mês (comparável)

  const connIds = await connIdsFor(clientId);

  // Atendimento (este mês até agora) + leads do período comparável do mês passado.
  const [convs, prevLeads, waiting, metaConn] = await Promise.all([
    connIds.length ? prisma.waConversation.findMany({
      where: { connectionId: { in: connIds }, firstInboundAt: { gte: monthStart, lt: now } },
      select: { firstResponseSec: true, funnelStage: true },
    }) : Promise.resolve([]),
    connIds.length ? prisma.waConversation.count({ where: { connectionId: { in: connIds }, firstInboundAt: { gte: prevStart, lt: prevEnd } } }) : Promise.resolve(0),
    waitingWithTemp(connIds),
    prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }),
  ]);

  const leads = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((s): s is number => s != null);
  const tempoMedioMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxaResposta = leads > 0 ? Math.round((respondidos / leads) * 100) : 0;
  const deltaPct = prevLeads > 0 ? Math.round(((leads - prevLeads) / prevLeads) * 100) : null;

  const hot = waiting.filter((w) => w.temp === "hot").length;
  const warm = waiting.filter((w) => w.temp === "warm").length;
  const cold = waiting.filter((w) => w.temp === "cold").length;

  // Mídia (se tem conexão Meta): gasto do mês + leads reais de anúncio + CPL.
  let midia: ClientDashboard["midia"] = null;
  if (metaConn) {
    const wa = connIds.length ? await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } }) : null;
    const [spendAgg, adLeads] = await Promise.all([
      prisma.metaAdInsight.aggregate({ _sum: { spend: true }, where: { connectionId: metaConn.id, date: { gte: monthStart } } }),
      wa ? prisma.waLead.count({ where: { connectionId: wa.id, enteredAt: { gte: monthStart, lt: now } } }) : Promise.resolve(0),
    ]);
    const spend = spendAgg._sum.spend ?? 0;
    midia = { spend, leads: adLeads, cpl: adLeads > 0 ? spend / adLeads : null };
  }

  return {
    generatedAt: now.toISOString(),
    periodLabel: `${MONTHS[m - 1]} ${y}`,
    atendimento: { leads, leadsPrev: prevLeads, deltaPct, respondidos, taxaResposta, tempoMedioMin, conversoes },
    termometro: { hot, warm, cold, total: waiting.length },
    midia,
  };
}

export function ajuda(brandName: string | null): string {
  const marca = brandName?.trim() ? ` da <b>${esc(brandName.trim())}</b>` : "";
  return (
    `🤖 <b>Assistente${marca}</b>\nComandos disponíveis:\n` +
    `• /status — leads aguardando agora\n` +
    `• /quentes — leads quentes na fila\n` +
    `• /resultados — placar de hoje\n` +
    `• /painel — abrir o painel completo\n` +
    `• /ajuda — ver esta lista`
  );
}
