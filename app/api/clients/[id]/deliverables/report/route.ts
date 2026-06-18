import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { renderToBuffer } from "@react-pdf/renderer";
import { buildDeliverablesReport, type DeliverablesReportData, type DeliverableGroup } from "@/components/clients/deliverables-report-document";

export const runtime = "nodejs";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Tarefas com esta tag são INTERNAS (organização do time) → fora do relatório.
// Aceita "Tarefas" (tag atual) e "Tarefa" (legado).
const INTERNAL_TAGS = new Set(["tarefas", "tarefa"]);

// Datas são gravadas ao meio-dia UTC; lê em UTC p/ o dia ficar estável em qualquer fuso.
function ddmm(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// GET /api/clients/[id]/deliverables/report?year=&month=  → PDF de entregas do mês
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });

  // Mesma janela do quadro: tarefas do plano do mês + avulsas com prazo no mês.
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const tasks = await prisma.task.findMany({
    where: {
      clientId: id,
      deletedAt: null,
      status: "DONE", // só o que foi efetivamente ENTREGUE (concluído)
      OR: [
        { planMonth: month, planYear: year },
        { planMonth: null, dueDate: { gte: monthStart, lte: monthEnd } },
      ],
    },
    select: { title: true, description: true, type: true, dueDate: true },
    orderBy: { dueDate: "asc" },
  });

  // Exclui tarefas internas (tag "Tarefa") e agrupa por categoria NORMALIZADA
  // (mesma caixa/sem espaços) — assim "meta ADS", "Meta ADS" e "metaADS" viram um
  // grupo só. O rótulo exibido é a grafia mais frequente entre as variações.
  const canon = (t: string) => t.trim().toLowerCase().replace(/\s+/g, "");
  const acc = new Map<string, { labels: Map<string, number>; items: DeliverableGroup["items"] }>();
  for (const t of tasks) {
    const raw = (t.type ?? "").trim();
    if (INTERNAL_TAGS.has(raw.toLowerCase())) continue;
    const display = raw || "Outros";
    const key = canon(display);
    let g = acc.get(key);
    if (!g) { g = { labels: new Map(), items: [] }; acc.set(key, g); }
    g.labels.set(display, (g.labels.get(display) ?? 0) + 1);
    g.items.push({ title: t.title, date: ddmm(t.dueDate), description: t.description?.trim() || null });
  }
  const groups: DeliverableGroup[] = [...acc.values()].map((g) => {
    // rótulo = grafia mais frequente (desempate: a que tem letra maiúscula)
    const label = [...g.labels.entries()].sort((a, b) => b[1] - a[1] || (/[A-Z]/.test(b[0]) ? 1 : 0) - (/[A-Z]/.test(a[0]) ? 1 : 0))[0][0];
    return { type: label, count: g.items.length, items: g.items };
  }).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const total = groups.reduce((acc, g) => acc + g.count, 0);

  const data: DeliverablesReportData = {
    clientName: client.name,
    responsavel: "Carla & Andressa",
    periodLabel: `${MONTHS[month - 1]} de ${year}`,
    generatedAt: now.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    total,
    groups,
  };

  const buffer = await renderToBuffer(buildDeliverablesReport(data));
  const slug = client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fileName = `entregas-${slug}-${year}-${String(month).padStart(2, "0")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
    },
  });
}
