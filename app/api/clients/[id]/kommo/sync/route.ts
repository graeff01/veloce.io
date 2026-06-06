import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import {
  getAccessToken, getStatusMap, getLeads, getUnsortedLeads, getLeadDetail, getContacts, mapLimit, KommoError,
} from "@/lib/kommo";

// Normaliza para comparar nomes de tag ("Anúncio Taos" ≈ "anuncio taos")
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// POST — sincroniza só os leads de anúncio. Junta a fila de entrada (unsorted,
// onde caem os leads de WhatsApp recentes) com os leads já no funil, lê a tag
// real de cada um (a listagem não traz tag) e guarda apenas os com tag de anúncio.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  // Janela: padrão últimos 35 dias (cobre o mês); override via body { since } (ISO).
  // Mantido curto de propósito p/ respeitar o limite de API do Kommo.
  const body = await req.json().catch(() => ({}));
  const sinceUnix = body.since
    ? Math.floor(new Date(body.since).getTime() / 1000)
    : Math.floor((Date.now() - 35 * 24 * 60 * 60 * 1000) / 1000);

  try {
    const token = await getAccessToken(conn);

    const configured = conn.adTags.map(norm);
    const isAdTagName = (name: string) =>
      configured.length ? configured.includes(norm(name)) : norm(name).includes("anuncio");

    const statusMap = await getStatusMap(conn, token);

    // 1. Candidatos: fila de entrada (recentes) + leads do funil (aceitos)
    const candidates = new Map<number, { contactId: number | null; name: string | null; createdAt: number }>();

    const incoming = await getUnsortedLeads(conn, token, { sinceUnix });
    for (const u of incoming) {
      if (!candidates.has(u.leadId)) candidates.set(u.leadId, { contactId: u.contactId, name: u.name, createdAt: u.createdAt });
    }

    const sorted = await getLeads(conn, token, { from: sinceUnix });
    for (const l of sorted) {
      if (candidates.has(l.id)) continue;
      const cid = l._embedded?.contacts?.find((c) => c.is_main)?.id ?? l._embedded?.contacts?.[0]?.id ?? null;
      candidates.set(l.id, { contactId: cid, name: l.name, createdAt: l.created_at });
    }

    // 2. Lê o detalhe de cada candidato p/ pegar a tag real. Concorrência baixa
    //    + pequena pausa por chamada para respeitar o limite de API do Kommo.
    const leadIds = [...candidates.keys()];
    const details = await mapLimit(leadIds, 2, async (lid) => {
      const d = await getLeadDetail(conn, token, lid);
      await new Promise((r) => setTimeout(r, 120));
      return d;
    });

    const tagsSeen = new Set<string>();
    const adLeads: Array<{ leadId: number; contactId: number | null; name: string | null; createdAt: number; adTag: string; statusId: number | null; pipelineId: number | null }> = [];

    for (const d of details) {
      if (!d) continue;
      for (const t of d.tags) tagsSeen.add(t);
      const adTag = d.tags.find(isAdTagName);
      if (!adTag) continue;
      const cand = candidates.get(d.id)!;
      adLeads.push({
        leadId: d.id,
        contactId: d.contactId ?? cand.contactId,
        name: cand.name,
        createdAt: cand.createdAt || d.createdAt,
        adTag,
        statusId: d.statusId,
        pipelineId: d.pipelineId,
      });
    }

    // 3. Telefone/nome do contato (em lote)
    const contactIds = adLeads.map((a) => a.contactId).filter((x): x is number => typeof x === "number");
    const contacts = await getContacts(conn, token, contactIds);

    // 4. Full refresh do cache deste cliente
    await prisma.kommoLead.deleteMany({ where: { connectionId: conn.id } });

    const rows = adLeads.map((a) => {
      const c = a.contactId ? contacts.get(a.contactId) : undefined;
      const status = a.statusId ? statusMap.get(a.statusId) : undefined;
      return {
        connectionId: conn.id,
        kommoId: a.contactId ?? a.leadId, // chave estável (contato); cai p/ leadId se faltar
        leadId: a.leadId,
        name: a.name ?? c?.name ?? null,
        contactName: c?.name ?? a.name ?? null,
        phone: c?.phone ?? null,
        adTag: a.adTag,
        tags: [a.adTag],
        statusId: a.statusId,
        statusName: status?.statusName ?? "Lead de entrada",
        pipelineId: a.pipelineId ?? status?.pipelineId ?? null,
        pipelineName: status?.pipelineName ?? null,
        price: 0,
        createdAtKommo: new Date(a.createdAt * 1000),
        updatedAtKommo: null,
      };
    });

    if (rows.length) await prisma.kommoLead.createMany({ data: rows });
    await prisma.kommoConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } });

    const dates = rows.map((r) => r.createdAtKommo.getTime());
    return NextResponse.json({
      synced: rows.length,
      withAdTag: rows.length,
      scanned: leadIds.length,
      tagsSeen: [...tagsSeen].filter(isAdTagName).sort(),
      newest: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      oldest: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
    });
  } catch (e) {
    if (e instanceof KommoError) {
      return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    }
    return NextResponse.json({ error: "Erro ao sincronizar com o Kommo" }, { status: 500 });
  }
}
