import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/audit
//   sem clientId → clientes com WhatsApp conectado (para o seletor)
//   ?clientId=&year=&month= → leads de anúncio agrupados por anúncio no período
export async function GET(req: Request) {
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  if (!clientId) {
    const conns = await prisma.waConnection.findMany({
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
        displayPhone: c.displayPhone,
        lastEventAt: c.lastEventAt,
        leadCount: c._count.leads,
      })),
    );
  }

  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const monthParam = url.searchParams.get("month");
  const month = monthParam ? Number(monthParam) : null;
  const start = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const end = month ? new Date(year, month, 1) : new Date(year + 1, 0, 1);

  const conn = await prisma.waConnection.findUnique({
    where: { clientId },
    include: { client: { select: { id: true, name: true, logoUrl: true } } },
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
    .map(([adTitle, items]) => ({
      adTitle,
      total: items.length,
      leads: items.map((l) => ({
        id: l.id,
        contactId: l.contactId,
        name: l.name,
        phone: l.waId,
        enteredAt: l.enteredAt,
      })),
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    client: { id: conn.client.id, name: conn.client.name, logoUrl: conn.client.logoUrl },
    displayPhone: conn.displayPhone,
    lastEventAt: conn.lastEventAt,
    period: { year, month },
    totalLeads: leads.length,
    groups,
  });
}
