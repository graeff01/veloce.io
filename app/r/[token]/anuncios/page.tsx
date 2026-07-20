import { prisma } from "@/lib/prisma";
import { resolvePortal, effectiveSections } from "@/lib/notifications/client-portal";
import { redirect } from "next/navigation";
import { getClientAds } from "@/lib/notifications/client-ads";
import { normalizePeriod, recentMonths } from "@/lib/notifications/client-report";
import { themeStyle, themeSwitchCss, themeInitScript, PORTAL_UI_CSS } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalPeriod } from "@/components/portal/portal-period";
import { PortalCreativeMedia } from "@/components/portal/portal-creative-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const int = (v: number) => v.toLocaleString("pt-BR");

function money(v: number, currency: string) {
  try { return v.toLocaleString("pt-BR", { style: "currency", currency }); } catch { return `${currency} ${v.toFixed(2)}`; }
}

function DeltaChip({ pct, goodWhenUp }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct == null) return <span className="p-chip flat">— estável</span>;
  const up = pct >= 0;
  const cls = goodWhenUp === undefined ? "flat" : up === goodWhenUp ? "up" : "down";
  return <span className={`p-chip ${cls}`}>{up ? "▲" : "▼"} {up ? "+" : ""}{pct}%</span>;
}

export default async function AnunciosPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params;
  const { p } = await searchParams;
  const months = recentMonths(12);
  const period = normalizePeriod(p);
  const selected = period === "week" ? "week" : period === "month" ? months[0].value : period;
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
  if (!(await effectiveSections(portal.clientId, sessionEmail)).includes("anuncios")) redirect(`/r/${token}/conversas`);

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });

  if ((await isProtected(portal.clientId)) && !sessionEmail) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} />
      </main>
    );
  }

  const data = await getClientAds(portal.clientId, period);
  const cur = data.currency;

  const summary = !data.hasMeta
    ? "Assim que sua conta de anúncios estiver conectada, a transparência do investimento aparece aqui."
    : data.spend === 0
      ? "Ainda não há investimento registrado neste período. Os números aparecem aqui automaticamente."
      : `Neste período foram investidos ${money(data.spend, cur)} em anúncios, gerando ${int(data.leads)} lead${data.leads !== 1 ? "s" : ""}${data.cpl != null ? ` a ${money(data.cpl, cur)} cada` : ""}.`;


  return (
    <main className="amain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="anuncios" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} ${PORTAL_UI_CSS} *{box-sizing:border-box}
        .amain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background:var(--p-bg)}
        @media(min-width:1024px){ .amain{margin-left:236px} }
        .ptop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--p-border);background:color-mix(in srgb,var(--p-bg) 82%,transparent);backdrop-filter:saturate(180%) blur(12px)}
        .ptop h1{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0}
        .ptop .sub{color:var(--p-muted);font-size:12.5px}
        .p-track{height:7px;border-radius:5px;background:var(--p-raise);overflow:hidden}
        .p-track>span{display:block;height:100%;border-radius:5px;background:var(--p-accent)}
        @media print{.ptop{display:none!important}}`}</style>

      <div className="ptop">
        <div><h1>Anúncios</h1><div className="sub">Meta Ads · {data.periodLabel}</div></div>
        <div style={{ marginLeft: "auto" }}><PortalPeriod selected={selected} months={months} /></div>
      </div>

      <div className="p-wrap">
        {summary && (
          <div className="p-panel">
            <div className="p-phead"><h2>Transparência de anúncios</h2><span className="hint">{data.periodLabel}</span></div>
            <p style={{ padding: "14px 18px", fontSize: 14.5, lineHeight: 1.55, color: "var(--p-text)", margin: 0 }}>{summary}</p>
          </div>
        )}

        <div className="p-panel">
          <div className="p-metrics" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
            <div className="p-metric">
              <div className="k">Investido</div>
              <div className="v">{money(data.spend, cur)}</div>
              <DeltaChip pct={data.deltas.spend} />
            </div>
            <div className="p-metric">
              <div className="k">Leads de anúncio</div>
              <div className="v">{int(data.leads)}</div>
              <div className="foot">pessoas que chegaram pela mídia</div>
            </div>
            <div className="p-metric">
              <div className="k">Custo por lead</div>
              <div className="v">{data.cpl != null ? money(data.cpl, cur) : "—"}</div>
              <DeltaChip pct={data.deltas.cpl} goodWhenUp={false} />
            </div>
          </div>

          <div className="p-split">
            {/* Pra onde foi o investimento */}
            <div>
              <div className="p-eyebrow">Pra onde foi o investimento</div>
              {data.topCampaigns.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>Assim que houver gasto em campanhas, a divisão do investimento aparece aqui.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 14 }}>
                  {data.topCampaigns.map((c, i) => (
                    <div key={i}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 12.5, color: "var(--p-text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                        <span className="tnum" style={{ fontSize: 12, color: "var(--p-muted)", flexShrink: 0 }}>{money(c.spend, cur)} · {int(c.leads)} lead{c.leads !== 1 ? "s" : ""}{c.cpl != null ? ` · ${money(c.cpl, cur)}/lead` : ""}</span>
                      </div>
                      <div className="p-track"><span style={{ width: `${c.pctSpend}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Melhor anúncio */}
            <div>
              <div className="p-eyebrow">Anúncio que mais trouxe leads</div>
              {!data.bestCreative ? (
                <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>O anúncio destaque aparece aqui quando os leads começarem a chegar.</div>
              ) : (
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "var(--p-raise)", border: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <PortalCreativeMedia
                      videoSrc={data.bestCreative.videoId && data.bestCreative.creativeId ? `/api/portal/${token}/creative/${data.bestCreative.creativeId}/video` : null}
                      poster={data.bestCreative.image}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.bestCreative.campaignName}</div>
                    <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 2 }}>{int(data.bestCreative.leads)} lead{data.bestCreative.leads !== 1 ? "s" : ""} no período</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: "var(--p-muted)", opacity: 0.9, lineHeight: 1.5, padding: "0 2px" }}>
          <b style={{ color: "var(--p-text)" }}>Otimização contínua da Veloce</b> — acompanhamos o desempenho de cada campanha e realocamos o investimento pro que traz mais leads pelo menor custo.
        </p>
      </div>
    </main>
  );
}
