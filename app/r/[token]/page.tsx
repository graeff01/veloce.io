import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { getClientDashboard, getBenchmark, type Period } from "@/lib/notifications/client-report";
import { themeStyle, themeSwitchCss, themeInitScript } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalShare } from "@/components/portal/portal-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.045)" };
const cap: React.CSSProperties = { fontSize: 11, color: "var(--p-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 };

const scoreColor = (s: number) => (s >= 80 ? "#16a34a" : s >= 60 ? "#2d8cf0" : s >= 40 ? "#e8a33d" : "#d6453d");

function Delta({ pct, goodWhenUp }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct == null) return null;
  const up = pct >= 0;
  const neutral = goodWhenUp === undefined;
  const color = neutral ? "var(--p-muted)" : up === goodWhenUp ? "#16a34a" : "#d6453d";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color, marginTop: 6 }}>
      {up ? "↑" : "↓"} {up ? "+" : ""}{pct}% <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>vs. anterior</span>
    </span>
  );
}

function Kpi({ label, value, delta, goodWhenUp, sub }: { label: string; value: string; delta?: number | null; goodWhenUp?: boolean; sub?: string }) {
  return (
    <div style={card}>
      <div style={cap}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 800, color: "var(--p-text)", lineHeight: 1.05, marginTop: 8, letterSpacing: "-0.02em" }}>{value}</div>
      {delta != null && <div><Delta pct={delta} goodWhenUp={goodWhenUp} /></div>}
      {sub && <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: delta != null ? 4 : 7 }}>{sub}</div>}
    </div>
  );
}

function Radial({ score, size = 120 }: { score: number; size?: number }) {
  const R = 54, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  const col = scoreColor(score);
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" style={{ flexShrink: 0 }}>
      <circle cx="64" cy="64" r={R} fill="none" stroke="var(--p-accent-soft)" strokeWidth="11" />
      <circle cx="64" cy="64" r={R} fill="none" stroke={col} strokeWidth="11" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 64 64)"
        style={{ ["--c" as string]: `${C}px`, animation: "radialIn 1.1s cubic-bezier(.22,1,.36,1) both" }} />
      <text x="64" y="58" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 33, fontWeight: 800, fill: "var(--p-text)", letterSpacing: "-1px" }}>{score}</text>
      <text x="64" y="82" textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 600, fill: "var(--p-muted)" }}>de 100</text>
    </svg>
  );
}

