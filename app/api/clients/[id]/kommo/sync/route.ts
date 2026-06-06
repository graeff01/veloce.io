import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import {
  getAccessToken, getStatusMap, getLeads, getContacts, KommoError,
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

  // Opcional: { since } (ISO) limita quão para trás buscar. Sem date filter por
  // padrão — puxamos os leads mais recentes e o dashboard filtra por mês.
  const body = await req.json().catch(() => ({}));
  const fromUnix = body.since ? Math.floor(new Date(body.since).getTime() / 1000) : undefined;

  try {
    const token = await getAccessToken(conn);

    // Conjunto de nomes que contam como "anúncio": as configuradas pelo usuário
    // ou, se vazio, qualquer tag que contenha "anúncio".
    const configured = conn.adTags.map(norm);
    const isAdTagName = (name: string) =>
      configured.length ? configured.includes(norm(name)) : norm(name).includes("anuncio");

    // 1. Mapa de status do funil
    const statusMap = await getStatusMap(conn, token);

    // 2. Puxa os leads (mais recentes primeiro), sem filtro de tag — assim nada
    //    se perde e marcamos cada um com a tag de anúncio que ele realmente tem.
    const leads = await getLeads(conn, token, { from: fromUnix });

    // Conjunto de todas as tags vistas (diagnóstico + futura seleção na UI)
    const tagsSeen = new Set<string>();
    let withAdTag = 0;

    // 3. Telefones + TAGS dos contatos principais (em lote). As tags de anúncio
    //    costumam ficar no contato, não no lead.
    const mainContactIds = leads
      .map((l) => l._embedded?.contacts?.find((c) => c.is_main)?.id ?? l._embedded?.contacts?.[0]?.id)
      .filter((x): x is number => typeof x === "number");
    const contacts = await getContacts(conn, token, mainContactIds);

    // 4. Persiste
    let synced = 0;
    for (const lead of leads) {
      const mainId = lead._embedded?.contacts?.find((c) => c.is_main)?.id ?? lead._embedded?.contacts?.[0]?.id;
      const contact = mainId ? contacts.get(mainId) : undefined;

      // Tags do lead + tags do contato (de onde normalmente vem a tag do anúncio)
      const allTagNames = [
        ...(lead._embedded?.tags ?? []).map((t) => t.name),
        ...(contact?.tags ?? []),
      ];
      const uniqueTags = [...new Set(allTagNames)];
      for (const t of uniqueTags) tagsSeen.add(t);

      const adTag = uniqueTags.find((t) => isAdTagName(t)) ?? null;
      if (adTag) withAdTag++;
      const status = lead.status_id ? statusMap.get(lead.status_id) : undefined;

      const data = {
        name: lead.name,
        contactName: contact?.name ?? null,
        phone: contact?.phone ?? null,
        adTag,
        tags: uniqueTags,
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
      withAdTag,
      tagsSeen: [...tagsSeen].sort(),
    });
  } catch (e) {
    if (e instanceof KommoError) {
      return NextResponse.json({ error: e.message, reconnect: e.reconnect }, { status: e.status });
    }
    return NextResponse.json({ error: "Erro ao sincronizar com o Kommo" }, { status: 500 });
  }
}
