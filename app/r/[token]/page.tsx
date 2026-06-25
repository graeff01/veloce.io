import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getClientDashboard, getBenchmark, type Period } from "@/lib/notifications/client-report";
import { buildTheme, themeStyle } from "@/lib/portal-theme";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 18 };
const capLabel: React.CSSProperties = { fontSize: 12, color: "var(--p-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 };

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={capLabel}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--p-text)", lineHeight: 1.1, marginTop: 8 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params;
  const { p } = await searchParams;
  const period: Period = p === "week" ? "week" : "month";
  const portal = await resolvePortal(token);

  if (!portal) {
    return (
      <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#101319", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 40 }}>🔒</div>
          <h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1>
          <p style={{ color: "#6b7480", marginTop: 6, fontSize: 14 }}>Este painel foi desativado ou o link expirou. Peça um novo à sua agência.</p>
        </div>
      </main>
    );
  }

  const [client, bot, data, benchmark] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } }),
    prisma.clientBot.findUnique({ where: { clientId: portal.clientId }, select: { brandName: true } }),
    getClientDashboard(portal.clientId, period),
    getBenchmark(portal.clientId, period).catch(() => null),
  ]);

  const accent = buildTheme(portal.accentColor, "light").accent;
  const brandName = (bot?.brandName || "").trim() || client?.name || "Painel";
  const a = data.atendimento;
  const term = data.termometro;
  const atualizado = new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const deltaTxt = a.deltaPct == null ? null : `${a.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(a.deltaPct)}% vs. período anterior`;
  const deltaColor = a.deltaPct == null ? "var(--p-muted)" : a.deltaPct >= 0 ? "#1aa35a" : "#d6453d";
  const healthColor = data.health.score >= 80 ? "#1aa35a" : data.health.score >= 60 ? "#2d8cf0" : data.health.score >= 40 ? "#e8a33d" : "#d6453d";

  const tab = (key: Period, label: string) => {
    const on = period === key;
    return (
      <a href={`?p=${key}`} style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 13, fontWeight: on ? 700 : 500, textDecoration: "none",
        color: on ? "var(--p-on-accent)" : "var(--p-muted)", background: on ? "var(--p-accent)" : "transparent", borderRadius: 9 }}>{label}</a>
    );
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--p-bg)", color: "var(--p-text)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .ptopbar{position:sticky;top:0;z-index:10;background:var(--p-surface);border-bottom:1px solid var(--p-border)}
        .ptopbar-in{max-width:1120px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .pbrand{display:flex;align-items:center;gap:12px;flex:1;min-width:200px}
        .ptoggle{display:flex;gap:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:11px;padding:4px;min-width:188px}
        .pwrap{max-width:1120px;margin:0 auto;padding:18px 16px 56px}
        .pkpis{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
        .ptiles{display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px}
        /* Tablet/desktop: chrome de largura cheia (cara de sistema) + conteúdo espalhado */
        @media(min-width:760px){
          .ptopbar-in,.pwrap{padding-left:24px;padding-right:24px}
          .pkpis{grid-template-columns:repeat(4,1fr)}
          .ptiles{grid-template-columns:1fr 1fr}
        }`}</style>

      {/* Topbar full-width — dá cara de produto e tira o "tudo centralizado" */}
      <div className="ptopbar">
        <div className="ptopbar-in">
          <div className="pbrand">
            {client?.logoUrl
              ? <img src={client.logoUrl} alt={brandName} width={40} height={40} style={{ borderRadius: 11, objectFit: "cover", border: "1px solid var(--p-border)" }} />
              : <div style={{ width: 40, height: 40, borderRadius: 11, background: accent, color: buildTheme(portal.accentColor, "light").onAccent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18 }}>{brandName[0]?.toUpperCase()}</div>}
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{brandName}</div>
              <div style={{ fontSize: 12, color: "var(--p-muted)" }}>Painel de performance · {data.periodLabel}</div>
            </div>
          </div>
          <div className="ptoggle">{tab("month", "Mês")}{tab("week", "7 dias")}</div>
        </div>
      </div>

      <div className="pwrap">

        {/* Narrativa (o "e daí") — largura cheia */}
        {data.narrative.length > 0 && (
          <div style={{ ...card, marginTop: 12, borderLeft: "3px solid var(--p-accent)" }}>
            {data.narrative.map((line, i) => (
              <div key={i} style={{ fontSize: 14, color: "var(--p-text)", lineHeight: 1.5, marginTop: i ? 6 : 0 }}>{line}</div>
            ))}
          </div>
        )}

        {/* Hero KPIs — 2 col no celular, 4 col no PC */}
        <section className="pkpis">
          <Kpi label="Conversas no WhatsApp" value={int(a.leads)} sub={deltaTxt && <span style={{ color: deltaColor, fontWeight: 600 }}>{deltaTxt}</span>} />
          <Kpi label="Custo por lead" value={data.midia?.cpl != null ? brl(data.midia.cpl) : "—"} sub={data.midia ? `${int(data.midia.leads)} leads de anúncio` : "sem mídia conectada"} />
          <Kpi label="Conversões" value={int(a.conversoes)} sub="sinalizados no chat" />
          <Kpi label="Tempo de resposta" value={a.tempoMedioMin != null ? `${a.tempoMedioMin} min` : "—"} sub={`${a.taxaResposta}% respondidos`} />
        </section>

        {/* Cards — empilham no celular, 2 col no PC */}
        <div className="ptiles">

          {/* Health Score */}
          <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 76, height: 76, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
              background: `conic-gradient(${healthColor} ${data.health.score * 3.6}deg, var(--p-accent-soft) 0)` }}>
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--p-surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--p-text)" }}>{data.health.score}</span>
              </div>
            </div>
            <div>
              <div style={capLabel}>Saúde do atendimento</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: healthColor, marginTop: 4 }}>{data.health.label}</div>
              {benchmark != null && <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 4 }}>Melhor que {benchmark}% das contas</div>}
            </div>
          </div>

          {/* Termômetro */}
          <div style={card}>
            <div style={{ ...capLabel, marginBottom: 12 }}>🌡️ Aguardando atendimento agora</div>
            {term.total === 0 ? (
              <div style={{ fontSize: 14, color: "var(--p-muted)" }}>Nenhum lead aguardando. 👌</div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                {[{ k: "🔥 Quentes", v: term.hot }, { k: "🟠 Mornos", v: term.warm }, { k: "🧊 Frios", v: term.cold }].map((x) => (
                  <div key={x.k} style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: "var(--p-accent-soft)", borderRadius: 12 }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--p-text)" }}>{x.v}</div>
                    <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 2 }}>{x.k}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Melhor campanha */}
          {data.bestCampaign && (
            <div style={card}>
              <div style={{ ...capLabel, marginBottom: 8 }}>🏆 Melhor campanha</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--p-text)" }}>{data.bestCampaign.name}</div>
              <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 2 }}>{int(data.bestCampaign.leads)} leads no período</div>
            </div>
          )}

          {/* Mídia */}
          {data.midia && (
            <div style={card}>
              <div style={{ ...capLabel, marginBottom: 12 }}>📣 Resultado dos anúncios</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{brl(data.midia.spend)}</div><div style={{ fontSize: 11.5, color: "var(--p-muted)" }}>investido</div></div>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{int(data.midia.leads)}</div><div style={{ fontSize: 11.5, color: "var(--p-muted)" }}>leads de anúncio</div></div>
                <div><div style={{ fontSize: 20, fontWeight: 800 }}>{data.midia.cpl != null ? brl(data.midia.cpl) : "—"}</div><div style={{ fontSize: 11.5, color: "var(--p-muted)" }}>por lead</div></div>
              </div>
            </div>
          )}

        </div>

        <footer style={{ marginTop: 24, textAlign: "center", fontSize: 11.5, color: "var(--p-muted)" }}>Atualizado em {atualizado}</footer>
      </div>
    </main>
  );
}
