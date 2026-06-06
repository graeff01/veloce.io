import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/audit
//   sem clientId  → lista de clientes com conexão Kommo (para o seletor)
//   ?clientId=&year=&month= → leads agrupados por anúncio no período
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  // ── Lista de clientes conectados ───────────────────────────────────────────
  if (!clientId) {
    const conns = await prisma.kommoConnection.findMany({
      include: {
        client: { select: { id: true, name: true, logoUrl: true } },
        _count: { select: { leads: true } },
      },
      orderBy: { client: { name: "asc" } },
    });
    return NextResponse.json(
      conns.map((c) => ({
        clientId: c.clientId,
        name: c.client.name,
        logoUrl: c.client.logoUrl,
        accountName: c.accountName,
        lastSyncAt: c.lastSyncAt,
        leadCount: c._count.leads,
      })),
    );
  }

  // ── Auditoria de um cliente no período ─────────────────────────────────────
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const monthParam = url.searchParams.get("month"); // 1-12, opcional
  const month = monthParam ? Number(monthParam) : null;

  const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const conn = await prisma.kommoConnection.findUnique({
    where: { clientId },
    include: { client: { select: { id: true, name: true, logoUrl: true } } },
  });
  if (!conn) return NextResponse.json({ error: "Cliente sem conexão Kommo" }, { status: 404 });

  const leads = await prisma.kommoLead.findMany({
    where: { connectionId: conn.id, createdAtKommo: { gte: start, lt: end } },
    orderBy: { createdAtKommo: "desc" },
  });

  // Agrupa por anúncio (adTag)
  const groupsMap = new Map<string, typeof leads>();
  for (const lead of leads) {
    const key = lead.adTag ?? "Sem anúncio";
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(lead);
  }
  const groups = [...groupsMap.entries()]
    .map(([adTag, items]) => ({
      adTag,
      total: items.length,
      leads: items.map((l) => ({
        id: l.id,
        kommoId: l.kommoId,
        leadId: l.leadId,
        name: l.name,
        contactName: l.contactName,
        phone: l.phone,
        tags: l.tags,
        statusName: l.statusName,
        pipelineName: l.pipelineName,
        createdAtKommo: l.createdAtKommo,
      })),
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    client: { id: conn.client.id, name: conn.client.name, logoUrl: conn.client.logoUrl },
    accountName: conn.accountName,
    lastSyncAt: conn.lastSyncAt,
    period: { year, month },
    totalLeads: leads.length,
    groups,
  });
}
