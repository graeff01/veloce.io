import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getClientAds } from "@/lib/notifications/client-ads";
import { normalizePeriod, recentMonths } from "@/lib/notifications/client-report";
import { themeStyle, themeSwitchCss, themeInitScript } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalPeriod } from "@/components/portal/portal-period";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const int = (v: number) => v.toLocaleString("pt-BR");

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.045)" };
const cap: React.CSSProperties = { fontSize: 11, color: "var(--p-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 };

function money(v: number, currency: string) {
  try { return v.toLocaleString("pt-BR", { style: "currency", currency }); } catch { return `${currency} ${v.toFixed(2)}`; }
}

function Delta({ pct, goodWhenUp }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const color = goodWhenUp === undefined ? "var(--p-muted)" : up === goodWhenUp ? "#16a34a" : "#d6453d";
  return <span style={{ fontSize: 12, fontWeight: 700, color, marginTop: 6, display: "inline-block" }}>{up ? "↑" : "↓"} {up ? "+" : ""}{pct}% <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>vs. anterior</span></span>;
}

function Kpi({ label, value, delta, goodWhenUp, sub }: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean; sub?: string }) {
  return (
    <div style={card}>
      <div style={cap}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: "var(--p-text)", lineHeight: 1.05, marginTop: 8, letterSpacing: "-0.02em" }}>{value}</div>
      {delta != null ? <Delta pct={delta} goodWhenUp={goodWhenUp} /> : sub ? <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 7 }}>{sub}</div> : null}
    </div>
  );
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

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });

  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} />
      </main>
    );
  }

  const data = await getClientAds(portal.clientId, period);
  const cur = data.currency;
  const maxSpend = Math.max(1, ...data.series.map((s) => s.spend));

  const summary = !data.hasMeta
    ? "Assim que sua conta de anúncios estiver conectada, a transparência do investimento aparece aqui."
    : data.spend === 0
      ? "Ainda não há investimento registrado neste período. Os números aparecem aqui automaticamente."
      : `Neste período foram investidos ${money(data.spend, cur)} em anúncios, gerando ${int(data.leads)} lead${data.leads !== 1 ? "s" : ""}${data.cpl != null ? ` a ${money(data.cpl, cur)} cada` : ""}.`;


  return (
    <main className="amain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="anuncios" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .amain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;
          background-color:var(--p-bg);
          background-image:radial-gradient(1100px 460px at 50% -120px, var(--p-accent-soft), transparent 70%), radial-gradient(var(--p-border) 1px, transparent 1.5px);
          background-size:100% 560px, 24px 24px;background-repeat:no-repeat, repeat;background-position:center top, center top;background-attachment:fixed, fixed;}
        .atopbar{position:sticky;top:0;z-index:10;background:var(--p-surface);border-bottom:1px solid var(--p-border)}
        .atopbar-in{max-width:1160px;margin:0 auto;padding:9px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .atoggle{display:flex;gap:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:11px;padding:4px;min-width:170px;margin-left:auto}
        .awrap{max-width:1160px;margin:0 auto;padding:18px 22px 56px;display:flex;flex-direction:column;gap:14px}
        .akpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .asplit{display:grid;grid-template-columns:1fr;gap:12px}
        @media(min-width:760px){ .atopbar-in,.awrap{padding-left:26px;padding-right:26px} .asplit{grid-template-columns:1.4fr 1fr} }
        @keyframes barFill{from{width:0}}
        @keyframes colGrow{from{transform:scaleY(0)}}
        @media print{.atopbar{display:none!important}.amain{background:#fff!important}}`}</style>

      <div className="atopbar">
        <div className="atopbar-in">
          <PortalPeriod selected={selected} months={months} />
        </div>
      </div>

      <div className="awrap">

        {/* RESUMO */}
        <div style={{ ...card, padding: "16px 20px", background: "linear-gradient(120deg, var(--p-accent-soft), var(--p-surface) 62%)", borderColor: "var(--p-accent-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--p-accent)" }} />
            <span style={{ ...cap, color: "var(--p-accent)" }}>Transparência de anúncios · {data.periodLabel}</span>
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--p-text)", marginTop: 9, fontWeight: 500 }}>{summary}</p>
        </div>

        {/* KPIs */}
        <div className="akpis">
          <Kpi label="Investido" value={money(data.spend, cur)} delta={data.deltas.spend} goodWhenUp={undefined} />
          <Kpi label="Leads de anúncio" value={int(data.leads)} sub="pessoas que chegaram pela mídia" />
          <Kpi label="Custo por lead" value={data.cpl != null ? money(data.cpl, cur) : "—"} delta={data.deltas.cpl} goodWhenUp={false} />
        </div>

        <div className="asplit">
          {/* PRA ONDE FOI O INVESTIMENTO */}
          <div style={{ ...card, display: "flex", flexDirection: "column" }}>
            <div style={cap}>Pra onde foi o investimento</div>
            {data.topCampaigns.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>Assim que houver gasto em campanhas, a divisão do investimento aparece aqui.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 14 }}>
                {data.topCampaigns.map((c, i) => (
                  <div key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 12.5, color: "var(--p-text)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                      <span style={{ fontSize: 12.5, color: "var(--p-muted)", flexShrink: 0 }}>{money(c.spend, cur)} · {int(c.leads)} lead{c.leads !== 1 ? "s" : ""}{c.cpl != null ? ` · ${money(c.cpl, cur)}/lead` : ""}</span>
                    </div>
                    <div style={{ height: 9, borderRadius: 5, background: "var(--p-bg)", overflow: "hidden" }}>
                      <div style={{ width: `${c.pctSpend}%`, height: "100%", background: "linear-gradient(90deg, var(--p-accent), var(--p-accent))", borderRadius: 5, animation: "barFill 1s cubic-bezier(.22,1,.36,1) both" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* MELHOR ANÚNCIO */}
          <div style={{ ...card, display: "flex", flexDirection: "column" }}>
            <div style={cap}>Anúncio que mais trouxe leads</div>
            {!data.bestCreative ? (
              <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>O anúncio destaque aparece aqui quando os leads começarem a chegar.</div>
            ) : (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 12, overflow: "hidden", background: "var(--p-bg)", border: "1px solid var(--p-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {data.bestCreative.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={data.bestCreative.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    : <span style={{ fontSize: 34 }}>📣</span>}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--p-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.bestCreative.campaignName}</div>
                  <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 2 }}>{int(data.bestCreative.leads)} lead{data.bestCreative.leads !== 1 ? "s" : ""} no período</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* EVOLUÇÃO */}
        <div style={{ ...card, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={cap}>Evolução do investimento</span>
            <span style={{ fontSize: 12, color: "var(--p-muted)" }}>investimento por dia · leads na base</span>
          </div>
          {data.series.every((s) => s.spend === 0) ? (
            <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>Sem investimento no período.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, marginTop: 16 }}>
              {data.series.map((s, i) => (
                <div key={i} title={`${s.day}: ${money(s.spend, cur)} · ${s.leads} lead${s.leads !== 1 ? "s" : ""}`} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                  <div style={{ width: "100%", height: `${(s.spend / maxSpend) * 100}%`, minHeight: s.spend > 0 ? 3 : 0, background: "linear-gradient(180deg, var(--p-accent), var(--p-accent-soft))", borderRadius: "3px 3px 0 0", transformOrigin: "bottom", animation: "colGrow .9s cubic-bezier(.22,1,.36,1) both" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* NARRATIVA */}
        <div style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--p-bg)" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 4px rgba(22,163,74,.15)" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--p-text)" }}>Otimização contínua da Veloce</div>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 1 }}>Acompanhamos o desempenho de cada campanha e realocamos o investimento pro que traz mais leads pelo menor custo.</div>
          </div>
        </div>

      </div>
    </main>
  );
}
