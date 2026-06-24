import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { generateNextAd } from "@/lib/ad-creative-generator";

export const runtime = "nodejs";

// GET /api/clients/[id]/meta/ads/generate?adId=&year=&month=
// IA gera o material do PRÓXIMO anúncio (copy + roteiro) a partir das conversas
// reais dos leads daquele anúncio. Entrega pronto para a equipe produzir.
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
  const ad = meta ? await prisma.metaAd.findUnique({ where: { connectionId_adId: { connectionId: meta.id, adId } }, select: { name: true } }) : null;

  const result = await generateNextAd(id, { adId, adName: ad?.name ?? null }, start, end);
  return NextResponse.json(result);
}
