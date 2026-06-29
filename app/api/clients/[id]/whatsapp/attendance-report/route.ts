import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildAttendanceReport, type AttendanceReportData, type AttendanceRow } from "@/components/clients/attendance-report-document";

export const runtime = "nodejs";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const num = (v: number) => v.toLocaleString("pt-BR");
const fmtMin = (m: number) => (m < 60 ? `${num(m)} min` : `${Math.floor(m / 60)}h ${m % 60}min`);

// GET /api/clients/[id]/whatsapp/attendance-report?year=&month=  → PDF de 1 página
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

  const [convs, adLeads] = await Promise.all([
    prisma.waConversation.findMany({
      where: { connectionId: conn.id, firstInboundAt: { gte: start, lt: end } },
      select: { contactId: true, firstInboundAt: true, firstResponseSec: true, funnelStage: true, contact: { select: { name: true, waId: true } } },
    }),
    prisma.waLead.findMany({ where: { connectionId: conn.id, enteredAt: { gte: start, lt: end } }, select: { contactId: true } }),
  ]);
  const adIds = new Set(adLeads.map((l) => l.contactId));
  const nameOf = (c: (typeof convs)[number]) => (c.contact.name || "").trim() || `Lead ···${c.contact.waId.slice(-4)}`;

  const leads = convs.length;
  const respondidos = convs.filter((c) => c.firstResponseSec != null).length;
  const semResposta = leads - respondidos;
  const conversoes = convs.filter((c) => c.funnelStage === "convertido").length;
  const times = convs.map((c) => c.firstResponseSec).filter((x): x is number => x != null);
  const tempoMedioMin = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length / 60) : null;
  const taxaResposta = leads > 0 ? Math.round((respondidos / leads) * 100) : 0;

  const adConvs = convs.filter((c) => adIds.has(c.contactId));
  const ads = adConvs.length > 0 ? {
    leads: adConvs.length,
    semResposta: adConvs.filter((c) => c.firstResponseSec == null).length,
    conversoes: adConvs.filter((c) => c.funnelStage === "convertido").length,
  } : null;

  // Sem resposta — os que esperam há mais tempo.
  const semRespostaList: AttendanceRow[] = convs
    .filter((c) => c.firstResponseSec == null && c.firstInboundAt)
    .sort((a, b) => (a.firstInboundAt!.getTime()) - (b.firstInboundAt!.getTime()))
    .slice(0, 5)
    .map((c) => {
      const h = Math.floor((now.getTime() - c.firstInboundAt!.getTime()) / 3_600_000);
      return { name: nameOf(c), metric: h >= 24 ? `há ${Math.floor(h / 24)}d` : `há ${h}h` };
    });

  // Respostas mais demoradas.
  const slowest: AttendanceRow[] = convs
    .filter((c) => c.firstResponseSec != null)
    .sort((a, b) => b.firstResponseSec! - a.firstResponseSec!)
    .slice(0, 5)
    .map((c) => ({ name: nameOf(c), metric: fmtMin(Math.round(c.firstResponseSec! / 60)) }));

  const lento = tempoMedioMin != null && tempoMedioMin > 30;
  const narrative =
    `No período, ${num(leads)} lead${leads !== 1 ? "s" : ""} chegaram pelo WhatsApp e ${taxaResposta}% foram respondidos` +
    `${tempoMedioMin != null ? `, com tempo médio de ${num(tempoMedioMin)} min` : ""}. ` +
    (lento
      ? "Esse tempo está acima da referência de ~10 min, em que a conversão acontece — quanto mais leads chegam, mais o retorno demora e mais leads esfriam esperando. "
      : "O ritmo de resposta está dentro do esperado. ") +
    (ads && ads.leads > 0
      ? `Dos ${num(ads.leads)} leads pagos (anúncios), ${num(ads.semResposta)} ficaram sem resposta e ${num(ads.conversoes)} converteram — o que ajuda a explicar a conversão de mídia no período.`
      : "");

  const data: AttendanceReportData = {
    clientName: client.name,
    periodLabel: `${MONTHS[month - 1]} de ${year}`,
    generatedAt: now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    totals: { leads, respondidos, taxaResposta, semResposta, tempoMedioMin, conversoes },
    ads,
    narrative,
    semRespostaList,
    slowest,
  };

  const buffer = await renderToBuffer(buildAttendanceReport(data));
  const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="diagnostico-atendimento-${slug}-${year}-${String(month).padStart(2, "0")}.pdf"` },
  });
}
