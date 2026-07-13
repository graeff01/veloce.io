import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";

// Manifest POR CLIENTE: quando o cliente adiciona o link à tela inicial (Android),
// o ícone e o nome do atalho são os DELE (logo + marca), não os da Veloce.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new Response("{}", { status: 404, headers: { "Content-Type": "application/manifest+json" } });

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true } });
  const name = client?.name || "Painel";

  const manifest = {
    name,
    short_name: name.slice(0, 12),
    start_url: `/r/${token}/conversas`, // atalho abre direto nas mensagens (foco mobile)
    scope: `/r/${token}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: portal.accentColor || "#111111",
    // Ícone = logo do cliente servido como imagem real (a rota /logo decodifica o data
    // URI; data URI não vale como ícone de manifest). Fallback pro ícone da Veloce.
    icons: [
      { src: `/r/${token}/logo?size=192`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/r/${token}/logo?size=512`, sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}
