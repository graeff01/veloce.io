import { existsSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Manifest POR CLIENTE: quando o cliente adiciona o link à tela inicial (Android),
// o ícone e o nome do atalho são os DELE (logo + marca), não os da Veloce.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return new Response("{}", { status: 404, headers: { "Content-Type": "application/manifest+json" } });

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, slug: true } });
  const name = client?.name || "Painel";

  // Ícone do atalho: arquivo estático próprio do cliente em public/icone_atalho/<slug>.png
  // (imagem fixa, confiável — não depende de ler o logo do banco). Fallback pra rota /logo.
  const staticIcon = client?.slug && existsSync(join(process.cwd(), "public", "icone_atalho", `${client.slug}.png`))
    ? `/icone_atalho/${client.slug}.png`
    : null;
  const icon192 = staticIcon || `/r/${token}/logo?size=192`;
  const icon512 = staticIcon || `/r/${token}/logo?size=512`;

  // Ícone adaptativo (Android recorta numa forma do sistema, cortando ~10% de
  // cada lado). Reaproveitar o logo comum aqui cortaria a marca do cliente, e
  // uma marca cortada é pior que o círculo branco. Então é opt-in: só entra
  // quando existe um arquivo desenhado para isso, com a margem de segurança.
  const maskable = client?.slug && existsSync(join(process.cwd(), "public", "icone_atalho", `${client.slug}-maskable.png`))
    ? `/icone_atalho/${client.slug}-maskable.png`
    : null;

  const manifest = {
    // `id` fixa a identidade do app entre atualizações. Sem ele, mudar a
    // start_url faz o Android achar que é OUTRO app e instalar duplicado.
    id: `/r/${token}`,
    name,
    short_name: name.slice(0, 12),
    start_url: `/r/${token}/conversas`, // atalho abre direto nas mensagens (foco mobile)
    scope: `/r/${token}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: portal.accentColor || "#111111",
    lang: "pt-BR",
    dir: "ltr",
    // Ícone = logo do cliente servido como imagem real (a rota /logo decodifica o data
    // URI; data URI não vale como ícone de manifest). Fallback pro ícone da Veloce.
    //
    icons: [
      { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: icon512, sizes: "512x512", type: "image/png", purpose: "any" },
      ...(maskable ? [{ src: maskable, sizes: "512x512", type: "image/png", purpose: "maskable" }] : []),
    ],
    // Atalhos ao segurar o ícone na tela inicial.
    shortcuts: [
      { name: "Conversas", short_name: "Conversas", url: `/r/${token}/conversas`, icons: [{ src: icon192, sizes: "192x192" }] },
      { name: "Funil", short_name: "Funil", url: `/r/${token}/funil`, icons: [{ src: icon192, sizes: "192x192" }] },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300" },
  });
}
