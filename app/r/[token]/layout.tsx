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
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true } });
  const name = client?.name || "Painel";

  // apple-touch-icon = logo do cliente servido como imagem real (rota /logo — o logo é
  // data URI no banco, que iOS/Android não aceitam direto). A rota faz fallback pro
  // ícone da Veloce se o cliente não tem logo. Favicon do desktop segue a Veloce.
  return {
    title: name,
    manifest: `/r/${token}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    icons: { icon: [{ url: "/favicon.ico" }, { url: "/logo.png", type: "image/png" }], apple: `/r/${token}/logo` },
  };
}

export default function PortalTokenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
