import { prisma } from "@/lib/prisma";
import { resolvePortal, effectiveSections } from "@/lib/notifications/client-portal";
import { redirect } from "next/navigation";
import { themeStyle, themeSwitchCss, themeInitScript, PORTAL_UI_CSS } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalTeam } from "@/components/portal/portal-team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function EquipePage({ params }: { params: Promise<{ token: string }> }) {
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

  const sessionEmail = await getPortalSessionEmail(portal.clientId);
  if (!(await effectiveSections(portal.clientId, sessionEmail)).includes("equipe")) redirect(`/r/${token}/conversas`);

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });

  if ((await isProtected(portal.clientId)) && !sessionEmail) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} />
      </main>
    );
  }

  return (
    <main className="tmain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="equipe" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} ${PORTAL_UI_CSS} *{box-sizing:border-box}
        .tmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background:var(--p-bg)}
        @media(min-width:1024px){ .tmain{margin-left:236px} }`}</style>
      <PortalTeam token={token} />
    </main>
  );
}
