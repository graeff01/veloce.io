import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { diagnoseAds } from "@/lib/ad-diagnosis";
import { buildAdsNarrative } from "@/lib/ad-diagnosis-narrative";

export const runtime = "nodejs";

// GET /api/clients/[id]/meta/ads/diagnosis?year=&month=
// Diagnóstico individual por anúncio: motor determinístico (vereditos + evidência
// + confiança) cruzando dado modelado (Meta) × real (WhatsApp), com narrativa IA
// fina por cima. Lê do banco — não chama a Meta.
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
    const diag = await diagnoseAds(id, start, end);
    const narrative = await buildAdsNarrative(diag);
    return NextResponse.json({ ...diag, narrative, period: { year, month } });
  } catch (e) {
    console.error("[meta/ads/diagnosis] erro:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { connected: true, hasData: false, baselineCpl: null, ads: [], counts: { critical: 0, warning: 0, positive: 0, info: 0, neutral: 0 }, narrative: { text: "", source: "fallback" }, period: { year, month } },
      { status: 200 },
    );
  }
}