function BreakdownBar({ label, value, weight }: { label: string; value: number; weight: string }) {
  return (
    <div style={{ marginBottom: 15 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "var(--p-text)", fontWeight: 600 }}>{label} <span style={{ color: "var(--p-muted)", fontWeight: 400, fontSize: 11 }}>· {weight}</span></span>
        <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor(value) }}>{value}</span>
      </div>
      <div style={{ height: 9, borderRadius: 5, background: "var(--p-bg)", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: `linear-gradient(90deg, ${scoreColor(value)}, ${scoreColor(value)}cc)`, borderRadius: 5, animation: "barFill 1s cubic-bezier(.22,1,.36,1) both" }} />
      </div>
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; leads: number }[] }) {
  const maxV = Math.max(1, ...series.map((s) => s.leads));
  const total = series.reduce((s, x) => s + x.leads, 0);
  return (
    <div className="p-chart" style={{ ...card, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={cap}>Evolução de leads</span>
        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>{total} no período · pico {maxV}/dia</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, flex: 1, minHeight: 70 }}>
        {series.map((s, i) => {
          const h = Math.max(3, Math.round((s.leads / maxV) * 100));
          return <div key={i} title={`${s.day.slice(8, 10)}/${s.day.slice(5, 7)}: ${s.leads}`} style={{ flex: 1, minWidth: 2, height: `${h}%`, background: s.leads ? "linear-gradient(180deg, var(--p-accent), color-mix(in srgb, var(--p-accent) 70%, transparent))" : "var(--p-border)", opacity: s.leads ? 1 : 0.5, borderRadius: 4, transformOrigin: "bottom", animation: "barGrow .7s cubic-bezier(.22,1,.36,1) both", animationDelay: `${Math.round((i / Math.max(1, series.length)) * 450)}ms` }} />;
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
  const factors = [["Marketing", sc.marketing], ["Atendimento", sc.atendimento], ["Conversão", sc.conversao]] as const;
  const lowest = factors.reduce((x, y) => (y[1] < x[1] ? y : x));
  const healthHint = sc.total >= 80 ? "Operação saudável em todas as frentes." : `Maior oportunidade de melhora: ${lowest[0]} (${lowest[1]}/100).`;
  const semResposta = Math.max(0, a.leads - a.respondidos);
  const atualizado = new Date(data.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const lostOps = semResposta > 0 ? Math.max(1, Math.round(semResposta * Math.max(a.leads > 0 ? a.conversoes / a.leads : 0, 0.1))) : 0;

  const summary: string[] = [];
  if (a.leads === 0) summary.push("Ainda não há leads novos no período. Assim que entrarem, o resumo da operação aparece aqui automaticamente.");
  else {
    summary.push(`Sua operação gerou ${int(a.leads)} lead${a.leads !== 1 ? "s" : ""} neste período${d.leads != null ? ` (${d.leads >= 0 ? "+" : ""}${d.leads}% vs. anterior)` : ""}.`);
    if (data.midia?.cpl != null) summary.push(`Custo por lead em ${brl(data.midia.cpl)}${d.cpl != null ? `, ${d.cpl <= 0 ? "melhora" : "alta"} de ${Math.abs(d.cpl)}%` : ""}.`);
    if (a.tempoMedioMin != null && a.tempoMedioMin > 30) summary.push(`Porém o tempo de resposta está em ${int(a.tempoMedioMin)} min — acima do ideal, impactando a conversão.`);
    else if (a.tempoMedioMin != null) summary.push(`Atendimento ágil, com ${int(a.tempoMedioMin)} min de resposta média.`);
    if (semResposta > 0) summary.push(`${int(semResposta)} lead${semResposta !== 1 ? "s" : ""} ainda sem resposta.`);
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
        .ptopbar-in{max-width:1160px;margin:0 auto;padding:9px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .ptopmeta{display:flex;align-items:center;gap:12px;margin-left:auto}
        .pupdated{display:none;font-size:11.5px;color:var(--p-muted)}
        .ptoggle{display:flex;gap:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:11px;padding:4px;min-width:170px}
        .pwrap{max-width:1160px;margin:0 auto;padding:18px 22px 56px;display:flex;flex-direction:column;gap:14px}
        .pkpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        @media(min-width:760px){ .ptopbar-in,.pwrap{padding-left:26px;padding-right:26px} .pupdated{display:block} .pkpis{grid-template-columns:repeat(4,1fr)} }
        /* PC: tela cheia, SEM rolagem — grid distribui tudo na altura */
        @media(min-width:1100px) and (min-height:640px){
          .pmain{height:100dvh;overflow:hidden;display:flex;flex-direction:column}
          .ptopbar-in,.pwrap{max-width:none}
          .pwrap{flex:1;min-height:0;padding:14px 24px;display:grid;gap:13px;
            grid-template-columns:1fr 1.7fr;
            grid-template-rows:auto auto minmax(0,1fr) auto;
            grid-template-areas:"sum sum" "kpi kpi" "hea cha" "ops ops"}
          .p-summary{grid-area:sum}.pkpis{grid-area:kpi}
          .p-health{grid-area:hea;min-height:0;overflow:hidden}
          .p-chart{grid-area:cha;min-height:0}
          .p-ops{grid-area:ops}
        }
        .radial-glow{position:absolute;inset:16px;border-radius:50%;filter:blur(22px);opacity:.22;z-index:0;animation:glowPulse 3.2s ease-in-out infinite}
        @keyframes radialIn{from{stroke-dashoffset:var(--c)}}
        @keyframes glowPulse{0%,100%{opacity:.15;transform:scale(.9)}50%{opacity:.42;transform:scale(1.06)}}
        @keyframes barGrow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
        @keyframes barFill{from{width:0}}
        @keyframes alertGlow{0%,100%{box-shadow:0 8px 26px rgba(220,38,38,.35),0 0 0 0 rgba(239,68,68,.5)}50%{box-shadow:0 8px 26px rgba(220,38,38,.45),0 0 0 12px rgba(239,68,68,0)}}
        @keyframes alertPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
        @keyframes dotBlink{0%,100%{opacity:1}50%{opacity:.25}}
        @media(prefers-reduced-motion:reduce){.radial-glow{animation:none}}
        @media print{.ptopbar{display:none!important}.pmain{background:#fff!important;height:auto!important;overflow:visible!important}}`}</style>

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
        <div className="p-summary" style={{ ...card, padding: "16px 20px", background: "linear-gradient(120deg, var(--p-accent-soft), var(--p-surface) 62%)", borderColor: "var(--p-accent-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--p-accent)" }} />
            <span style={{ ...cap, color: "var(--p-accent)" }}>Resumo Veloce da Operação</span>
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--p-text)", marginTop: 9, fontWeight: 500 }}>{summary.slice(0, 4).join(" ")}</p>
        </div>

        {/* ROW 2 · KPIs */}
        <div className="pkpis">
          <Kpi label="Investimento" value={data.midia ? brl(data.midia.spend) : "—"} delta={data.midia ? d.spend : null} sub={!data.midia ? "sem anúncios conectados" : undefined} />
          <Kpi label="Leads" value={int(a.leads)} delta={d.leads} goodWhenUp sub={data.midia ? `${int(data.midia.leads)} de anúncio` : undefined} />
          <Kpi label="Custo por lead" value={data.midia?.cpl != null ? brl(data.midia.cpl) : "—"} delta={data.midia?.cpl != null ? d.cpl : null} goodWhenUp={false} />
          {/* Alerta vibrante no lugar do KPI de conversão */}
          <div style={{ ...card, border: "none", color: "#fff", display: "flex", flexDirection: "column", justifyContent: "center",
            background: semResposta > 0 ? "linear-gradient(135deg,#ef4444,#dc2626)" : "linear-gradient(135deg,#16a34a,#15803d)",
            animation: semResposta > 0 ? "alertGlow 1.9s ease-in-out infinite" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: semResposta > 0 ? "dotBlink 1s ease-in-out infinite" : "none" }} />
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "rgba(255,255,255,.95)" }}>Leads sem resposta</span>
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, color: "#fff", lineHeight: 1, marginTop: 8, transformOrigin: "left", animation: semResposta > 0 ? "alertPulse 1.6s ease-in-out infinite" : "none" }}>{semResposta > 0 ? int(semResposta) : "👌"}</div>
            <div style={{ fontSize: 11.5, color: "#fff", opacity: 0.92, marginTop: 6 }}>{semResposta > 0 ? `~ ${int(lostOps)} oportunidade${lostOps !== 1 ? "s" : ""} parada${lostOps !== 1 ? "s" : ""}` : "tudo respondido"}</div>
          </div>
        </div>

        {/* ROW 3a · HEALTH SCORE */}
        <div className="p-health" style={{ ...card, display: "flex", flexDirection: "column" }}>
          <div>
            <div style={cap}>Health Score</div>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 3 }}>Saúde geral da sua operação — de 0 a 100, quanto maior melhor.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, minHeight: 0, flexWrap: "wrap", justifyContent: "center" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ position: "relative", width: 138, height: 138, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div className="radial-glow" style={{ background: scoreColor(sc.total) }} />
                <div style={{ position: "relative", zIndex: 1 }}><Radial score={sc.total} size={138} /></div>
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: scoreColor(sc.total), marginTop: 2 }}>{data.health.label}</div>
              {benchmark != null && <div style={{ fontSize: 11, color: "var(--p-muted)", marginTop: 1 }}>melhor que {benchmark}% das contas</div>}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <BreakdownBar label="Marketing" value={sc.marketing} weight="40%" />
              <BreakdownBar label="Atendimento" value={sc.atendimento} weight="35%" />
              <BreakdownBar label="Conversão" value={sc.conversao} weight="25%" />
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--p-muted)", paddingTop: 12, marginTop: 4, borderTop: "1px solid var(--p-border)" }}>{healthHint}</div>
        </div>

        {/* ROW 3b · EVOLUÇÃO (maior agora) */}
        {data.series.length > 1 && <Sparkline series={data.series} />}

        {/* ROW 4 · OPERAÇÃO VELOCE */}
        <div className="p-ops" style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--p-bg)" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 4px rgba(22,163,74,.15)" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--p-text)" }}>Operação Veloce · monitoramento ativo</div>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 1 }}>Sua operação é acompanhada e otimizada em tempo real pela equipe Veloce · {data.periodLabel} · atualizado {atualizado}.</div>
          </div>
        </div>

      </div>
    </main>
  );
}
