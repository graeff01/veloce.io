import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";
// Os 3 formatos que apresentamos lado a lado.
const SET = [
  { format: "MOBILE_FEED_STANDARD", label: "Feed" },
  { format: "INSTAGRAM_STORY", label: "Story" },
  { format: "INSTAGRAM_REELS", label: "Reels" },
];

async function fetchPreview(adId: string, format: string, token: string) {
  try {
    const res = await fetch(`${GRAPH}/${adId}/previews?ad_format=${format}&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    if (!res.ok || json.error) return { src: null as string | null, width: null as number | null, height: null as number | null };
    const body: string | undefined = json.data?.[0]?.body;
    if (!body) return { src: null, width: null, height: null };
    const src = body.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;
    const width = Number(body.match(/width="?(\d+)/)?.[1]) || null;
    const height = Number(body.match(/height="?(\d+)/)?.[1]) || null;
    return { src, width, height };
  } catch {
    return { src: null, width: null, height: null };
  }
}

// GET /api/clients/[id]/meta/ad-preview?adId=
// Devolve as prévias oficiais (Meta) do anúncio nos 3 formatos, de uma vez.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const adId = url.searchParams.get("adId") ?? "";
  if (!adId) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const conn = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true, accessToken: true } });
  if (!conn) return NextResponse.json({ error: "Conexão Meta não configurada." }, { status: 404 });
  const ad = await prisma.metaAd.findUnique({ where: { connectionId_adId: { connectionId: conn.id, adId } }, select: { adId: true } });
  if (!ad) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });

  const token = decryptSecret(conn.accessToken);
  const previews = await Promise.all(SET.map(async (s) => ({ ...s, ...(await fetchPreview(adId, s.format, token)) })));
  return NextResponse.json({ previews });
}
