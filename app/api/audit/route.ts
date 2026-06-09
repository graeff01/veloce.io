import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { deriveBadge } from "@/lib/wa-leads";

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

// Nome canônico do anúncio: usa o modelo detectado; senão, o título do anúncio
// cortado no 1º separador (" - ", " | ", "—") → funde variações do mesmo carro.
function canonicalAd(model: string | null, title: string | null): string {
  if (model && model.trim()) return model.trim();
  const t = (title ?? "").trim();
  if (!t) return "Anúncio (sem título)";
  return t.split(/\s+[-–—|]\s+/)[0].trim() || t;
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

  // Conversa: funil + contadores + SLA (tempo até 1ª resposta da loja).
  const convs = contactIds.length
    ? await prisma.waConversation.findMany({
        where: { contactId: { in: contactIds } },
        select: { contactId: true, funnelStage: true, outboundCount: true, firstResponseSec: true, lastMessageAt: true },
      })
    : [];
  const stageByContact = new Map(convs.map((c) => [c.contactId, c.funnelStage]));
  const convByContact = new Map(convs.map((c) => [c.contactId, c]));

  // 1ª mensagem do lead + total de mensagens recebidas + flags de mídia.
  const msgs = contactIds.length
    ? await prisma.waMessage.findMany({
        where: { contactId: { in: contactIds }, direction: "in" },
        select: { contactId: true, text: true, type: true, timestamp: true },
        orderBy: [{ timestamp: "asc" }, { id: "asc" }],
      })
    : [];
  const firstMsgByContact = new Map<string, { text: string | null; type: string }>();
  const msgCountByContact = new Map<string, number>();
  const mediaByContact = new Map<string, { media: boolean; audio: boolean; image: boolean }>();
  // Para o badge: última atividade ANTES do período + 1ª DENTRO do período.
  const prevBefore = new Map<string, Date>();
  const firstInPeriod = new Map<string, Date>();
  const MEDIA = new Set(["image", "sticker", "audio", "video", "document"]);
  for (const m of msgs) {
    if (!firstMsgByContact.has(m.contactId)) firstMsgByContact.set(m.contactId, { text: m.text, type: m.type });
    msgCountByContact.set(m.contactId, (msgCountByContact.get(m.contactId) ?? 0) + 1);
    if (MEDIA.has(m.type)) {
      const f = mediaByContact.get(m.contactId) ?? { media: false, audio: false, image: false };
      f.media = true;
      if (m.type === "audio") f.audio = true;
      if (m.type === "image") f.image = true;
      mediaByContact.set(m.contactId, f);
    }
    if (m.timestamp < start) {
      const cur = prevBefore.get(m.contactId);
      if (!cur || m.timestamp > cur) prevBefore.set(m.contactId, m.timestamp);
    } else if (!firstInPeriod.has(m.contactId)) {
      firstInPeriod.set(m.contactId, m.timestamp); // msgs asc → 1ª no período
    }
  }

  // Dados do contato (nome interno, validade) + tags.
  const contacts = contactIds.length
    ? await prisma.waContact.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, createdAt: true, displayName: true, reportValid: true, reportInvalidReason: true },
      })
    : [];
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const tagRows = contactIds.length
    ? await prisma.waContactTag.findMany({ where: { contactId: { in: contactIds } }, include: { tag: true } })
    : [];
  const tagsByContact = new Map<string, { id: string; name: string; color: string }[]>();
  for (const t of tagRows) {
    const arr = tagsByContact.get(t.contactId) ?? [];
    arr.push({ id: t.tag.id, name: t.tag.name, color: t.tag.color });
    tagsByContact.set(t.contactId, arr);
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
    const adName = canonicalAd(l.adModel, l.adTitle);
    const c = contactById.get(l.contactId);
    const badge = deriveBadge({
      createdAt: c?.createdAt ?? l.enteredAt,
      periodStart: start,
      prevActivityBefore: prevBefore.get(l.contactId) ?? null,
      firstActivityInPeriod: firstInPeriod.get(l.contactId) ?? null,
    });
    return {
      id: l.id,
      contactId: l.contactId,
      name: l.name,
      displayName: c?.displayName ?? null,
      phone: l.waId,
      enteredAt: l.enteredAt,
      adTitle: l.adTitle,
      adModel: l.adModel,
      adName,
      adId: l.adId,
      adBody: l.adBody,
      sourceType: l.sourceType,
      sourceUrl: l.sourceUrl,
      ctwaClid: l.ctwaClid,
      // Campanha = match no Meta; se não houver, usa o próprio nome do anúncio.
      campaignName: resolveCampaign(adName) ?? adName,
      funnelStage: stageByContact.get(l.contactId) ?? null,
      firstMessage: firstMsgByContact.get(l.contactId) ?? null,
      messageCount: msgCountByContact.get(l.contactId) ?? 0,
      storeMessages: convByContact.get(l.contactId)?.outboundCount ?? 0,
      firstResponseSec: convByContact.get(l.contactId)?.firstResponseSec ?? null,
      lastMessageAt: convByContact.get(l.contactId)?.lastMessageAt ?? null,
      hasMedia: mediaByContact.get(l.contactId)?.media ?? false,
      hasAudio: mediaByContact.get(l.contactId)?.audio ?? false,
      hasImage: mediaByContact.get(l.contactId)?.image ?? false,
      imported: l.imported,
      reportValid: c?.reportValid ?? true,
      reportInvalidReason: c?.reportInvalidReason ?? null,
      tags: tagsByContact.get(l.contactId) ?? [],
      badge,
    };
  });

  // Agrupamento por anúncio (nome canônico — funde variações do mesmo carro).
  const groupsMap = new Map<string, typeof richLeads>();
  for (const lead of richLeads) {
    const k = lead.adName;
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
      ads: new Set(items.map((i) => i.adName)).size,
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
