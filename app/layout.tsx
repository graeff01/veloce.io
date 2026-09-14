import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { CookieConsent } from "@/components/cookie-consent";

export const metadata: Metadata = {
  title: "veloce.io",
  description: "Plataforma interna de gestão operacional",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/logo.png", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `suppressHydrationWarning`: o script anti-flash carimba data-pt no <html>
    // ANTES do React hidratar — o servidor não tem como saber o tema salvo no
    // aparelho. A divergência é o desenho funcionando, não um defeito, e o
    // aviso só escondia erros de verdade no console.
    <html lang="pt-BR" className="h-full" suppressHydrationWarning>
      <body className="h-full antialiased">
        <Providers>{children}</Providers>
        <CookieConsent />
      </body>
    </html>
  );
}
