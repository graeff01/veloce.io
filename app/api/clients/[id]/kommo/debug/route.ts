import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getContactTags, getLeadTags, kommoGet, KommoError } from "@/lib/kommo";

// GET — diagnóstico do filtro por tag e de onde as tags são legíveis.
// ?leadId=14998016 (opcional) para inspecionar um lead específico.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  const url = new URL(req.url);
  const probeLeadId = url.searchParams.get("leadId");

  type WithTags = { id: number; _embedded?: { tags?: Array<{ id: number; name: string }> } };
  const tagsOf = (x: WithTags | null | undefined) => (x?._embedded?.tags ?? []).map((t) => t.name);

  try {
    const token = await getAccessToken(conn);

    const [contactTags, leadTags] = await Promise.all([
      getContactTags(conn, token).catch(() => []),
      getLeadTags(conn, token).catch(() => []),
    ]);
    const adTag = [...contactTags, ...leadTags].find((t) => t.name.toLowerCase().includes("an"));

    const cx = conn;
    // Helper: conta itens de um filtro de contatos (1 página)
    async function countContacts(qs: string) {
      const d = await kommoGet<{ _embedded?: { contacts?: WithTags[] } }>(cx, token, `/api/v4/contacts?limit=250&${qs}`);
      return d?._embedded?.contacts?.length ?? 0;
    }
    async function countLeads(qs: string) {
      const d = await kommoGet<{ _embedded?: { leads?: WithTags[] } }>(cx, token, `/api/v4/leads?limit=250&${qs}`);
      return d?._embedded?.leads?.length ?? 0;
    }

    // TESTE 1 — filtro por tag funciona? (tag real vs. tag falsa)
    const filterTest = adTag ? {
      tagUsada: adTag.name,
      contatosComTagReal: await countContacts(`filter[tags][]=${adTag.id}`),
      contatosComTagFALSA: await countContacts(`filter[tags][]=999999999`),
      leadsComTagReal: await countLeads(`filter[tags][]=${adTag.id}`),
      leadsComTagFALSA: await countLeads(`filter[tags][]=999999999`),
      semFiltro: await countContacts(`page=1`),
    } : "nenhuma tag de anúncio encontrada";

    // TESTE 2 — ler um lead específico direto (detalhe) traz as tags?
    let leadProbe: unknown = "passe ?leadId=NUMERO para testar";
    if (probeLeadId) {
      const lead = await kommoGet<WithTags & { name?: string; status_id?: number; _embedded?: { tags?: Array<{ id: number; name: string }>; contacts?: Array<{ id: number }> } }>(
        conn, token, `/api/v4/leads/${probeLeadId}?with=contacts`,
      ).catch((e) => ({ erro: String(e) } as unknown as null));
      const cid = (lead as { _embedded?: { contacts?: Array<{ id: number }> } })?._embedded?.contacts?.[0]?.id;
      const contact = cid ? await kommoGet<WithTags & { name?: string }>(conn, token, `/api/v4/contacts/${cid}`).catch(() => null) : null;
      leadProbe = {
        leadEncontrado: !!lead && !("erro" in (lead as object)),
        tagsNoLead: tagsOf(lead as WithTags),
        contatoId: cid ?? null,
        tagsNoContato: tagsOf(contact),
        raw: lead,
      };
    }

    return NextResponse.json({
      tagsDeContato: contactTags.map((t) => t.name),
      tagsDeLead: leadTags.map((t) => t.name),
      filterTest,
      leadProbe,
    });
  } catch (e) {
    if (e instanceof KommoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
