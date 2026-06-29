import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getClientDashboard, getBenchmark, type Period } from "@/lib/notifications/client-report";
import { buildTheme, themeStyle, themeSwitchCss, themeInitScript } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalShare } from "@/components/portal/portal-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 18, padding: 20, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 10px 28px rgba(0,0,0,.045)" };
const cap: React.CSSProperties = { fontSize: 11.5, color: "var(--p-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 };

const scoreColor = (s: number) => (s >= 80 ? "#16a34a" : s >= 60 ? "#2d8cf0" : s >= 40 ? "#e8a33d" : "#d6453d");

// Delta temporal (↑/↓ colorido por direção desejada).
function Delta({ pct, goodWhenUp, note }: { pct: number | null; goodWhenUp?: boolean; note?: string }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const neutral = goodWhenUp === undefined;
  const color = neutral ? "var(--p-muted)" : up === goodWhenUp ? "#16a34a" : "#d6453d";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color, marginTop: 7 }}>
      {up ? "↑" : "↓"} {up ? "+" : ""}{pct}%
      <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>{note ?? "vs. anterior"}</span>
    </span>
  );
}

function Kpi({ label, value, delta, goodWhenUp, sub }: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean; sub?: string }) {
  return (
    <div style={card}>
      <div style={cap}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: "var(--p-text)", lineHeight: 1.05, marginTop: 10, letterSpacing: "-0.02em" }}>{value}</div>
      {delta != null ? <div><Delta pct={delta} goodWhenUp={goodWhenUp} /></div> : sub ? <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 8 }}>{sub}</div> : null}
    </div>
  );
}

// Radial premium do Health Score.
function Radial({ score, size = 132 }: { score: number; size?: number }) {
  const R = 54, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  const col = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ flexShrink: 0 }}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--p-accent-soft)" strokeWidth="11" />
      <circle cx="64" cy="64" r={R} fill="none" stroke={col} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 64 64)"
        style={{ ["--c" as string]: `${C}px`, animation: "radialIn 1.1s cubic-bezier(.22,1,.36,1) both" }} />
      <text x="64" y="58" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 34, fontWeight: 800, fill: "var(--p-text)", letterSpacing: "-1px" }}>{score}</text>
      <text x="64" y="82" textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: "var(--p-muted)" }}>de 100</text>
    </svg>
  );
}

function BreakdownBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: "var(--p-text)", fontWeight: 600 }}>{label} <span style={{ color: "var(--p-muted)", fontWeight: 400, fontSize: 11 }}>· {weight}</span></span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: scoreColor(value) }}>{value}</span>
      </div>
      <div style={{ height: 7, borderRadius: 5, background: "var(--p-bg)", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: scoreColor(value), borderRadius: 5, transition: "width .6s" }} />
      </div>
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; leads: number }[] }) {
  const maxV = Math.max(1, ...series.map((s) => s.leads));
  const total = series.reduce((s, x) => s + x.leads, 0);
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={cap}>Evolução de leads</span>
        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>{total} no período · pico {maxV}/dia</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 96 }}>
        {series.map((s, i) => {
          const h = Math.max(3, Math.round((s.leads / maxV) * 100));
          return <div key={i} title={`${s.day.slice(8, 10)}/${s.day.slice(5, 7)}: ${s.leads}`} style={{ flex: 1, minWidth: 2, height: `${h}%`, background: s.leads ? "var(--p-accent)" : "var(--p-border)", opacity: s.leads ? 1 : 0.5, borderRadius: 4 }} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 6 }}>
        {series.map((s, i) => {
          const step = Math.max(1, Math.ceil(series.length / 8));
          const show = i % step === 0 || i === series.length - 1;
          return <span key={i} style={{ flex: 1, minWidth: 2, textAlign: "center", fontSize: 9.5, color: "var(--p-muted)" }}>{show ? s.day.slice(8, 10) : ""}</span>;
        })}
      </div>
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
        <div><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1><p style={{ color: "#6b7480", marginTop: 6, fontSize: 14 }}>Este painel foi desativado ou o link expirou. Peça um novo à sua agência.</p></div>
      </main>
    );
  }

  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    const c = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true } });
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={c?.name || "Painel"} />
      </main>
    );
  }

  const [client, bot, data, benchmark] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } }),
    prisma.clientBot.findUnique({ where: { clientId: portal.clientId }, select: { brandName: true } }),
    getClientDashboard(portal.clientId, period),
    getBenchmark(portal.clientId, period).catch(() => null),
  ]);

  const brandName = (bot?.brandName || "").trim() || client?.name || "Painel";
  const a = data.atendimento;
  const d = data.deltas;
  const sc = data.score;
  const semResposta = Math.max(0, a.leads - a.respondidos);
  const convPct = a.leads > 0 ? Math.round((a.conversoes / a.leads) * 100) : 0;
  const atualizado = new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const lostOps = semResposta > 0 ? Math.max(1, Math.round(semResposta * Math.max(a.leads > 0 ? a.conversoes / a.leads : 0, 0.1))) : 0;

  // Resumo executivo — gerado dos dados reais.
  const summary: string[] = [];
  if (a.leads === 0) summary.push("Ainda não há leads novos no período. Assim que entrarem, o resumo da operação aparece aqui automaticamente.");
  else {
    summary.push(`Sua operação gerou ${int(a.leads)} lead${a.leads !== 1 ? "s" : ""} neste período${d.leads != null ? ` (${d.leads >= 0 ? "+" : ""}${d.leads}% vs. período anterior)` : ""}.`);
    if (data.midia?.cpl != null) summary.push(`O custo por lead está em ${brl(data.midia.cpl)}${d.cpl != null ? `, ${d.cpl <= 0 ? "uma melhora" : "uma alta"} de ${Math.abs(d.cpl)}%` : ""}.`);
    if (a.tempoMedioMin != null && a.tempoMedioMin > 30) summary.push(`Porém o tempo de resposta está em ${int(a.tempoMedioMin)} min — acima do ideal, o que está impactando a conversão.`);
    else if (a.tempoMedioMin != null) summary.push(`O atendimento segue ágil, com ${int(a.tempoMedioMin)} min de resposta média.`);
    if (semResposta > 0) summary.push(`Há ${int(semResposta)} lead${semResposta !== 1 ? "s" : ""} ainda sem resposta — atenção prioritária.`);
  }

  const tab = (key: Period, label: string) => {
    const on = period === key;
    return <a href={`?p=${key}`} style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 13, fontWeight: on ? 700 : 500, textDecoration: "none", color: on ? "var(--p-on-accent)" : "var(--p-muted)", background: on ? "var(--p-accent)" : "transparent", borderRadius: 9 }}>{label}</a>;
  };

  return (
    <main className="pmain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={brandName} logoUrl={client?.logoUrl ?? null} active="painel" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .pmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;
          background-color:var(--p-bg);
          background-image:radial-gradient(1200px 480px at 50% -160px, var(--p-accent-soft), transparent 70%), radial-gradient(var(--p-border) 1px, transparent 1.5px);
          background-size:100% 600px, 26px 26px;background-repeat:no-repeat, repeat;background-position:center top, center top;background-attachment:fixed, fixed;}
        .ptopbar{position:sticky;top:0;z-index:10;background:var(--p-surface);border-bottom:1px solid var(--p-border)}
        .ptopbar-in{max-width:1160px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .ptopmeta{display:flex;align-items:center;gap:12px;margin-left:auto}
        .pupdated{display:none;font-size:11.5px;color:var(--p-muted)}
        .ptoggle{display:flex;gap:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:11px;padding:4px;min-width:170px}
        .pwrap{max-width:1160px;margin:0 auto;padding:26px 22px 64px;display:flex;flex-direction:column;gap:18px}
        .pkpis{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
        .p2col{display:grid;grid-template-columns:1fr;gap:16px}
        @media(min-width:760px){ .ptopbar-in,.pwrap{padding-left:26px;padding-right:26px} .pupdated{display:block} .pkpis{grid-template-columns:repeat(4,1fr)} .p2col{grid-template-columns:5fr 6fr} }
        @keyframes radialIn{from{stroke-dashoffset:var(--c)}}
        @media print{.ptopbar{display:none!important}.pmain{background:#fff!important}}`}</style>

      {/* Topbar */}
      <div className="ptopbar">
        <div className="ptopbar-in">
          <div className="ptopmeta">
            <span className="pupdated">Atualizado {atualizado}</span>
            <PortalShare />
            <div className="ptoggle">{tab("month", "Mês")}{tab("week", "7 dias")}</div>
          </div>
        </div>
      </div>

      <div className="pwrap">

        {/* ROW 1 · EXECUTIVE SUMMARY */}
        <div style={{ ...card, padding: "22px 24px", background: "linear-gradient(120deg, var(--p-accent-soft), var(--p-surface) 60%)", borderColor: "var(--p-accent-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--p-accent)" }} />
            <span style={{ ...cap, color: "var(--p-accent)" }}>Resumo Veloce da Operação</span>
          </div>
          <p style={{ fontSize: 16.5, lineHeight: 1.55, color: "var(--p-text)", marginTop: 12, fontWeight: 500, maxWidth: 860 }}>{summary.join(" ")}</p>
        </div>

        {/* ROW 2 · KPIs */}
        <div className="pkpis">
          <Kpi label="Investimento" value={data.midia ? brl(data.midia.spend) : "—"} delta={data.midia ? d.spend : null} sub={!data.midia ? "sem anúncios conectados" : undefined} />
          <Kpi label="Leads" value={int(a.leads)} delta={d.leads} goodWhenUp />
          <Kpi label="Custo por lead" value={data.midia?.cpl != null ? brl(data.midia.cpl) : "—"} delta={data.midia?.cpl != null ? d.cpl : null} goodWhenUp={false} />
          <Kpi label="Conversão" value={`${convPct}%`} delta={d.conversao} goodWhenUp />
        </div>

        {/* ROW 3 · HEALTH SCORE | OPORTUNIDADES */}
        <div className="p2col">
          <div style={card}>
            <div style={cap}>Health Score</div>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 3 }}>metodologia Veloce · Marketing · Atendimento · Conversão</div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 14, flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <Radial score={sc.total} />
                <div style={{ fontSize: 14, fontWeight: 800, color: scoreColor(sc.total), marginTop: 2 }}>{data.health.label}</div>
                {benchmark != null && <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 2 }}>melhor que {benchmark}% das contas</div>}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <BreakdownBar label="Marketing" value={sc.marketing} weight="40%" />
                <BreakdownBar label="Atendimento" value={sc.atendimento} weight="35%" />
                <BreakdownBar label="Conversão" value={sc.conversao} weight="25%" />
              </div>
            </div>
          </div>

          <div style={{ ...card, borderLeft: `4px solid ${semResposta > 0 ? "#d6453d" : "#16a34a"}` }}>
            <div style={cap}>Onde estamos perdendo oportunidades</div>
            {semResposta > 0 ? (
              <>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#d6453d", marginTop: 12, letterSpacing: "-1px" }}>{int(semResposta)} <span style={{ fontSize: 17, fontWeight: 700, color: "var(--p-text)" }}>leads sem resposta</span></div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 16 }}>
                  <div>
                    <div style={cap}>Impacto estimado</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--p-text)", marginTop: 4 }}>~ {int(lostOps)} oportunidade{lostOps !== 1 ? "s" : ""} perdida{lostOps !== 1 ? "s" : ""}</div>
                  </div>
                  <div>
                    <div style={cap}>Principal causa</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--p-text)", marginTop: 4 }}>{a.tempoMedioMin != null ? `Tempo de resposta: ${int(a.tempoMedioMin)} min` : "Leads sem retorno"}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 16, fontWeight: 700, color: "#16a34a", marginTop: 14 }}>✅ Nenhuma oportunidade parada — todos os leads foram respondidos.</div>
            )}
          </div>
        </div>

        {/* ROW 4 · EVOLUÇÃO */}
        {data.series.length > 1 && <Sparkline series={data.series} />}

        {/* ROW 5 · OPERAÇÃO VELOCE */}
        <div style={{ ...card, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "var(--p-bg)" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 4px rgba(22,163,74,.15)" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: "var(--p-text)" }}>Operação Veloce · monitoramento ativo</div>
            <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 2 }}>Sua operação é acompanhada e otimizada em tempo real pela equipe Veloce. Período: {data.periodLabel} · atualizado {atualizado}.</div>
          </div>
        </div>

      </div>
    </main>
  );
}
