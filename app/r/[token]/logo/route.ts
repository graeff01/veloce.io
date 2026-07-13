import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";

// Serve o logo do cliente como IMAGEM REAL (URL) — necessário porque o logo é salvo
// como data URI base64 no banco, e iOS/Android NÃO aceitam data URI em apple-touch-icon
// nem em ícone de manifest. Aqui decodificamos (ou proxiamos http) e devolvemos bytes.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fallback = () => Response.redirect(new URL("/apple-icon.png", req.url), 302);

  const portal = await resolvePortal(token);
  if (!portal) return fallback();
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { logoUrl: true } });
  const url = client?.logoUrl;
  if (!url) return fallback();

  // data URI base64 → bytes
  const m = url.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (m) {
    const buf = Buffer.from(m[2], "base64");
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=3600" } });
  }
  // URL http(s) → proxia (mantém same-origin pro ícone)
  if (/^https?:\/\//.test(url)) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      return new Response(new Uint8Array(buf), { headers: { "Content-Type": r.headers.get("content-type") || "image/png", "Cache-Control": "public, max-age=3600" } });
    }
  }
  return fallback();
}
