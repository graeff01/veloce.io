import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

// Metadata do portal do cliente: no MOBILE, o atalho na tela inicial usa o logo e o
// nome do CLIENTE (apple-touch-icon no iOS + manifest por token no Android). O favicon
// do desktop segue o da Veloce (só o atalho mobile muda).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return {};
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });
  const name = client?.name || "Painel";
  const logo = normalizeIcon(client?.logoUrl);

  const md: Metadata = {
    title: name,
    manifest: `/r/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
  };
  // Só troca o ícone do atalho (apple) pelo do cliente quando ele tem logo; mantém o
  // favicon do desktop (icon) apontando pra Veloce.
  if (logo) {
    md.icons = { icon: [{ url: "/favicon.ico" }, { url: "/logo.png", type: "image/png" }], apple: logo };
  }
  return md;
}

function normalizeIcon(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url) || url.startsWith("/")) return url;
  return `/${url}`;
}

export default function PortalTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
