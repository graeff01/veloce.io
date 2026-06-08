import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// GET /api/audit
//   sem clientId → clientes com WhatsApp conectado (para o seletor)
//   ?clientId=&year=&month= → leads de anúncio do período (auditoria mensal)
//
// Esta tela é de CONFERÊNCIA: só expõe dados que capturamos de verdade
// (entrada do lead, origem do anúncio, mensagens do lead, etapa do funil).
// Não há métricas de resposta/tempo — o WhatsApp Cloud API não entrega as
// mensagens enviadas pelo app nativo do vendedor.

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

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

  const contactIds = leads.map((l) => l.contactId);

  // Funil (manual) por contato.
  const convs = contactIds.length
    ? await prisma.waConversation.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true, funnelStage: true },
      })
    : [];
  const stageByContact = new Map(convs.map((c) => [c.contactId, c.funnelStage]));

  // 1ª mensagem do lead + total de mensagens recebidas (só inbound — é o que temos).
  const msgs = contactIds.length
    ? await prisma.waMessage.findMany({
        where: { contactId: { in: contactIds }, direction: "in" },
        select: { contactId: true, text: true, type: true, timestamp: true },
        orderBy: { timestamp: "asc" },
      })
    : [];
  const firstMsgByContact = new Map<string, { text: string | null; type: string }>();
  const msgCountByContact = new Map<string, number>();
  for (const m of msgs) {
    if (!firstMsgByContact.has(m.contactId)) firstMsgByContact.set(m.contactId, { text: m.text, type: m.type });
    msgCountByContact.set(m.contactId, (msgCountByContact.get(m.contactId) ?? 0) + 1);
  }

  // Campanha (best-effort): nome da campanha/adset do Meta que contém o modelo.
  const meta = await prisma.metaConnection.findUnique({
    where: { clientId },
    include: { insights: { select: { campaignName: true, adsetName: true } } },
  }).catch(() => null);
  function resolveCampaign(model: string | null): string | null {
    if (!model || !meta) return null;
    const key = norm(model);
    if (!key) return null;
    for (const ins of meta.insights) {
      const name = `${norm(ins.campaignName ?? "")} ${norm(ins.adsetName ?? "")}`;
      if (name.includes(key)) return ins.campaignName ?? null;
    }
    return null;
  }

  const richLeads = leads.map((l) => {
    const key = l.adModel ?? l.adTitle ?? null;
    return {
      id: l.id,
      contactId: l.contactId,
      name: l.name,
      phone: l.waId,
      enteredAt: l.enteredAt,
      adTitle: l.adTitle,
      adModel: l.adModel,
      adId: l.adId,
      adBody: l.adBody,
      sourceType: l.sourceType,
      sourceUrl: l.sourceUrl,
      ctwaClid: l.ctwaClid,
      campaignName: resolveCampaign(key),
      funnelStage: stageByContact.get(l.contactId) ?? null,
      firstMessage: firstMsgByContact.get(l.contactId) ?? null,
      messageCount: msgCountByContact.get(l.contactId) ?? 0,
      imported: l.imported,
    };
  });

  // Agrupamento por anúncio (modelo).
  const groupsMap = new Map<string, typeof richLeads>();
  for (const lead of richLeads) {
    const k = lead.adModel ?? lead.adTitle ?? "Anúncio (sem título)";
    if (!groupsMap.has(k)) groupsMap.set(k, []);
    groupsMap.get(k)!.push(lead);
  }
  const ads = [...groupsMap.entries()]
    .map(([adTitle, items]) => ({
      adTitle,
      campaignName: items[0]?.campaignName ?? null,
      total: items.length,
      lastEnteredAt: items.reduce<string | null>((acc, i) => {
        const t = i.enteredAt as unknown as string;
        return !acc || t > acc ? t : acc;
      }, null),
      negociacao: items.filter((i) => i.funnelStage === "negociacao").length,
      convertido: items.filter((i) => i.funnelStage === "convertido").length,
    }))
    .sort((a, b) => b.total - a.total);

  // Agrupamento por campanha.
  const campMap = new Map<string, typeof richLeads>();
  for (const lead of richLeads) {
    const k = lead.campaignName ?? "Sem campanha identificada";
    if (!campMap.has(k)) campMap.set(k, []);
    campMap.get(k)!.push(lead);
  }
  const campaigns = [...campMap.entries()]
    .map(([name, items]) => ({
      name,
      total: items.length,
      ads: new Set(items.map((i) => i.adModel ?? i.adTitle ?? "—")).size,
      negociacao: items.filter((i) => i.funnelStage === "negociacao").length,
      convertido: items.filter((i) => i.funnelStage === "convertido").length,
    }))
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({
    client: { id: conn.client.id, name: conn.client.name, logoUrl: conn.client.logoUrl },
    displayPhone: conn.displayPhone,
    lastEventAt: conn.lastEventAt,
    period: { year, month },
    totalLeads: leads.length,
    leads: richLeads,
    ads,
    campaigns,
    // groups: mantido para compatibilidade com consumidores antigos.
    groups: ads.map((a) => ({
      adTitle: a.adTitle,
      total: a.total,
      leads: (groupsMap.get(a.adTitle) ?? []).map((l) => ({
        id: l.id, contactId: l.contactId, name: l.name, phone: l.phone, enteredAt: l.enteredAt,
      })),
    })),
  });
}
