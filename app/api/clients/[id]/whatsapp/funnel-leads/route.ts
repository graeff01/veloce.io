import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export const runtime = "nodejs";

interface FunnelLead {
  contactId: string;
  name: string | null;
  waId: string;
  lastMessageAt: string | null;
  origin: string | null; // anúncio/modelo de origem, se houver
  manual: boolean;
}

// GET — leads do funil por etapa (qualificado/negociacao/convertido/perdido) no
// período. Mesma janela do overview (firstInboundAt no mês). ?year=&month= ou ?from=&to=
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

  const STAGES = ["qualificado", "negociacao", "convertido", "perdido"];

  const convs = await prisma.waConversation.findMany({
    where: { connectionId: conn.id, firstInboundAt: { gte: start, lt: end }, funnelStage: { in: STAGES } },
    select: {
      contactId: true, funnelStage: true, funnelManual: true, lastMessageAt: true,
      contact: { select: { name: true, waId: true } },
    },
    orderBy: { lastMessageAt: "desc" },
  });

  // Origem (anúncio/modelo) por contato — best-effort.
  const leads = await prisma.waLead.findMany({
    where: { connectionId: conn.id, contactId: { in: convs.map((c) => c.contactId) } },
    select: { contactId: true, adTitle: true, adModel: true },
  });
  const originByContact = new Map(leads.map((l) => [l.contactId, l.adTitle || l.adModel || null]));

  const stages: Record<string, FunnelLead[]> = { qualificado: [], negociacao: [], convertido: [], perdido: [] };
  for (const c of convs) {
    if (!c.funnelStage || !(c.funnelStage in stages)) continue;
    stages[c.funnelStage].push({
      contactId: c.contactId,
      name: c.contact?.name ?? null,
      waId: c.contact?.waId ?? "",
      lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
      origin: originByContact.get(c.contactId) ?? null,
      manual: c.funnelManual,
    });
  }

  return NextResponse.json({ stages });
}
