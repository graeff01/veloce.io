import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getAccessToken, getLeads, kommoGet, KommoError } from "@/lib/kommo";

// GET — diagnóstico final: recência da listagem, filtro por funil/etapa e tag no lead novo.
// ?leadId=15007912  (um lead novo, do anúncio) — opcional.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const conn = await prisma.kommoConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "Conexão Kommo não configurada" }, { status: 404 });

  const url = new URL(req.url);
  const probe = url.searchParams.get("leadId");
  const cx = conn;

  type Lead = { id: number; status_id?: number; pipeline_id?: number; created_at: number; _embedded?: { tags?: Array<{ name: string }> } };

  try {
    const token = await getAccessToken(conn);
    const fmt = (s: number) => new Date(s * 1000).toLocaleString("pt-BR");

    // 1) A listagem traz os leads recentes? (puxa várias páginas e olha datas)
    const all = await getLeads(conn, token, { maxPages: 10 });
    const dates = all.map((l) => l.created_at);
    const probeNum = probe ? Number(probe) : null;

    // 2) Filtro por funil/etapa funciona? (usa pipeline/status de um lead existente)
    const ref = all[0];
    async function countLeads(qs: string) {
      const d = await kommoGet<{ _embedded?: { leads?: Lead[] } }>(cx, token, `/api/v4/leads?limit=250&${qs}`);
      return d?._embedded?.leads?.length ?? 0;
    }
    const pipelineTest = ref?.pipeline_id ? {
      pipelineUsado: ref.pipeline_id,
      leadsComPipelineReal: await countLeads(`filter[pipeline_id]=${ref.pipeline_id}`),
      leadsComPipelineFALSO: await countLeads(`filter[pipeline_id]=999999999`),
      semFiltro: all.length >= 250 ? 250 : all.length,
    } : "sem pipeline de referência";

    // 3) Fila de entrada (unsorted) — os leads de hoje estão aqui?
    const unsorted = await kommoGet<{ _embedded?: { unsorted?: Array<{ uid: string; category: string; created_at: number }> }, _total_items?: number }>(
      cx, token, `/api/v4/leads/unsorted?limit=5`,
    ).catch((e) => ({ erro: String(e) } as unknown));

    // 4) O lead novo (bot novo marca o LEAD) — a tag aparece no detalhe do lead?
    let novoLead: unknown = "passe ?leadId=NUMERO de um lead novo do anúncio";
    if (probeNum) {
      const l = await kommoGet<Lead & { name?: string }>(cx, token, `/api/v4/leads/${probeNum}`).catch((e) => ({ erro: String(e) } as unknown as null));
      novoLead = {
        achado: !!l && !("erro" in (l as object)),
        tagsNoLead: ((l as Lead)?._embedded?.tags ?? []).map((t) => t.name),
        statusId: (l as Lead)?.status_id,
        pipelineId: (l as Lead)?.pipeline_id,
        apareceNaListagem: probeNum ? all.some((x) => x.id === probeNum) : null,
      };
    }

    return NextResponse.json({
      listagem: {
        totalPuxado: all.length,
        maisRecente: dates.length ? fmt(Math.max(...dates)) : null,
        maisAntigo: dates.length ? fmt(Math.min(...dates)) : null,
      },
      pipelineTest,
      unsorted,
      novoLead,
    });
  } catch (e) {
    if (e instanceof KommoError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
