import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";

// Manifest POR CLIENTE: quando o cliente adiciona o link à tela inicial (Android),
// o ícone e o nome do atalho são os DELE (logo + marca), não os da Veloce.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new Response("{}", { status: 404, headers: { "Content-Type": "application/manifest+json" } });

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });
  const name = client?.name || "Painel";
  const logo = normalizeIcon(client?.logoUrl);

  const manifest = {
    name,
    short_name: name.slice(0, 12),
    start_url: `/r/${token}`,
    scope: `/r/${token}`,
    display: "standalone",
    background_color: "#ffffff",
    theme_color: portal.accentColor || "#111111",
    icons: [{ src: logo, sizes: "any", type: "image/png", purpose: "any" }],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}

// Logo do cliente como ícone; fallback pro ícone da Veloce se o cliente não tem logo.
function normalizeIcon(url: string | null | undefined): string {
  if (!url) return "/apple-icon.png";
  if (/^https?:\/\//.test(url) || url.startsWith("/")) return url;
  return `/${url}`;
}
