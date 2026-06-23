import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { computeMetaAdsView } from "@/lib/meta-ads-view";
import { analyzeAdConversations } from "@/lib/ad-conversation-intel";

export const runtime = "nodejs";

// GET /api/clients/[id]/meta/ads/intel?adId=&year=&month=
// Inteligência do anúncio: conversas reais dos leads (o que perguntam/objetam +
// recomendação de criativo via IA) + resultado real + ação sugerida (co-piloto).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const adId = url.searchParams.get("adId") ?? "";
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  if (!adId) return NextResponse.json({ error: "adId obrigatório." }, { status: 400 });

  const meta = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  const adMeta = meta ? await prisma.metaAd.findUnique({ where: { connectionId_adId: { connectionId: meta.id, adId } }, select: { name: true, campaignId: true } }) : null;

  const [view, intel] = await Promise.all([
    computeMetaAdsView(id, start, end),
    analyzeAdConversations(id, { adId }, start, end),
  ]);
  const adRow = view.ads.find((a) => a.adId === adId);

  // Ação sugerida (lado dinheiro — determinístico). O criativo vem da IA (intel).
  const spend = adRow?.spend ?? 0;
  const leads = adRow?.leads ?? 0;
  const cpl = adRow?.cpl ?? null;
  const baseline = view.totals.cpl;
  let action: { type: "escalar" | "pausar" | "ajustar" | "manter"; label: string; reason: string } = {
    type: "manter", label: "Manter e monitorar", reason: "Sem sinal forte para escalar ou pausar ainda.",
  };
  if (leads === 0 && spend >= 100) {
    action = { type: "pausar", label: "Pausar campanha", reason: `Gastou ${brl(spend)} sem nenhum lead real no WhatsApp.` };
  } else if (leads >= 2 && cpl != null && (baseline == null || cpl <= baseline)) {
    action = { type: "escalar", label: "Escalar (+20%/dia)", reason: `CPL real ${brl(cpl)} dentro/abaixo da referência com ${leads} leads.` };
  } else if (leads > 0 && cpl != null && baseline != null && cpl > baseline * 1.4) {
    action = { type: "ajustar", label: "Revisar criativo/segmentação", reason: `CPL real ${brl(cpl)} acima da referência ${brl(baseline)}.` };
  }

  return NextResponse.json({
    ad: { adId, name: adMeta?.name ?? adRow?.name ?? "Anúncio", campaignId: adMeta?.campaignId ?? adRow?.campaignId ?? null },
    results: { spend, leads, cpl },
    action,
    intel,
    period: { year, month },
  });
}

function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
