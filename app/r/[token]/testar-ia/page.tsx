import { prisma } from "@/lib/prisma";
import { resolvePortal, getPortalShellData } from "@/lib/notifications/client-portal";
import { redirect } from "next/navigation";
import { themeStyle, themeSwitchCss, themeInitScript, PORTAL_UI_CSS } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalAiTest } from "@/components/portal/portal-ai-test";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aba TEMPORÁRIA de teste da IA (removível: token "teste" nas seções do portal).
export default async function TestarIaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);

  if (!portal) {
    return (
      <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#101319", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1></div>
      </main>
    );
  }

  const [client, cp, cfg] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } }),
    prisma.clientPortal.findUnique({ where: { clientId: portal.clientId }, select: { sections: true } }),
    prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { assistantName: true } }),
  ]);

  const testOn = (cp?.sections ?? "").split(",").map((s) => s.trim()).includes("teste");
  if (!testOn) redirect(`/r/${token}/conversas`);
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
    <main className="imain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="teste" sections={shell.sections} account={shell.account} aiTest={shell.aiTest} />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} ${PORTAL_UI_CSS} *{box-sizing:border-box}
        .imain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background:var(--p-bg)}
        @media(min-width:1024px){ .imain{margin-left:236px} }
        .ptop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--p-border);background:color-mix(in srgb,var(--p-bg) 82%,transparent);backdrop-filter:saturate(180%) blur(12px)}
        .ptop h1{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0}
        .ptop .sub{color:var(--p-muted);font-size:12.5px}`}</style>

      <div className="ptop">
        <div><h1>Testar IA</h1><div className="sub">Simulação do atendimento · não envia WhatsApp</div></div>
      </div>

      <div className="p-wrap">
        <PortalAiTest token={token} assistantName={cfg?.assistantName ?? null} />
      </div>
    </main>
  );
}
