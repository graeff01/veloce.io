import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { computeMetaAdsView } from "@/lib/meta-ads-view";

// GET /api/clients/[id]/meta/ads?year=&month=
// Campanhas e anúncios (dimensional + leads reais por ad_id). Lê do banco — não
// chama a Meta — então mostra os dados sincronizados mesmo se o token expirou.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  try {
    const data = await computeMetaAdsView(id, start, end);
    return NextResponse.json(data);
  } catch (e) {
    // Erro transitório (banco lento, deploy em curso) — não quebra a tela.
    console.error("[meta/ads] erro ao computar view:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { connected: true, hasData: false, totals: { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpc: 0, leads: 0, metaLeads: 0, cpl: null }, campaigns: [], ads: [], leadsSemIdentificacao: 0 },
      { status: 200 }
    );
  }
}
