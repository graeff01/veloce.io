import type { Metadata } from "next";
import { existsSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

// Metadata do portal do cliente: no MOBILE, o atalho na tela inicial usa o logo e o
// nome do CLIENTE (apple-touch-icon no iOS + manifest por token no Android). O favicon
// do desktop segue o da Veloce (só o atalho mobile muda).
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return {};
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, slug: true } });
  const name = client?.name || "Painel";

  // Ícone do atalho (iOS apple-touch-icon): arquivo estático próprio do cliente em
  // public/icone_atalho/<slug>.png quando existir (fixo e confiável). Senão, cai na
  // rota /logo (que serve o logo do banco). Favicon do desktop segue a Veloce.
  const appleIcon = client?.slug && existsSync(join(process.cwd(), "public", "icone_atalho", `${client.slug}.png`))
    ? `/icone_atalho/${client.slug}.png`
    : `/r/${token}/logo`;
  return {
    title: name,
    manifest: `/r/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    icons: { icon: [{ url: "/favicon.ico" }, { url: "/logo.png", type: "image/png" }], apple: appleIcon },
  };
}

export default function PortalTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
