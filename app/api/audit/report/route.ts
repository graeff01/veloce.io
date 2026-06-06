import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildReport, type ReportData } from "@/components/audit/report-document";
import { computeAttendanceMetrics } from "@/lib/wa-metrics";

export const runtime = "nodejs";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// GET /api/audit/report?clientId=&year=&month=  → PDF de leads de anúncio (WhatsApp)
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  if (!clientId) return NextResponse.json({ error: "clientId obrigatório" }, { status: 400 });

  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const monthParam = url.searchParams.get("month");
  const month = monthParam ? Number(monthParam) : null;
  const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const conn = await prisma.waConnection.findUnique({
    where: { clientId },
    include: { client: { select: { name: true } } },
  });
  if (!conn) return NextResponse.json({ error: "Cliente sem WhatsApp conectado" }, { status: 404 });

  const leads = await prisma.waLead.findMany({
    where: { connectionId: conn.id, enteredAt: { gte: start, lt: end } },
    orderBy: { enteredAt: "desc" },
  });

  const groupsMap = new Map<string, typeof leads>();
  for (const lead of leads) {
    const key = lead.adTitle ?? "Anúncio (sem título)";
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(lead);
  }
  const groups = [...groupsMap.entries()]
    .map(([adTag, items]) => ({
      adTag,
      total: items.length,
      leads: items.map((l) => ({
        contactName: l.name,
        name: l.name,
        phone: l.waId,
        statusName: null,
        enteredAt: l.enteredAt.toISOString(),
      })),
    }))
    .sort((a, b) => b.total - a.total);

  const m = await computeAttendanceMetrics(conn.id, start, end);

  const data: ReportData = {
    clientName: conn.client.name,
    accountName: conn.displayPhone ? `WhatsApp ${conn.displayPhone}` : "WhatsApp",
    periodLabel: month ? `${MONTHS[month - 1]} de ${year}` : `Ano de ${year}`,
    totalLeads: leads.length,
    groups,
    generatedAt: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    metrics: {
      responded: m.responded,
      unanswered: m.unanswered,
      responseRate: m.responseRate,
      avgFirstResponseSec: m.avgFirstResponseSec,
      medianFirstResponseSec: m.medianFirstResponseSec,
    },
  };

  const buffer = await renderToBuffer(buildReport(data));
  const periodSlug = month ? `${year}-${String(month).padStart(2, "0")}` : String(year);
  const fileName = `auditoria-${conn.client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${periodSlug}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
