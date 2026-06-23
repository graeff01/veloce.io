import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";

const GRAPH = "https://graph.facebook.com/v21.0";
// Formatos suportados (o anúncio renderiza nativo, com vídeo tocando).
const FORMATS = new Set([
  "MOBILE_FEED_STANDARD", "INSTAGRAM_STANDARD", "INSTAGRAM_STORY",
  "FACEBOOK_STORY_MOBILE", "INSTAGRAM_REELS",
]);

// GET /api/clients/[id]/meta/ad-preview?adId=&format=
// Devolve o iframe oficial de prévia do anúncio (Meta) para abrir no formato real.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const url = new URL(req.url);
  const adId = url.searchParams.get("adId") ?? "";
  const format = url.searchParams.get("format") ?? "MOBILE_FEED_STANDARD";
  if (!adId || !FORMATS.has(format)) {
    return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });
  }

  const conn = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true, accessToken: true } });
  if (!conn) return NextResponse.json({ error: "Conexão Meta não configurada." }, { status: 404 });

  // O anúncio precisa pertencer a esta conexão.
  const ad = await prisma.metaAd.findUnique({ where: { connectionId_adId: { connectionId: conn.id, adId } }, select: { adId: true } });
  if (!ad) return NextResponse.json({ error: "Anúncio não encontrado." }, { status: 404 });

  const token = decryptSecret(conn.accessToken);
  try {
    const res = await fetch(`${GRAPH}/${adId}/previews?ad_format=${format}&access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    if (!res.ok || json.error) {
      const code = json.error?.code;
      let msg = json.error?.message ?? "Erro ao gerar a prévia.";
      if (code === 190) msg = "Token do Meta expirado/revogado. Atualize o token.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const body: string | undefined = json.data?.[0]?.body;
    if (!body) return NextResponse.json({ src: null, error: "Sem prévia disponível neste formato." });

    // Extrai src/dimensões do iframe que a Meta devolve (em vez de injetar HTML).
    const src = body.match(/src="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? null;
    const width = Number(body.match(/width="?(\d+)/)?.[1]) || null;
    const height = Number(body.match(/height="?(\d+)/)?.[1]) || null;
    if (!src) return NextResponse.json({ src: null, error: "Prévia indisponível." });
    return NextResponse.json({ src, width, height });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falha ao falar com a Meta." }, { status: 502 });
  }
}
