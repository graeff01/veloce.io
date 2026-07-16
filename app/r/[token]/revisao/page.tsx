import { prisma } from "@/lib/prisma";
import { resolvePortal, getPortalShellData } from "@/lib/notifications/client-portal";
import { themeSwitchCss, themeInitScript, themeStyle } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalRevisao } from "@/components/portal/portal-revisao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RevisaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1></div>
      </main>
    );
  }
  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });
  const shell = await getPortalShellData(portal.clientId);

  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} />
      </main>
    );
  }

  return (
    <main className="fmain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="revisao" sections={shell.sections} account={shell.account} aiTest={shell.aiTest} />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .fmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background-color:var(--p-bg);
          background-image:radial-gradient(1100px 460px at 50% -120px, var(--p-accent-soft), transparent 70%);background-repeat:no-repeat;background-position:center top;background-attachment:fixed}`}</style>
      <PortalRevisao token={token} />
    </main>
  );
}
