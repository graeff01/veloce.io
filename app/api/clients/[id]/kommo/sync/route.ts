import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import {
  getAccessToken, getStatusMap, getLeadTags, getContactTags, getContactsByTag, getLeadsByIds, KommoError,
} from "@/lib/kommo";

// Normaliza para comparar nomes de tag ("Anúncio Taos" ≈ "anuncio taos")
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// POST — sincroniza os leads de anúncio: dirige pelos CONTATOS filtrados pela
// tag de anúncio (funciona para leads do funil E da fila de entrada) e cacheia.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  try {
    const token = await getAccessToken(conn);

    // Nomes que contam como "anúncio": os configurados ou, se vazio, os que contêm "anúncio".
    const configured = conn.adTags.map(norm);
    const isAdTagName = (name: string) =>
      configured.length ? configured.includes(norm(name)) : norm(name).includes("anuncio");

    // 1. Tags de anúncio (em contatos e/ou leads). O filtro por tag funciona
    //    mesmo quando as tags não vêm embutidas na listagem.
    const [contactTags, leadTags] = await Promise.all([
      getContactTags(conn, token),
      getLeadTags(conn, token).catch(() => []),
    ]);
    const allTags = [...contactTags, ...leadTags];
    const adTags = allTags.filter((t) => isAdTagName(t.name));
    const tagsSeen = [...new Set(adTags.map((t) => t.name))].sort();

    if (adTags.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma tag de anúncio encontrada na conta. Configure em \"Tags de anúncio\".", tagsSeen: [] },
        { status: 400 },
      );
    }

    // 2. Mapa de status do funil
    const statusMap = await getStatusMap(conn, token);

    // 3. Contatos por tag de anúncio (dedup; 1ª tag vence). Driver da auditoria.
    const byContact = new Map<number, { name: string | null; phone: string | null; createdAt: number; leadId: number | null; adTag: string }>();
    for (const tag of adTags) {
      const contacts = await getContactsByTag(conn, token, tag.id);
      for (const c of contacts) {
        if (byContact.has(c.id)) continue;
        byContact.set(c.id, { name: c.name, phone: c.phone, createdAt: c.createdAt, leadId: c.leadId, adTag: tag.name });
      }
    }

    // 4. Status dos leads vinculados (em lote)
    const leadIds = [...byContact.values()].map((v) => v.leadId).filter((x): x is number => typeof x === "number");
    const leadInfo = await getLeadsByIds(conn, token, leadIds);

    // 5. Refaz o cache deste cliente (full refresh) e grava
    await prisma.kommoLead.deleteMany({ where: { connectionId: conn.id } });

    const rows = [...byContact.entries()].map(([contactId, v]) => {
      const li = v.leadId ? leadInfo.get(v.leadId) : undefined;
      const status = li?.statusId ? statusMap.get(li.statusId) : undefined;
      return {
        connectionId: conn.id,
        kommoId: contactId,
        leadId: v.leadId,
        name: v.name,
        contactName: v.name,
        phone: v.phone,
        adTag: v.adTag,
        tags: [v.adTag],
        statusId: li?.statusId ?? null,
        statusName: status?.statusName ?? "Lead de entrada",
        pipelineId: li?.pipelineId ?? status?.pipelineId ?? null,
        pipelineName: status?.pipelineName ?? null,
        price: 0,
        createdAtKommo: new Date(v.createdAt * 1000),
        updatedAtKommo: null,
      };
    });

    if (rows.length) await prisma.kommoLead.createMany({ data: rows });

    await prisma.kommoConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date() } });

    const dates = rows.map((r) => r.createdAtKommo.getTime());
    return NextResponse.json({
      synced: rows.length,
      withAdTag: rows.length,
      tagsSeen,
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
