import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getLeads, getContacts, getContactTags, getLeadTags, kommoGet, KommoError } from "@/lib/kommo";

// GET — diagnóstico: mostra a verdade do Kommo (datas dos leads mais recentes,
// onde estão as tags). Use só para investigar; não altera nada.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  try {
    const token = await getAccessToken(conn);

    // 1) Leads mais recentes (order desc) — confere se vêm os de hoje
    const leads = await getLeads(conn, token, { maxPages: 1 });
    const fmt = (s: number) => new Date(s * 1000).toLocaleString("pt-BR");
    const sampleLeads = leads.slice(0, 5).map((l) => ({
      id: l.id,
      name: l.name,
      created: fmt(l.created_at),
      leadTags: (l._embedded?.tags ?? []).map((t) => t.name),
      mainContactId: l._embedded?.contacts?.find((c) => c.is_main)?.id ?? l._embedded?.contacts?.[0]?.id ?? null,
    }));

    // 2) Tags da conta (lead e contato) — confere se "Anúncio ..." aparece
    const [leadTags, contactTags] = await Promise.all([
      getLeadTags(conn, token).catch(() => []),
      getContactTags(conn, token).catch(() => []),
    ]);

    // 3) Contato do lead mais recente — as tags vêm embutidas?
    const firstContactId = sampleLeads[0]?.mainContactId;
    const contacts = firstContactId ? await getContacts(conn, token, [firstContactId]) : new Map();
    const sampleContact = firstContactId ? contacts.get(firstContactId) ?? null : null;

    // 4) Teste de filtro por tag de anúncio nos CONTATOS
    const adTag = contactTags.find((t) => t.name.toLowerCase().includes("anuncio") || t.name.toLowerCase().includes("anúncio"))
      ?? leadTags.find((t) => t.name.toLowerCase().includes("anuncio") || t.name.toLowerCase().includes("anúncio"));
    let adTagFilterTest: unknown = "nenhuma tag de anúncio encontrada na lista de tags";
    if (adTag) {
      const data = await kommoGet<{ _embedded?: { contacts?: Array<{ id: number; name: string | null; _embedded?: { tags?: Array<{ name: string }> } }> } }>(
        conn, token, `/api/v4/contacts?limit=3&filter[tags][]=${adTag.id}`,
      );
      const found = data?._embedded?.contacts ?? [];
      adTagFilterTest = {
        tagTestada: adTag.name,
        contatosEncontrados: found.length,
        amostra: found.map((c) => ({ id: c.id, name: c.name, tags: (c._embedded?.tags ?? []).map((t) => t.name) })),
      };
    }

    return NextResponse.json({
      totalLeadsPrimeiraPagina: leads.length,
      leadMaisRecente: sampleLeads[0]?.created ?? null,
      leadMaisAntigoDaPagina: leads.length ? fmt(leads[leads.length - 1].created_at) : null,
      amostraLeads: sampleLeads,
      contagemTags: { lead: leadTags.length, contato: contactTags.length },
      tagsDeContato: contactTags.map((t) => t.name),
      tagsDeLead: leadTags.map((t) => t.name),
      contatoDoLeadMaisRecente: sampleContact,
      adTagFilterTest,
    }, { status: 200 });
  } catch (e) {
    if (e instanceof KommoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
