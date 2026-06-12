import { prisma, prismaUnscoped } from "@/lib/prisma";
import { computeExecutiveReport } from "@/lib/executive-report";
import { computeMetaAdsView } from "@/lib/meta-ads-view";
import { buildInsights, type Insight } from "@/lib/insights-engine";

// ── Conteúdo das notificações ────────────────────────────────────────────────
// Tudo derivado do dado real. O resumo diário é da agência (time pequeno).

export interface DigestMessage {
  title: string;
  body: string;
  url: string;
  hasContent: boolean;
}

function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(d: Date): string {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// Resumo do dia (agência): tarefas de hoje, reuniões, visitas, atrasos.
export async function buildDailyDigest(): Promise<DigestMessage> {
  const { start, end } = todayRange();
  const now = new Date();

  // Janela de "prazos próximos": amanhã + 2 dias seguintes.
  const soonEnd = new Date(end.getTime() + 3 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const waitCut = new Date(Date.now() - 2 * 60 * 60 * 1000);   // lead aguardando > 2h
  const syncCut = new Date(Date.now() - 48 * 60 * 60 * 1000);  // sync parado > 48h

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
  if (dueToday > 0) parts.push(`${dueToday} tarefa${dueToday > 1 ? "s" : ""} para hoje`);
  if (meetings.length > 0) parts.push(`${meetings.length} reunião${meetings.length > 1 ? "ões" : ""}`);
  if (visits.length > 0) parts.push(`${visits.length} visita${visits.length > 1 ? "s" : ""}`);

  const lines: string[] = [];
  if (parts.length) lines.push(`Hoje: ${parts.join(", ")}.`);
  for (const m of meetings.slice(0, 3)) lines.push(`• ${fmtTime(m.date)} — Reunião ${m.client.name}`);
  for (const v of visits.slice(0, 3)) lines.push(`• ${fmtTime(v.scheduledAt)} — Visita ${v.client.name}`);
  if (overdue > 0) lines.push(`⚠️ ${overdue} tarefa${overdue > 1 ? "s" : ""} em atraso.`);
  if (upcoming.length > 0) {
    lines.push(`\n📅 Prazos próximos:`);
    for (const t of upcoming) lines.push(`• ${fmtDay(t.dueDate)} — ${t.title} (${t.client.name})`);
  }

  // Pendências da operação (só aparece o que existir).
  const pend: string[] = [];
  if (leadsWaiting > 0) pend.push(`💬 ${leadsWaiting} lead${leadsWaiting > 1 ? "s" : ""} sem resposta há +2h`);
  if (semTarefas > 0) pend.push(`📋 ${semTarefas} cliente${semTarefas > 1 ? "s" : ""} sem tarefas no mês`);
  if (syncParado > 0) pend.push(`🔴 ${syncParado} conta${syncParado > 1 ? "s" : ""} Meta com sync parado`);
  if (pend.length > 0) {
    lines.push(`\n🔎 Pendências:`);
    for (const p of pend) lines.push(`• ${p}`);
  }
  if (followUps.length > 0) {
    lines.push(`\n📞 Follow-up hoje:`);
    for (const f of followUps.slice(0, 4)) lines.push(`• ${f.name}${f.followUpNote ? ` — ${f.followUpNote}` : ""}`);
  }

  const hasContent =
    dueToday > 0 || meetings.length > 0 || visits.length > 0 || overdue > 0 ||
    upcoming.length > 0 || pend.length > 0 || followUps.length > 0;

  return {
    title: "☀️ Resumo do dia",
    body: hasContent ? lines.join("\n") : "Sem compromissos ou pendências para hoje. Bom trabalho!",
    url: "/today",
    hasContent,
  };
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

// ── Alerta intraday: leads sem resposta há +2h ───────────────────────────────
export interface PendingLeadAlert {
  conversationId: string;
  clientName: string;
  contactName: string;
  waitingHours: number;
  dedupeKey: string;
}

export async function buildPendingLeadAlerts(): Promise<PendingLeadAlert[]> {
  const waitCut = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const convs = await prisma.waConversation.findMany({
    where: { status: "waiting", lastMessageAt: { lt: waitCut } },
    select: {
      id: true,
      lastMessageAt: true,
      contact: { select: { name: true, waId: true } },
      connection: { select: { client: { select: { name: true } } } },
    },
    orderBy: { lastMessageAt: "asc" },
    take: 50,
  });

  return convs.map((c) => ({
    conversationId: c.id,
    clientName: c.connection.client.name,
    contactName: c.contact.name ?? `+${c.contact.waId}`,
    waitingHours: c.lastMessageAt ? Math.floor((Date.now() - c.lastMessageAt.getTime()) / 3_600_000) : 2,
    // Idempotência: 1 alerta por conversa por dia (não fica repetindo o mesmo lead).
    dedupeKey: `lead-waiting:${dayKey}:${c.id}`,
  }));
}
