import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

interface FunnelLead {
  contactId: string;
  name: string | null;
  waId: string;
  lastMessageAt: string | null;
  origin: string | null;
  manual: boolean;
}

// GET — funil do cliente SÓ com leads de anúncio (Meta) no período. Retorna as
// contagens por etapa + KPIs + os leads de cada etapa. ?year=&month= ou ?from=&to=
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  let start: Date, end: Date;
  if (fromParam && toParam) {
    start = new Date(fromParam); end = new Date(toParam);
  } else {
    const now = new Date();
    const year = Number(url.searchParams.get("year")) || now.getFullYear();
    const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
    start = new Date(year, month - 1, 1); end = new Date(year, month, 1);
  }

  // Leads de anúncio do período (fonte da verdade do funil).
  const adLeads = await prisma.waLead.findMany({
    where: { connectionId: conn.id, enteredAt: { gte: start, lt: end } },
    select: { contactId: true, adTitle: true, adModel: true },
  });
  const adIds = adLeads.map((l) => l.contactId);
  const originByContact = new Map(adLeads.map((l) => [l.contactId, l.adTitle || l.adModel || null]));

  const convs = adIds.length
    ? await prisma.waConversation.findMany({
        where: { contactId: { in: adIds } },
        select: {
          contactId: true, funnelStage: true, funnelManual: true, firstResponseSec: true, lastMessageAt: true,
          contact: { select: { name: true, waId: true } },
        },
        orderBy: { lastMessageAt: "desc" },
      })
    : [];

  const funnel = { recebido: adIds.length, respondido: 0, qualificado: 0, negociacao: 0, perdido: 0, convertido: 0 };
  const stages: Record<string, FunnelLead[]> = { qualificado: [], negociacao: [], convertido: [], perdido: [] };
  let respSum = 0, respCount = 0;

  for (const c of convs) {
    if (c.firstResponseSec != null) { funnel.respondido++; respSum += c.firstResponseSec; respCount++; }
    const st = c.funnelStage;
    if (st && st in funnel && st !== "recebido" && st !== "respondido") {
      funnel[st as keyof typeof funnel]++;
      if (st in stages) {
        stages[st].push({
          contactId: c.contactId,
          name: c.contact?.name ?? null,
          waId: c.contact?.waId ?? "",
          lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
          origin: originByContact.get(c.contactId) ?? null,
          manual: c.funnelManual,
        });
      }
    }
  }

  return NextResponse.json({
    funnel,
    responded: funnel.respondido,
    converted: funnel.convertido,
    avgFirstResponseSec: respCount ? Math.round(respSum / respCount) : null,
    stages,
  });
}
