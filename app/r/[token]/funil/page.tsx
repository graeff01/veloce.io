import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getClientFunnel } from "@/lib/notifications/client-funnel";
import { themeStyle, themeSwitchCss, themeInitScript } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalFunnel } from "@/components/portal/portal-funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function FunilPage({ params }: { params: Promise<{ token: string }> }) {
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

  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} />
      </main>
    );
  }

  const funnel = await getClientFunnel(portal.clientId);

  return (
    <main className="fmain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="funil" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .fmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;
          background-color:var(--p-bg);
          background-image:radial-gradient(1100px 460px at 50% -120px, var(--p-accent-soft), transparent 70%), radial-gradient(var(--p-border) 1px, transparent 1.5px);
          background-size:100% 560px, 24px 24px;background-repeat:no-repeat, repeat;background-position:center top, center top;background-attachment:fixed, fixed;}
        .fdot{transition:transform .14s ease}
        .fdot:hover{transform:scale(1.35);z-index:10;position:relative}`}</style>
      <PortalFunnel token={token} data={funnel} />
    </main>
  );
}
