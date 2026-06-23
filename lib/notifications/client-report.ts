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

export function ajuda(brandName: string | null): string {
  const marca = brandName?.trim() ? ` da <b>${esc(brandName.trim())}</b>` : "";
  return (
    `🤖 <b>Assistente${marca}</b>\nComandos disponíveis:\n` +
    `• /status — leads aguardando agora\n` +
    `• /quentes — leads quentes na fila\n` +
    `• /resultados — placar de hoje\n` +
    `• /ajuda — ver esta lista`
  );
}
