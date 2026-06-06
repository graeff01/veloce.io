import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import {
  getAccessToken, getLeadTags, getStatusMap, getLeads, getContactPhones, KommoError,
} from "@/lib/kommo";

// Normaliza para comparar nomes de tag ("Anúncio Taos" ≈ "anuncio taos")
function norm(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// POST — puxa os leads do Kommo (filtrados por tag de anúncio) e cacheia no banco
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  // Janela: por padrão últimos 12 meses; override via body { since, until } (ISO)
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  const since = body.since ? new Date(body.since) : new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const until = body.until ? new Date(body.until) : now;
  const fromUnix = Math.floor(since.getTime() / 1000);
  const toUnix = Math.floor(until.getTime() / 1000);

  try {
    const token = await getAccessToken(conn);

    // 1. Resolve as tags de anúncio → IDs. Usa as configuradas; se vazio, infere
    //    pelas tags que contêm "anúncio".
    const allTags = await getLeadTags(conn, token);
    const configured = conn.adTags.map(norm);
    const adTags = configured.length
      ? allTags.filter((t) => configured.includes(norm(t.name)))
      : allTags.filter((t) => norm(t.name).includes("anuncio"));

    if (adTags.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma tag de anúncio encontrada. Configure as tags na conexão." },
        { status: 400 },
      );
    }
    const adTagIds = new Set(adTags.map((t) => t.id));
    const tagIds = adTags.map((t) => t.id);

    // 2. Mapa de status do funil
    const statusMap = await getStatusMap(conn, token);

    // 3. Leads filtrados por tag + período
    const leads = await getLeads(conn, token, { tagIds, from: fromUnix, to: toUnix });

    // 4. Telefones dos contatos principais (em lote)
    const mainContactIds = leads
      .map((l) => l._embedded?.contacts?.find((c) => c.is_main)?.id ?? l._embedded?.contacts?.[0]?.id)
      .filter((x): x is number => typeof x === "number");
    const contacts = await getContactPhones(conn, token, mainContactIds);

    // 5. Persiste
    let synced = 0;
    for (const lead of leads) {
      const leadTags = lead._embedded?.tags ?? [];
      const adTag = leadTags.find((t) => adTagIds.has(t.id))?.name ?? leadTags[0]?.name ?? null;
      const status = lead.status_id ? statusMap.get(lead.status_id) : undefined;
      const mainId = lead._embedded?.contacts?.find((c) => c.is_main)?.id ?? lead._embedded?.contacts?.[0]?.id;
      const contact = mainId ? contacts.get(mainId) : undefined;

      const data = {
        name: lead.name,
        contactName: contact?.name ?? null,
        phone: contact?.phone ?? null,
        adTag,
        tags: leadTags.map((t) => t.name),
        statusId: lead.status_id ?? null,
        statusName: status?.statusName ?? null,
        pipelineId: lead.pipeline_id ?? status?.pipelineId ?? null,
        pipelineName: status?.pipelineName ?? null,
        price: lead.price ?? 0,
        createdAtKommo: new Date(lead.created_at * 1000),
        updatedAtKommo: lead.updated_at ? new Date(lead.updated_at * 1000) : null,
      };

      await prisma.kommoLead.upsert({
        where: { connectionId_kommoId: { connectionId: conn.id, kommoId: lead.id } },
        create: { connectionId: conn.id, kommoId: lead.id, ...data },
        update: data,
      });
      synced++;
    }

    await prisma.kommoConnection.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      synced,
      tags: adTags.map((t) => t.name),
      period: { since: since.toISOString(), until: until.toISOString() },
    });
  } catch (e) {
    if (e instanceof KommoError) {
      return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    }
    return NextResponse.json({ error: "Erro ao sincronizar com o Kommo" }, { status: 500 });
  }
}
