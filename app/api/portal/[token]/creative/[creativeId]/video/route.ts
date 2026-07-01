import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { decryptSecret } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

// Fontes de vídeo da Meta EXPIRAM — nunca guardamos a URL; resolvemos fresca e
// cacheamos por pouco tempo em memória (Railway = instância longeva).
const cache = new Map<string, { url: string; exp: number }>();
const TTL_MS = 30 * 60 * 1000;

// Resolve a fonte do vídeo do criativo destaque e redireciona (302). Escopado pelo
// token do portal → cliente; só serve criativos da conexão Meta daquele cliente.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; creativeId: string }> }) {
  const { token, creativeId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new NextResponse(null, { status: 404 });

  const cached = cache.get(creativeId);
  if (cached && cached.exp > Date.now()) return NextResponse.redirect(cached.url, 302);

  const conn = await prisma.metaConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true, accessToken: true } });
  if (!conn) return new NextResponse(null, { status: 404 });
  const cr = await prisma.metaCreative.findUnique({ where: { connectionId_creativeId: { connectionId: conn.id, creativeId } }, select: { videoId: true } });
  if (!cr?.videoId) return new NextResponse(null, { status: 404 });

  try {
    const accessToken = decryptSecret(conn.accessToken);
    const res = await fetch(`${GRAPH}/${cr.videoId}?fields=source&access_token=${encodeURIComponent(accessToken)}`);
    const json = (await res.json()) as { source?: string };
    if (!res.ok || !json.source) return new NextResponse(null, { status: 404 });
    cache.set(creativeId, { url: json.source, exp: Date.now() + TTL_MS });
    return NextResponse.redirect(json.source, 302);
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
