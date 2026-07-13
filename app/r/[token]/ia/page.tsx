import { prisma } from "@/lib/prisma";
import { resolvePortal, sectionEnabled } from "@/lib/notifications/client-portal";
import { redirect } from "next/navigation";
import { buildImpact } from "@/lib/ai-agent/impact";
import { normalizePeriod, recentMonths, periodRanges } from "@/lib/notifications/client-report";
import { themeStyle, themeSwitchCss, themeInitScript, PORTAL_UI_CSS } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { PortalPeriod } from "@/components/portal/portal-period";

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

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="p-metric">
      <div className="k">{label}</div>
      <div className="v" style={accent ? { color: accent } : undefined}>{value}</div>
      {sub && <div className="foot">{sub}</div>}
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

  if (!(await sectionEnabled(portal.clientId, "ia"))) redirect(`/r/${token}/conversas`);

  const client = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });

  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} />
      </main>
    );
  }

  const { start, end, label: periodLabel } = periodRanges(period);
  const data = await buildImpact(portal.clientId, { start, end });
  const rt = data.responseTime;
  const speedup = rt.aiMedianSec && rt.humanMedianSec && rt.aiMedianSec > 0 ? Math.round(rt.humanMedianSec / rt.aiMedianSec) : null;

  const summary = data.leads.attended === 0
    ? "A IA ainda não atendeu leads neste período. Assim que ela entrar em ação fora do horário, os resultados aparecem aqui automaticamente."
    : `Neste período a IA atendeu ${int(data.leads.attended)} lead${data.leads.attended !== 1 ? "s" : ""} fora do horário${rt.aiMedianSec != null ? `, respondendo em ${fmtDur(rt.aiMedianSec)} em média` : ""}${data.recovered > 0 ? ` e reativou ${int(data.recovered)} que estava${data.recovered !== 1 ? "m" : ""} esfriando` : ""}.`;

  return (
    <main className="imain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={client?.name || "Painel"} logoUrl={client?.logoUrl ?? null} active="ia" />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} ${PORTAL_UI_CSS} *{box-sizing:border-box}
        .imain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background:var(--p-bg)}
        @media(min-width:1024px){ .imain{margin-left:236px} }
        .ptop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--p-border);background:color-mix(in srgb,var(--p-bg) 82%,transparent);backdrop-filter:saturate(180%) blur(12px)}
        .ptop h1{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0}
        .ptop .sub{color:var(--p-muted);font-size:12.5px}
        @media print{.ptop{display:none!important}}`}</style>

      <div className="ptop">
        <div><h1>IA</h1><div className="sub">Atendimento automático · {periodLabel}</div></div>
        <div style={{ marginLeft: "auto" }}><PortalPeriod selected={selected} months={months} /></div>
      </div>

      <div className="p-wrap">
        {summary && (
          <div className="p-panel">
            <div className="p-phead"><h2>Sua IA de atendimento</h2><span className="hint">{periodLabel}</span></div>
            <p style={{ padding: "14px 18px", fontSize: 14.5, lineHeight: 1.55, color: "var(--p-text)", margin: 0 }}>{summary}</p>
          </div>
        )}

        <div className="p-panel">
          {/* Velocidade (herói) */}
          <div style={{ padding: 18, borderBottom: "1px solid var(--p-border)" }}>
            <div className="p-eyebrow">Velocidade de resposta</div>
            {rt.aiMedianSec == null ? (
              <div style={{ fontSize: 13, color: "var(--p-muted)", marginTop: 10 }}>Sem dados ainda — aparece quando a IA começar a atender leads.</div>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap", marginTop: 12 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--p-muted)", fontWeight: 600 }}>Com a IA</div>
                  <div className="tnum" style={{ fontSize: 44, fontWeight: 800, color: "var(--p-accent)", lineHeight: 1, letterSpacing: "-0.03em" }}>{fmtDur(rt.aiMedianSec)}</div>
                  <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 4 }}>tempo médio de resposta</div>
                </div>
                {rt.humanMedianSec != null && (
                  <div>
                    <div style={{ fontSize: 11.5, color: "var(--p-muted)", fontWeight: 600 }}>Antes (atendimento manual)</div>
                    <div className="tnum" style={{ fontSize: 24, fontWeight: 700, color: "var(--p-muted)", lineHeight: 1.1, textDecoration: "line-through" }}>{fmtDur(rt.humanMedianSec)}</div>
                  </div>
                )}
                {speedup && speedup > 1 && <span className="p-pill good" style={{ fontSize: 13, marginBottom: 6 }}>≈ {int(speedup)}× mais rápido</span>}
              </div>
            )}
          </div>
          {/* Métricas */}
          <div className="p-metrics">
            <Metric label="Atendidos pela IA" value={int(data.leads.attended)} sub="fora do horário comercial" />
            <Metric label="Recuperados" value={int(data.recovered)} accent={data.recovered > 0 ? "var(--p-good)" : undefined} sub="reativados antes de esfriar" />
            <Metric label="Qualificados" value={int(data.leads.qualified)} sub="prontos para sua equipe" />
            <Metric label="Resumos entregues" value={int(data.fichasEntregues)} sub="fichas prontas pro vendedor" />
          </div>
        </div>

        {/* Qualidade dos leads */}
        <QualityBar hot={data.leads.hot} warm={data.leads.warm} cold={data.leads.cold} />

        <p style={{ fontSize: 12, color: "var(--p-muted)", opacity: 0.9, lineHeight: 1.5, padding: "0 2px" }}>
          <b style={{ color: "var(--p-text)" }}>Como sua IA trabalha</b> — responde na hora quando sua equipe está fora, qualifica cada lead, reativa quem esfria e entrega o resumo pronto pro vendedor no dia seguinte.
        </p>
      </div>
    </main>
  );
}
