import { prisma, prismaUnscoped } from "@/lib/prisma";
import { computeExecutiveReport } from "@/lib/executive-report";
import { computeMetaAdsView } from "@/lib/meta-ads-view";
import { buildInsights, type Insight } from "@/lib/insights-engine";
import { checkMetaToken } from "@/lib/meta-token";
import { nowParts, wallToInstant } from "@/lib/tz";

const TZ = "America/Sao_Paulo";

// Executa `fn` sobre os itens com no máximo `limit` em voo ao mesmo tempo.
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ── Conteúdo das notificações ────────────────────────────────────────────────
// Tudo derivado do dado real. O resumo diário é da agência (time pequeno).
// Cada mensagem tem duas formas: `body` (push, curto e em texto plano) e
// `telegram` (mensagem rica em HTML, com seções e link).

export interface DigestMessage {
  title: string;
  body: string;       // push: texto plano, curto
  telegram: string;   // Telegram: HTML estruturado (mensagem completa)
  url: string;
  hasContent: boolean;
}

export const APP_URL = (process.env.NEXTAUTH_URL || "https://veloceio-production.up.railway.app").replace(/\/$/, "");

// "Hoje" é o dia-calendário em BRT (não no fuso UTC do servidor Railway).
function todayRange(): { start: Date; end: Date } {
  const start = wallToInstant(nowParts(TZ).ymd, "00:00", TZ);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

function fmtDay(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit" });
}

// Data por extenso em BRT, ex.: "sábado, 14/06".
function fmtLongDate(): string {
  return new Date().toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
}

// Escapa texto dinâmico para o parse_mode=HTML do Telegram (nomes de cliente,
// títulos de tarefa etc. podem conter &, <, >).
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Monta uma seção "título + linhas" (vazia some no join).
function section(title: string, lines: string[]): string {
  return lines.length ? `<b>${title}</b>\n${lines.join("\n")}` : "";
}

// Junta header + seções + rodapé, descartando os blocos vazios.
function assemble(blocks: string[], footerUrl: string): string {
  const body = blocks.filter(Boolean).join("\n\n");
  return `${body}\n\n<a href="${APP_URL}${footerUrl}">Abrir no Veloce →</a>`;
}

// Resumo do dia (agência): tarefas de hoje, reuniões, visitas, atrasos.
export async function buildDailyDigest(): Promise<DigestMessage> {
  const { start, end } = todayRange();
  const now = new Date();

  // Janela de "prazos próximos": amanhã + 2 dias seguintes.
  const soonEnd = new Date(end.getTime() + 3 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const syncCut = new Date(Date.now() - 48 * 60 * 60 * 1000);  // sync parado > 48h
  const waitCut = new Date(Date.now() - 2 * 60 * 60 * 1000);   // lead aguardando > 2h

  const [dueToday, overdue, upcoming, meetings, visits, leadsWaiting, followUps, syncParado, activeClients, clientsWithTasks] = await Promise.all([
    prisma.task.count({ where: { deletedAt: null, dueDate: { gte: start, lt: end }, status: { not: "DONE" } } }),
    prisma.task.count({ where: { deletedAt: null, dueDate: { lt: start }, status: { not: "DONE" } } }),
    prisma.task.findMany({
      where: { deletedAt: null, dueDate: { gte: end, lt: soonEnd }, status: { not: "DONE" } },
      select: { title: true, dueDate: true, client: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 4,
    }),
    prisma.meeting.findMany({
      where: { date: { gte: start, lt: end } },
      select: { title: true, date: true, client: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    // Visit é tenant-guarded; aqui é leitura global (agência) intencional → unscoped.
    prismaUnscoped.visit.findMany({
      where: { scheduledAt: { gte: start, lt: end }, status: { notIn: ["cancelada", "faltou"] } },
      select: { scheduledAt: true, client: { select: { name: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    // Pendências da operação:
    prisma.waConversation.count({ where: { status: "waiting", lastMessageAt: { lt: waitCut } } }),
    prisma.client.findMany({ where: { deletedAt: null, followUpAt: { gte: start, lt: end } }, select: { name: true, followUpNote: true } }),
    prisma.metaConnection.count({ where: { OR: [{ lastAdSyncAt: { lt: syncCut } }, { lastAdSyncAt: null, lastSyncAt: { lt: syncCut } }, { lastAdSyncAt: null, lastSyncAt: null }] } }),
    prisma.client.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true } }),
    prisma.task.findMany({ where: { deletedAt: null, dueDate: { gte: monthStart, lt: monthEnd } }, select: { clientId: true }, distinct: ["clientId"] }),
  ]);

  const withTaskSet = new Set(clientsWithTasks.map((t) => t.clientId));
  const semTarefas = activeClients.filter((c) => !withTaskSet.has(c.id)).length;

  const parts: string[] = [];
  if (dueToday > 0) parts.push(`${dueToday} tarefa${dueToday > 1 ? "s" : ""}`);
  if (meetings.length > 0) parts.push(`${meetings.length} reunião${meetings.length > 1 ? "ões" : ""}`);
  if (visits.length > 0) parts.push(`${visits.length} visita${visits.length > 1 ? "s" : ""}`);

  // Seções do Telegram (HTML).
  const agenda: string[] = [];
  for (const m of meetings.slice(0, 4)) agenda.push(`• ${fmtTime(m.date)} — Reunião <b>${esc(m.client.name)}</b>`);
  for (const v of visits.slice(0, 4)) agenda.push(`• ${fmtTime(v.scheduledAt)} — Visita <b>${esc(v.client.name)}</b>`);

  const prazos = upcoming.map((t) => `• ${fmtDay(t.dueDate)} — ${esc(t.title)} <i>(${esc(t.client.name)})</i>`);

  const pend: string[] = [];
  if (leadsWaiting > 0) pend.push(`• 💬 ${leadsWaiting} lead${leadsWaiting > 1 ? "s" : ""} sem resposta há +2h`);
  if (semTarefas > 0) pend.push(`• 📋 ${semTarefas} cliente${semTarefas > 1 ? "s" : ""} sem tarefas no mês`);
  if (syncParado > 0) pend.push(`• 🔴 ${syncParado} conta${syncParado > 1 ? "s" : ""} Meta com sync parado`);

  const follow = followUps.slice(0, 5).map((f) => `• <b>${esc(f.name)}</b>${f.followUpNote ? ` — ${esc(f.followUpNote)}` : ""}`);

  const hasContent =
    dueToday > 0 || meetings.length > 0 || visits.length > 0 || overdue > 0 ||
    upcoming.length > 0 || pend.length > 0 || followUps.length > 0;

  // Push: texto plano, curto.
  const pushParts: string[] = [];
  if (parts.length) pushParts.push(parts.join(", ") + " hoje");
  if (overdue > 0) pushParts.push(`${overdue} em atraso`);
  if (leadsWaiting > 0) pushParts.push(`${leadsWaiting} lead${leadsWaiting > 1 ? "s" : ""} esperando`);
  const body = hasContent ? pushParts.join(" · ") : "Sem compromissos ou pendências para hoje. Bom trabalho!";

  // Telegram: estruturado.
  const header = `☀️ <b>Resumo do dia</b>\n<i>${fmtLongDate()}</i>`;
  let telegram: string;
  if (hasContent) {
    telegram = assemble([
      header,
      section("📋 Hoje", parts.length ? [parts.join(" · ")] : []),
      section("🕘 Agenda", agenda),
      section("⚠️ Atrasos", overdue > 0 ? [`${overdue} tarefa${overdue > 1 ? "s" : ""} em atraso`] : []),
      section("📅 Prazos próximos", prazos),
      section("🔎 Pendências", pend),
      section("📞 Follow-up hoje", follow),
    ], "/today");
  } else {
    telegram = `${header}\n\nSem compromissos ou pendências para hoje. Bom trabalho! 🎉`;
  }

  return { title: "☀️ Resumo do dia", body, telegram, url: "/today", hasContent };
}

// Alertas críticos por cliente (reusa o motor de insights do co-piloto).
export interface CriticalAlert {
  clientId: string;
  clientName: string;
  insight: Insight;
  dedupeKey: string;
}

export async function buildCriticalAlerts(): Promise<CriticalAlert[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dayKey = `${year}-${String(month).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Só clientes ativos com conexão Meta (a base dos insights de mídia).
  const conns = await prisma.metaConnection.findMany({ select: { clientId: true } });
  const out: CriticalAlert[] = [];

  for (const { clientId } of conns) {
    try {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 1);
      const prevStart = new Date(year, month - 2, 1);
      const [report, adsCur, adsPrev] = await Promise.all([
        computeExecutiveReport(clientId, year, month),
        computeMetaAdsView(clientId, start, end),
        computeMetaAdsView(clientId, prevStart, start),
      ]);
      if (!report) continue;
      const insights = buildInsights({ report, adsCur, adsPrev }).filter((i) => i.severity === "critical");
      for (const insight of insights) {
        out.push({
          clientId,
          clientName: report.clientName,
          insight,
          // Idempotência: mesmo alerta, mesmo cliente, mesmo dia → 1 envio só.
          dedupeKey: `critical:${dayKey}:${clientId}:${insight.id}`,
        });
      }
    } catch {
      // um cliente com erro não derruba os demais
    }
  }
  return out;
}


// ── Token Meta expirando / inválido (proativo) ───────────────────────────────
export interface TokenAlert { clientId: string; clientName: string; daysLeft: number | null; invalid: boolean; dedupeKey: string }

export async function buildTokenExpiryAlerts(): Promise<TokenAlert[]> {
  const dayKey = nowParts(TZ).ymd;
  const conns = await prisma.metaConnection.findMany({ select: { clientId: true, accessToken: true, client: { select: { name: true } } } });

  // Checa os tokens em paralelo com limite de concorrência (a Graph API é lenta;
  // sequencial trava com muitos clientes).
  const results = await mapLimit(conns, 5, async (c): Promise<TokenAlert | null> => {
    const info = await checkMetaToken(c.accessToken).catch(() => null);
    if (!info) return null;
    if (!info.valid) {
      return { clientId: c.clientId, clientName: c.client.name, daysLeft: null, invalid: true, dedupeKey: `token-invalid:${dayKey}:${c.clientId}` };
    }
    if (info.expiresAt) {
      const days = Math.floor((info.expiresAt.getTime() - Date.now()) / 86_400_000);
      if (days <= 5) return { clientId: c.clientId, clientName: c.client.name, daysLeft: days, invalid: false, dedupeKey: `token-expiry:${dayKey}:${c.clientId}` };
    }
    return null;
  });
  return results.filter((r): r is TokenAlert => r !== null);
}

// ── Resumo de fim de dia (placar) ────────────────────────────────────────────
export async function buildEndOfDaySummary(): Promise<DigestMessage> {
  const { start, end } = todayRange();
  const convs = await prisma.waConversation.findMany({
    where: { firstInboundAt: { gte: start, lt: end } },
    select: { firstResponseSec: true, funnelStage: true },
  });
  const leads = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.filter((c): c is typeof c & { firstResponseSec: number } => c.firstResponseSec != null).map((c) => c.firstResponseSec);
  const avgMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxa = leads > 0 ? Math.round((respondidos / leads) * 100) : 0;

  const body = `${leads} lead${leads !== 1 ? "s" : ""}, ${respondidos} respondido${respondidos !== 1 ? "s" : ""}, ${conversoes} conversã${conversoes !== 1 ? "ões" : "o"}${avgMin != null ? ` · ${avgMin}min médio` : ""}.`;

  const placar = [
    `• 💬 ${leads} lead${leads !== 1 ? "s" : ""} recebido${leads !== 1 ? "s" : ""}`,
    `• ✅ ${respondidos} respondido${respondidos !== 1 ? "s" : ""} <i>(${taxa}%)</i>`,
    `• 🎯 ${conversoes} conversã${conversoes !== 1 ? "ões" : "o"}`,
    ...(avgMin != null ? [`• ⏱️ Tempo médio de resposta: ${avgMin}min`] : []),
  ];
  const telegram = assemble([`🌙 <b>Resumo de fim de dia</b>\n<i>${fmtLongDate()}</i>`, section("WhatsApp hoje", placar)], "/today");

  return { title: "🌙 Resumo de fim de dia", body, telegram, url: "/today", hasContent: leads > 0 };
}

// ── Relatórios mensais (dia 1) ───────────────────────────────────────────────
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export async function buildMonthlyReportMessage(): Promise<{ title: string; pushBody: string; telegramBody: string; url: string } | null> {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = prev.getFullYear();
  const m = prev.getMonth() + 1;
  const base = (process.env.NEXTAUTH_URL || "https://veloceio-production.up.railway.app").replace(/\/$/, "");
  const clients = await prisma.client.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  if (clients.length === 0) return null;
  const lines = clients.map((c) => `• <a href="${base}/api/clients/${c.id}/executive-report?year=${y}&month=${m}">${c.name}</a>`);
  return {
    title: `📊 Relatórios de ${MONTHS[m - 1]}`,
    pushBody: `Relatórios executivos de ${MONTHS[m - 1]} prontos (${clients.length} clientes). Abra no Veloce.`,
    telegramBody: `<b>📊 Relatórios de ${MONTHS[m - 1]} prontos</b>\n${lines.join("\n")}`,
    url: "/clients",
  };
}

// ── Saúde do envio (falhas que estouraram o orçamento de tentativas) ──────────
// Lê o NotificationLog: o que desistiu (status=failed, attempts>=MAX) nas últimas
// 26h. Visibilidade — dá para avisar a operação que algo não está saindo.
export async function getFailureStats(maxAttempts: number): Promise<{ total: number; byType: Record<string, number> }> {
  const since = new Date(Date.now() - 26 * 60 * 60 * 1000);
  const rows = await prisma.notificationLog.findMany({
    where: { status: "failed", attempts: { gte: maxAttempts }, createdAt: { gte: since } },
    select: { type: true },
  });
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type] = (byType[r.type] ?? 0) + 1;
  return { total: rows.length, byType };
}

export async function buildFailureAlert(maxAttempts: number): Promise<DigestMessage | null> {
  const { total, byType } = await getFailureStats(maxAttempts);
  if (total === 0) return null;
  const detalhe = Object.entries(byType).map(([t, n]) => `• ${esc(t)}: ${n}`);
  const body = `${total} notificação${total > 1 ? "ões" : ""} não saiu nas últimas 24h. Verifique a conexão em Configurações.`;
  const telegram = assemble([
    "⚠️ <b>Notificações com falha</b>",
    `${total} notificação${total > 1 ? "ões" : ""} esgotou as tentativas nas últimas 24h:`,
    section("Por tipo", detalhe),
    "<i>Verifique a conexão do Telegram/push em Configurações.</i>",
  ], "/settings");
  return { title: "⚠️ Notificações com falha", body, telegram, url: "/settings", hasContent: true };
}
