import type { Metadata } from "next";
import { existsSync } from "fs";
import { join } from "path";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { themeStyle } from "@/lib/portal-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP = (process.env.NEXTAUTH_URL || "https://veloceio-production.up.railway.app").replace(/\/$/, "");

async function load(token: string) {
  const portal = await resolvePortal(token);
  if (!portal) return null;
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true, slug: true, googleReviewUrl: true } });
  const staticIcon = client?.slug && existsSync(join(process.cwd(), "public", "icone_atalho", `${client.slug}.png`)) ? `/icone_atalho/${client.slug}.png` : null;
  return { portal, client, ogImage: staticIcon ? `${APP}${staticIcon}` : `${APP}/r/${token}/logo` };
}

// OG tags → o WhatsApp mostra um CARD (imagem da loja + título) quando o link é enviado.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const d = await load(token);
  const name = d?.client?.name || "nossa loja";
  const title = `Avalie a ${name} ⭐`;
  const description = "Sua avaliação ajuda muito! Deixe sua nota no Google — leva 30 segundos. 🙏";
  const images = d ? [d.ogImage] : undefined;
  return {
    title,
    description,
    openGraph: { title, description, images, type: "website" },
    twitter: { card: "summary_large_image", title, description, images },
    robots: { index: false },
  };
}

export default async function AvaliarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const d = await load(token);

  if (!d) {
    return (
      <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#101319", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1></div>
      </main>
    );
  }
  const { portal, client } = d;
  const name = client?.name || "nossa loja";
  const reviewUrl = client?.googleReviewUrl || null;

  return (
    <main style={{ minHeight: "100dvh", background: "var(--p-bg)", color: "var(--p-text)", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        @keyframes pop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}
        .star{display:inline-block;animation:pop .4s cubic-bezier(.22,1,.36,1) both}`}</style>

      <div style={{ width: "100%", maxWidth: 420, textAlign: "center", background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 20, padding: "32px 26px", boxShadow: "0 10px 40px rgba(0,0,0,.08)" }}>
        <div style={{ width: 84, height: 84, margin: "0 auto 18px", borderRadius: 18, overflow: "hidden", background: "var(--p-bg)", border: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {client?.logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={client.logoUrl} alt={name} width={84} height={84} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <span style={{ fontSize: 34, fontWeight: 800, color: "var(--p-accent)" }}>{name[0]?.toUpperCase()}</span>}
        </div>

        <div style={{ fontSize: 30, letterSpacing: 2, marginBottom: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => <span key={i} className="star" style={{ animationDelay: `${i * 80}ms`, color: "#F5A623" }}>★</span>)}
        </div>

        <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em", margin: "10px 0 6px" }}>Gostou da sua experiência com a {name}?</h1>
        <p style={{ fontSize: 14.5, color: "var(--p-muted)", lineHeight: 1.5, margin: "0 0 22px" }}>Sua avaliação no Google ajuda demais quem também está pensando em comprar. Leva 30 segundos! 🙏</p>

        {reviewUrl ? (
          <a href={reviewUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", width: "100%", padding: "15px 20px", borderRadius: 14, background: "var(--p-accent)", color: "var(--p-on-accent)", fontSize: 16, fontWeight: 800, textDecoration: "none", boxShadow: "0 6px 20px color-mix(in srgb, var(--p-accent) 40%, transparent)" }}>
            ⭐ Avaliar no Google
          </a>
        ) : (
          <div style={{ padding: "15px 20px", borderRadius: 14, background: "var(--p-bg)", border: "1px dashed var(--p-border)", color: "var(--p-muted)", fontSize: 14 }}>Página de avaliação em configuração.</div>
        )}

        <p style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 16, opacity: 0.8 }}>Obrigado por escolher a {name} 🔥</p>
      </div>
    </main>
  );
}
