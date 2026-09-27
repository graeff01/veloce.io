import type { Metadata, Viewport } from "next";
import { existsSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { PortalPWA } from "@/components/portal/portal-pwa";

// SEM `viewport-fit=cover`, de propósito — isto é correção, não esquecimento.
//
// A teoria era que `cover` fazia `env(safe-area-inset-*)` valer. Na prática ele
// só vale junto com `statusBarStyle: "black-translucent"`. Com `"default"`, que é
// o que usamos, o iOS faz as DUAS coisas ruins ao mesmo tempo: deixa o conteúdo
// passar por baixo da barra de status E reporta os insets como ZERO. Aí toda
// reserva de notch do app calcula zero, nada protege a faixa, e o conteúdo rola
// por baixo do relógio — em todas as abas.
//
// Medido no print do usuário (iPhone Pro Max, 1290x2796): a barra do portal saía
// com 55px de altura (10+34+10), ou seja SEM o padding do notch. É a prova de
// que `env(safe-area-inset-top)` valia zero.
//
// Sem `cover`, o sistema reserva a faixa sozinho e o conteúdo nunca entra nela.
// Os `env(...)` continuam zero — agora CORRETAMENTE, porque não há o que
// reservar: quem reservou foi o iOS.
//
// A alternativa era `black-translucent`, que devolve os insets de verdade. Foi
// descartada: ela força texto CLARO na barra de status, e o tema é escolha de
// APARELHO (localStorage), não do cadastro — a JR está 'light' no banco e é usada
// no escuro. Não dá para saber no servidor com que tema a barra teria de
// combinar, então o relógio ficaria invisível para parte dos usuários.
//
// `themeColor` resolve um problema que PARECIA ser nosso: sem ele, o Safari usa
// a barra translúcida dele, que AMOSTRA o conteúdo da página por trás. No
// telefone isso lê como "o conteúdo está passando por cima da barra" — e
// nenhuma correção de CSS resolve, porque a barra não é nossa. Declarando a
// cor, o Safari pinta sólido.
//
// A cor segue o MODO do portal, não o do sistema: o cliente escolhe claro ou
// escuro no cadastro, e a barra do navegador tem que combinar com o que ele vê.
const CLARO = "#ffffff";  // --p-surface do tema claro
const ESCURO = "#14171d"; // --p-surface do tema escuro

export async function generateViewport({ params }: { params: Promise<{ token: string }> }): Promise<Viewport> {
  const { token } = await params;
  const portal = await resolvePortal(token).catch(() => null);
  const escuro = portal?.mode === "dark";
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: escuro ? ESCURO : CLARO,
  };
}

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
  return (
    <>
      {children}
      <PortalPWA />
    </>
  );
}
