import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { excludedTokens, nameExcluded } from "@/lib/notifications/client-bot";
import { fmtDuration } from "@/lib/wa-metrics";
import {
  buildAttendanceReport,
  type AttendanceReportData,
  type AttendanceBlock,
  type AttendanceLead,
} from "@/components/clients/attendance-report-document";

export const runtime = "nodejs";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const num = (v: number) => v.toLocaleString("pt-BR");
const HOUR = 3_600_000;
const COLD_HOURS = 24; // sem atividade há mais de 24h = lead frio (oportunidade perdida)

// GET /api/clients/[id]/whatsapp/attendance-report?year=&month=  → PDF de diagnóstico
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  const [client, conn] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { name: true } }),
    prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true } }),
  ]);
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  if (!conn) return NextResponse.json({ error: "Cliente sem WhatsApp conectado" }, { status: 404 });

  const [convsRaw, adLeadsRaw, excl] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId: conn.id, firstInboundAt: { gte: start, lt: end } },
      select: { contactId: true, firstInboundAt: true, firstResponseSec: true, funnelStage: true, lastMessageAt: true, contact: { select: { name: true, waId: true } } },
    }),
    prisma.waLead.findMany({
      where: { connectionId: conn.id, enteredAt: { gte: start, lt: end } },
      select: { contactId: true, name: true, waId: true, enteredAt: true },
    }),
    excludedTokens(id),
  ]);
  // Remove nomes excluídos (donos/diretoria/família — não são leads).
  const convs = convsRaw.filter((c) => !nameExcluded(c.contact.name, excl));
  const adLeads = adLeadsRaw.filter((l) => !nameExcluded(l.name, excl));
  const adContactIds = new Set(adLeads.map((l) => l.contactId));
  const convContactIds = new Set(convs.map((c) => c.contactId));

  // ── Universo único de leads (coerente com o Painel) ──────────────────────────
  // = conversas ao vivo + leads de anúncio importados (sem conversa). Cada um
  // vira um Lead com origem, tempo de 1ª resposta e atividade.
  interface Lead {
    name: string;
    isAd: boolean;
    responseSec: number | null;          // null = sem resposta
    startedAt: Date | null;              // 1ª mensagem (firstInboundAt ou enteredAt)
    lastActivityAt: Date | null;         // última mensagem conhecida
    funnelStage: string | null;
  }

  const nameOfConv = (c: (typeof convs)[number]) => (c.contact.name || "").trim() || `Lead ···${c.contact.waId.slice(-4)}`;

  const leads: Lead[] = convs.map((c) => ({
    name: nameOfConv(c),
    isAd: adContactIds.has(c.contactId),
    responseSec: c.firstResponseSec,
    startedAt: c.firstInboundAt,
    lastActivityAt: c.lastMessageAt ?? c.firstInboundAt,
    funnelStage: c.funnelStage,
  }));
  // Leads de anúncio importados (sem conversa ao vivo) — entram como sem resposta.
  for (const l of adLeads) {
    if (convContactIds.has(l.contactId)) continue;
    leads.push({
      name: (l.name || "").trim() || `Lead ···${l.waId.slice(-4)}`,
      isAd: true,
      responseSec: null,
      startedAt: l.enteredAt,
      lastActivityAt: l.enteredAt,
      funnelStage: null,
    });
  }

  // ── Blocos de KPI (geral + anúncio) ──────────────────────────────────────────
  function block(rows: Lead[]): AttendanceBlock {
    const total = rows.length;
    const respondidos = rows.filter((r) => r.responseSec != null).length;
    const times = rows.map((r) => r.responseSec).filter((x): x is number => x != null);
    return {
      leads: total,
      respondidos,
      taxaResposta: total > 0 ? Math.round((respondidos / total) * 100) : 0,
      semResposta: total - respondidos,
      tempoMedioSec: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      conversoes: rows.filter((r) => r.funnelStage === "convertido").length,
    };
  }
  const geral = block(leads);
  const adRows = leads.filter((l) => l.isAd);
  const ads = adRows.length > 0 ? block(adRows) : null;

  // ── Distribuição do tempo de resposta (todos os leads) ──────────────────────
  const buckets = { upTo5: 0, upTo30: 0, upTo60: 0, over60: 0, sem: 0 };
  for (const l of leads) {
    const sec = l.responseSec;
    if (sec == null) buckets.sem++;
    else if (sec <= 300) buckets.upTo5++;
    else if (sec <= 1800) buckets.upTo30++;
    else if (sec <= 3600) buckets.upTo60++;
    else buckets.over60++;
  }
  const over1hCount = buckets.over60;

  // ── Listas de auditoria (completas) ─────────────────────────────────────────
  const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—");
  const origin = (l: Lead): "ad" | "organic" => (l.isAd ? "ad" : "organic");
  const waitingH = (l: Lead) => (l.startedAt ? Math.floor((now.getTime() - l.startedAt.getTime()) / HOUR) : 0);

  // Sem resposta — todos, do que espera há mais tempo para o mais recente.
  const noResponseList: AttendanceLead[] = leads
    .filter((l) => l.responseSec == null)
    .sort((a, b) => (a.startedAt?.getTime() ?? 0) - (b.startedAt?.getTime() ?? 0))
    .map((l) => {
      const h = waitingH(l);
      return { name: l.name, origin: origin(l), metric: h >= 24 ? `há ${Math.floor(h / 24)}d` : `há ${h}h`, dateLabel: fmtDate(l.startedAt) };
    });

  // Respondidos só depois de mais de 1 hora — todos, do mais lento para o mais rápido.
  const slowList: AttendanceLead[] = leads
    .filter((l) => l.responseSec != null && l.responseSec > 3600)
    .sort((a, b) => b.responseSec! - a.responseSec!)
    .map((l) => ({ name: l.name, origin: origin(l), metric: fmtDuration(l.responseSec), dateLabel: fmtDate(l.startedAt) }));

  // Oportunidades perdidas pela demora (critério conservador): nunca respondido OU
  // respondido depois de +1h, que NÃO converteu e está frio (sem atividade há +24h).
  const coldCut = now.getTime() - COLD_HOURS * HOUR;
  const lostList: AttendanceLead[] = leads
    .filter((l) => {
      const slow = l.responseSec == null || l.responseSec > 3600;
      const cold = (l.lastActivityAt?.getTime() ?? 0) < coldCut;
      return slow && cold && l.funnelStage !== "convertido";
    })
    .sort((a, b) => {
      // Sem resposta primeiro (mais grave), depois do mais lento ao menos lento.
      if ((a.responseSec == null) !== (b.responseSec == null)) return a.responseSec == null ? -1 : 1;
      return (b.responseSec ?? 0) - (a.responseSec ?? 0);
    })
    .map((l) => ({
      name: l.name,
      origin: origin(l),
      metric: l.responseSec == null ? "Nunca respondido" : `Respondido em ${fmtDuration(l.responseSec)}`,
      dateLabel: fmtDate(l.startedAt),
    }));

  // ── Narrativa ────────────────────────────────────────────────────────────────
  const tempoMedioSec = geral.tempoMedioSec;
  const lento = tempoMedioSec != null && tempoMedioSec > 1800;
  const narrative =
    `No período, ${num(geral.leads)} lead${geral.leads !== 1 ? "s" : ""} chegaram pelo WhatsApp e ${geral.taxaResposta}% foram respondidos` +
    `${tempoMedioSec != null ? `, com tempo médio de ${fmtDuration(tempoMedioSec)}` : ""}. ` +
    (lento
      ? "A referência de mercado é responder em até ~10 minutos, janela em que o lead ainda está quente e a conversão acontece. Acima disso, o lead esfria, busca o concorrente e a venda se perde — mesmo com todo o investimento já feito para trazê-lo. "
      : "O ritmo de resposta está dentro do esperado. ") +
    (ads && ads.leads > 0
      ? `Dos ${num(ads.leads)} leads de anúncio (mídia paga), ${num(ads.semResposta)} ficaram sem resposta — leads comprados que não tiveram retorno.`
      : "");

  const data: AttendanceReportData = {
    clientName: client.name,
    periodLabel: `${MONTHS[month - 1]} de ${year}`,
    generatedAt: now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    geral,
    ads,
    buckets,
    tempoMedioSec,
    tempoMedioLabel: tempoMedioSec != null ? fmtDuration(tempoMedioSec) : "—",
    over1hCount,
    over1hShare: geral.leads > 0 ? Math.round((over1hCount / geral.leads) * 100) : 0,
    narrative,
    noResponseList,
    slowList,
    lostList,
  };

  const buffer = await renderToBuffer(buildAttendanceReport(data));
  const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="diagnostico-atendimento-${slug}-${year}-${String(month).padStart(2, "0")}.pdf"` },
  });
}
