import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { buildImpact } from "@/lib/ai-agent/impact";
import { themeStyle, themeSwitchCss, themeInitScript } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const int = (v: number) => v.toLocaleString("pt-BR");

const card: React.CSSProperties = { background: "var(--p-surface)", border: "1px solid var(--p-border)", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.045)" };
const cap: React.CSSProperties = { fontSize: 11, color: "var(--p-muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 };

// Formata segundos em algo legível: "12s", "8 min", "2h 36min".
function fmtDur(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={card}>
      <div style={cap}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 800, color: accent || "var(--p-text)", lineHeight: 1.05, marginTop: 8, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 7 }}>{sub}</div>}
    </div>
  );
}

// Barra de qualidade dos leads (quentes/mornos/frios) — o que a IA já triou pra equipe.
function QualityBar({ hot, warm, cold }: { hot: number; warm: number; cold: number }) {
  const rows = [
    { label: "🔥 Quentes", value: hot, color: "#d6453d" },
    { label: "🌤️ Mornos", value: warm, color: "#e8a33d" },
    { label: "❄️ Frios", value: cold, color: "#2d8cf0" },
  ];
  const total = hot + warm + cold;
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span style={cap}>Qualidade dos leads triados</span>
        <span style={{ fontSize: 12, color: "var(--p-muted)" }}>{total > 0 ? `${int(total)} classificados pela IA` : "sem dados"}</span>
      </div>
      {total === 0 ? (
        <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 12 }}>Assim que a IA qualificar seus leads, a temperatura de cada um aparece aqui.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>
          {rows.map((r, i) => (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                <span style={{ fontSize: 12.5, color: "var(--p-text)", fontWeight: 600 }}>{r.label}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: r.color }}>{r.value}</span>
              </div>
              <div style={{ height: 9, borderRadius: 5, background: "var(--p-bg)", overflow: "hidden" }}>
                <div style={{ width: `${total ? (r.value / total) * 100 : 0}%`, height: "100%", background: `linear-gradient(90deg, ${r.color}, ${r.color}cc)`, borderRadius: 5, animation: "barFill 1s cubic-bezier(.22,1,.36,1) both" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function IaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params;
  const { p } = await searchParams;
  const period: "week" | "month" = p === "week" ? "week" : "month";
  const days = period === "week" ? 7 : 30;
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

  const data = await buildImpact(portal.clientId, days);
  const rt = data.responseTime;
  const speedup = rt.aiMedianSec && rt.humanMedianSec && rt.aiMedianSec > 0 ? Math.round(rt.humanMedianSec / rt.aiMedianSec) : null;
  const periodLabel = period === "week" ? "últimos 7 dias" : "últimos 30 dias";

  const summary = data.leads.attended === 0
    ? "A IA ainda não atendeu leads neste período. Assim que ela entrar em ação fora do horário, os resultados aparecem aqui automaticamente."
    : `Neste período a IA atendeu ${int(data.leads.attended)} lead${data.leads.attended !== 1 ? "s" : ""} fora do horário${rt.aiMedianSec != null ? `, respondendo em ${fmtDur(rt.aiMedianSec)} em média` : ""}${data.recovered > 0 ? ` e reativou ${int(data.recovered)} que estava${data.recovered !== 1 ? "m" : ""} esfriando` : ""}.`;

  const tab = (key: "week" | "month", label: string) => {
    const on = period === key;
    return <a href={`?p=${key}`} style={{ flex: 1, textAlign: "center", padding: "7px 0", fontSize: 13, fontWeight: on ? 700 : 500, textDecoration: "none", color: on ? "var(--p-on-accent)" : "var(--p-muted)", background: on ? "var(--p-accent)" : "transparent", borderRadius: 9 }}>{label}</a>;
  };

  return (
    <main className="imain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="ia" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        .imain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;
          background-color:var(--p-bg);
          background-image:radial-gradient(1100px 460px at 50% -120px, var(--p-accent-soft), transparent 70%), radial-gradient(var(--p-border) 1px, transparent 1.5px);
          background-size:100% 560px, 24px 24px;background-repeat:no-repeat, repeat;background-position:center top, center top;background-attachment:fixed, fixed;}
        .itopbar{position:sticky;top:0;z-index:10;background:var(--p-surface);border-bottom:1px solid var(--p-border)}
        .itopbar-in{max-width:1160px;margin:0 auto;padding:9px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .itoggle{display:flex;gap:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:11px;padding:4px;min-width:170px;margin-left:auto}
        .iwrap{max-width:1160px;margin:0 auto;padding:18px 22px 56px;display:flex;flex-direction:column;gap:14px}
        .ikpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        @media(min-width:760px){ .itopbar-in,.iwrap{padding-left:26px;padding-right:26px} .ikpis{grid-template-columns:repeat(4,1fr)} }
        @keyframes barFill{from{width:0}}
        @media print{.itopbar{display:none!important}.imain{background:#fff!important}}`}</style>

      <div className="itopbar">
        <div className="itopbar-in">
          <div className="itoggle">{tab("month", "Mês")}{tab("week", "7 dias")}</div>
        </div>
      </div>

      <div className="iwrap">

        {/* RESUMO */}
        <div style={{ ...card, padding: "16px 20px", background: "linear-gradient(120deg, var(--p-accent-soft), var(--p-surface) 62%)", borderColor: "var(--p-accent-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--p-accent)" }} />
            <span style={{ ...cap, color: "var(--p-accent)" }}>Sua IA de atendimento · {periodLabel}</span>
          </div>
          <p style={{ fontSize: 15.5, lineHeight: 1.5, color: "var(--p-text)", marginTop: 9, fontWeight: 500 }}>{summary}</p>
        </div>

        {/* HERÓI · VELOCIDADE */}
        <div style={{ ...card, borderColor: "var(--p-accent-soft)" }}>
          <div style={cap}>Velocidade de resposta</div>
          {rt.aiMedianSec == null ? (
            <div style={{ fontSize: 13, color: "var(--p-muted)", marginTop: 10 }}>Sem dados ainda — aparece quando a IA começar a atender leads.</div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap", marginTop: 10 }}>
              <div>
                <div style={{ fontSize: 11.5, color: "var(--p-muted)", fontWeight: 600 }}>Com a IA</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: "var(--p-accent)", lineHeight: 1, letterSpacing: "-0.03em" }}>{fmtDur(rt.aiMedianSec)}</div>
                <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 4 }}>tempo médio de resposta</div>
              </div>
              {rt.humanMedianSec != null && (
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--p-muted)", fontWeight: 600 }}>Antes (atendimento manual)</div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "var(--p-muted)", lineHeight: 1.1, textDecoration: "line-through", textDecorationThickness: 1 }}>{fmtDur(rt.humanMedianSec)}</div>
                </div>
              )}
              {speedup && speedup > 1 && (
                <span style={{ fontSize: 14, fontWeight: 800, color: "#16a34a", padding: "6px 14px", borderRadius: 99, background: "var(--p-bg)", marginBottom: 6 }}>≈ {int(speedup)}× mais rápido</span>
              )}
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="ikpis">
          <Kpi label="Atendidos pela IA" value={int(data.leads.attended)} sub="fora do horário comercial" />
          <Kpi label="Recuperados" value={int(data.recovered)} accent={data.recovered > 0 ? "#16a34a" : undefined} sub="reativados antes de esfriar" />
          <Kpi label="Qualificados" value={int(data.leads.qualified)} sub="prontos para sua equipe" />
          <Kpi label="Resumos entregues" value={int(data.fichasEntregues)} sub="fichas prontas pro vendedor" />
        </div>

        {/* QUALIDADE DOS LEADS */}
        <QualityBar hot={data.leads.hot} warm={data.leads.warm} cold={data.leads.cold} />

        {/* COMO A IA TRABALHA */}
        <div style={{ ...card, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--p-bg)" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#16a34a", boxShadow: "0 0 0 4px rgba(22,163,74,.15)" }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "var(--p-text)" }}>Como sua IA trabalha</div>
            <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 1 }}>Ela responde na hora quando sua equipe está fora, qualifica cada lead, reativa quem esfria e entrega o resumo pronto pro vendedor seguir no dia seguinte.</div>
          </div>
        </div>

      </div>
    </main>
  );
}
