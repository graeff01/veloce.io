import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // depende do logoUrl no banco — nunca cachear a resposta
export const revalidate = 0;

// Serve o logo do PERFIL do cliente como ÍCONE REAL (para o atalho na tela inicial /
// apple-touch-icon). O logo é salvo como data URI base64 no banco, e iOS/Android NÃO
// aceitam data URI como ícone. Aqui decodificamos (ou proxiamos http), NORMALIZAMOS
// para um quadrado no tamanho pedido (?size=) e devolvemos bytes. O tamanho certo é o
// que faz o sistema aceitar o ícone — senão ele cai num print da página (fundo do chat).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fallback = () => Response.redirect(new URL("/apple-icon.png", req.url), 302);

  const portal = await resolvePortal(token);
  if (!portal) return fallback();
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { logoUrl: true } });
  const url = client?.logoUrl;
  if (!url) return fallback();

  // bytes crus do logo (data URI base64 OU http proxiado)
  let raw: Buffer | null = null;
  const m = url.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/i);
  if (m) {
    raw = Buffer.from(m[1], "base64");
  } else if (/^https?:\/\//.test(url)) {
    const r = await fetch(url).catch(() => null);
    if (r?.ok) raw = Buffer.from(await r.arrayBuffer());
  }
  if (!raw) return fallback();

  // Normaliza para um ícone quadrado no tamanho pedido (192/512). Fundo branco no
  // padding (evita fundo preto se o logo for transparente). Se falhar, devolve cru.
  const reqSize = Number(new URL(req.url).searchParams.get("size"));
  const size = Number.isFinite(reqSize) ? Math.min(1024, Math.max(48, reqSize)) : 512;
  try {
    const png = await sharp(raw)
      .resize(size, size, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return new Response(new Uint8Array(raw), { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" } });
  }
}
