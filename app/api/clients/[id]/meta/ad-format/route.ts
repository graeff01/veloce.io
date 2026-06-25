import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getCreativeMedia } from "@/lib/notifications/creative-media";

export const runtime = "nodejs";

// GET /api/clients/[id]/meta/ad-format?adId=
// Detecta o formato (vídeo/imagem/carrossel) do criativo do anúncio — pro
// preenchimento automático ao escolher o anúncio na Inteligência Competitiva.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const adId = new URL(req.url).searchParams.get("adId") ?? "";
  if (!adId) return NextResponse.json({ format: null });

  const conn = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  if (!conn) return NextResponse.json({ format: null });
  const ad = await prisma.metaAd.findUnique({ where: { connectionId_adId: { connectionId: conn.id, adId } }, select: { creativeId: true } });
  if (!ad?.creativeId) return NextResponse.json({ format: null });

  const media = await getCreativeMedia(id, ad.creativeId).catch(() => null);
  return NextResponse.json({ format: media?.format ?? null });
}
