import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { themeStyle, themeSwitchCss, themeInitScript } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalConversations } from "@/components/portal/portal-conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ConversasPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);

  if (!portal) {
    return (
      <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#101319", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1>
          <p style={{ color: "#6b7480", marginTop: 6, fontSize: 14 }}>Este link foi desativado ou expirou. Peça um novo à sua agência.</p>
        </div>
      </main>
    );
  }

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });

  // Login do painel: conversas exigem sessão se o cliente está protegido.
  if (await isProtected(portal.clientId) && !(await getPortalSessionEmail(portal.clientId))) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} />
      </main>
    );
  }

  return (
    <main className="cmain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="conversas" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .cmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;
          background-color:var(--p-bg);
          background-image:radial-gradient(1100px 460px at 50% -120px, var(--p-accent-soft), transparent 70%), radial-gradient(var(--p-border) 1px, transparent 1.5px);
          background-size:100% 560px, 24px 24px;background-repeat:no-repeat, repeat;background-position:center top, center top;background-attachment:fixed, fixed;}
        /* só PC — no celular mostra recado */
        .cmobile{display:flex;min-height:100dvh;align-items:center;justify-content:center;padding:24px;text-align:center}
        .cdesk{display:none}
        @media(min-width:760px){ .cmobile{display:none} .cdesk{display:flex} }`}</style>

      <div className="cmobile">
        <div>
          <div style={{ fontSize: 36 }}>💻</div>
          <h1 style={{ fontSize: 17, marginTop: 10, color: "var(--p-text)" }}>Disponível no computador</h1>
          <p style={{ fontSize: 13.5, color: "var(--p-muted)", marginTop: 6, maxWidth: 300, marginLeft: "auto", marginRight: "auto" }}>As conversas dos leads abrem melhor numa tela maior. Abra este link no computador.</p>
          <a href={`/r/${token}`} style={{ display: "inline-block", marginTop: 16, fontSize: 13, fontWeight: 600, color: "var(--p-accent)", textDecoration: "none" }}>← Voltar ao painel</a>
        </div>
      </div>

      <PortalConversations token={token} brandName={(client?.name || "Conversas")} logoUrl={client?.logoUrl ?? null} />
    </main>
  );
}
