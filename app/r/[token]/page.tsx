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

const fmtDay = (d: string) => { const [, m, day] = d.split("-"); return `${day}/${m}`; };

// Melhor campanha como um post do Instagram (mockup do feed) — preenche o card e
// mostra o criativo vencedor "como ele aparece" pro lead.
function CampaignShowcase({ campaign, brandName, logoUrl, accent, onAccent }: {
  campaign: { name: string; leads: number; image: string | null }; brandName: string; logoUrl: string | null; accent: string; onAccent: string;
}) {
  return (
    <div className="pgrow" style={{ ...card, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={capLabel}>🏆 Melhor campanha</span>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--p-muted)" }}>{int(campaign.leads)} leads de anúncio</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderTop: "1px solid var(--p-border)" }}>
        {/* cabeçalho do post */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
          {logoUrl
            ? <img src={logoUrl} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} />
            : <div style={{ width: 28, height: 28, borderRadius: "50%", background: accent, color: onAccent, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13 }}>{brandName[0]?.toUpperCase()}</div>}
          <div style={{ flex: 1, lineHeight: 1.15 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--p-text)" }}>{brandName}</div>
            <div style={{ fontSize: 10.5, color: "var(--p-muted)" }}>Patrocinado</div>
          </div>
          <span style={{ color: "var(--p-muted)", fontSize: 16, letterSpacing: 1 }}>···</span>
        </div>
        {/* criativo: fundo borrado preenche o espaço, imagem nítida por cima */}
        {campaign.image ? (
          <div style={{ position: "relative", flex: 1, minHeight: 150, background: "#0a0a0a", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${campaign.image}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(22px)", transform: "scale(1.25)", opacity: 0.55 }} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={campaign.image} alt="criativo da campanha" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 150, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--p-accent-soft)", color: "var(--p-muted)", fontSize: 13 }}>Sem prévia do criativo</div>
        )}
        {/* ações + legenda */}
        <div style={{ padding: "9px 12px 12px" }}>
          <div style={{ display: "flex", gap: 14, marginBottom: 7, color: "var(--p-text)", opacity: 0.85, fontSize: 15 }}>
            <span aria-hidden>♡</span><span aria-hidden>💬</span><span aria-hidden>➤</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--p-text)", lineHeight: 1.35 }}>
            <b>{brandName}</b> <span style={{ color: "var(--p-muted)" }}>{campaign.name}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Medidor circular animado (donut SVG) — o arco "enche" ao carregar. R fixo em 32
// (circunferência ≈ 202, casada com o @keyframes gaugeIn).
function Gauge({ score, color }: { score: number; color: string }) {
  const R = 32, C = 2 * Math.PI * R;
  const off = C * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width="86" height="86" viewBox="0 0 84 84" style={{ flexShrink: 0, animation: "gaugeFade .5s ease-out both" }}>
      <circle cx="42" cy="42" r={R} fill="none" stroke="var(--p-accent-soft)" strokeWidth="8" />
      <circle cx="42" cy="42" r={R} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={off} transform="rotate(-90 42 42)"
        style={{ animation: "gaugeIn 1.2s cubic-bezier(.22,1,.36,1) both" }} />
      <text x="42" y="43" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 23, fontWeight: 800, fill: "var(--p-text)" }}>{score}</text>
    </svg>
  );
}

// Mini-gráfico de barras (tendência de conversas por dia). Sem eixos, sem poluição.
function Sparkline({ series }: { series: { day: string; leads: number }[] }) {
  const maxV = Math.max(1, ...series.map((s) => s.leads));
  const total = series.reduce((s, x) => s + x.leads, 0);
  return (
    <div className="pspark" style={{ ...card, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={capLabel}>📈 Conversas por dia</span>
        <span style={{ fontSize: 11.5, color: "var(--p-muted)" }}>{total} no período · pico {maxV}/dia</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, flex: 1, minHeight: 56 }}>
        {series.map((s, i) => {
          const h = Math.max(3, Math.round((s.leads / maxV) * 100));
          return <div key={i} title={`${fmtDay(s.day)}: ${s.leads} conversa(s)`} style={{ flex: 1, minWidth: 2, height: `${h}%`, background: s.leads ? "var(--p-accent)" : "var(--p-border)", opacity: s.leads ? 1 : 0.5, borderRadius: 3 }} />;
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10.5, color: "var(--p-muted)" }}>
        <span>{fmtDay(series[0].day)}</span>
        <span>{fmtDay(series[series.length - 1].day)}</span>
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
    <main className="pmain">
      <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}
        /* Fundo com profundidade: brilho sutil na cor do cliente + textura de pontos
           discreta (preenche as bordas no PC sem poluir). Estático de propósito. */
        .pmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;
          background-color:var(--p-bg);
          background-image:radial-gradient(1100px 460px at 50% -120px, var(--p-accent-soft), transparent 70%), radial-gradient(var(--p-border) 1px, transparent 1.5px);
          background-size:100% 560px, 24px 24px;background-repeat:no-repeat, repeat;
          background-position:center top, center top;background-attachment:fixed, fixed;}
        .ptopbar{position:sticky;top:0;z-index:10;background:var(--p-surface);border-bottom:1px solid var(--p-border)}
        .ptopbar-in{max-width:1120px;margin:0 auto;padding:10px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
        .pbrand{display:flex;align-items:center;gap:12px;flex:1;min-width:200px}
        .ptopmeta{display:flex;align-items:center;gap:14px}
        .pupdated{display:none;font-size:11.5px;color:var(--p-muted)}
        .ptoggle{display:flex;gap:4px;background:var(--p-bg);border:1px solid var(--p-border);border-radius:11px;padding:4px;min-width:178px}
        .pwrap{max-width:1120px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:14px}
        .pcol{display:flex;flex-direction:column;gap:12px}
        .psec{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
        .pkpis{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
        .ptiles{display:grid;grid-template-columns:1fr;gap:12px}
        @media(min-width:760px){
          .ptopbar-in,.pwrap{padding-left:22px;padding-right:22px}
          .pupdated{display:block}
          .pkpis{grid-template-columns:repeat(3,1fr)}
          .ptiles{grid-template-columns:1fr 1fr}
        }
        /* PC: dashboard de tela cheia, SEM rolagem, usando a largura. Anúncios |
           Atendimento lado a lado — conta a história do valor de relance. */
        @media(min-width:1100px) and (min-height:620px){
          .pmain{height:100dvh;overflow:hidden;display:flex;flex-direction:column}
          .ptopbar-in,.pwrap{max-width:none}
          .pwrap{flex:1;min-height:0;padding:14px 22px;display:grid;
            grid-template-columns:5fr 7fr;grid-template-rows:auto minmax(0,1fr);
            grid-template-areas:"narr narr" "ads atd";gap:14px}
          .pnarr{grid-area:narr}
          .pcol-ads{grid-area:ads;min-height:0}
          .pcol-atd{grid-area:atd;min-height:0}
          .pgrow{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
          .pspark{flex:1;min-height:0}
        }
        @keyframes gaugeIn{from{stroke-dashoffset:202px}}
        @keyframes gaugeFade{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}`}</style>

      {/* Topbar full-width */}
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
          <div className="ptopmeta">
            <span className="pupdated">Atualizado {atualizado}</span>
            <div className="ptoggle">{tab("month", "Mês")}{tab("week", "7 dias")}</div>
          </div>
        </div>
      </div>

      <div className="pwrap">

        {/* Narrativa (o "e daí") */}
        {data.narrative.length > 0 && (
          <div className="pnarr" style={{ ...card, borderLeft: "3px solid var(--p-accent)" }}>
            {data.narrative.map((line, i) => (
              <div key={i} style={{ fontSize: 13.5, color: "var(--p-text)", lineHeight: 1.5, marginTop: i ? 5 : 0 }}>{line}</div>
            ))}
          </div>
        )}

        {/* ───── BLOCO 1 · ANÚNCIOS (o que a Veloce entrega) ───── */}
        {data.midia && (
          <div className="pcol pcol-ads">
            <div className="psec">
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--p-text)" }}>📣 Anúncios</span>
              <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>· investimento e leads gerados</span>
            </div>
            <div className="pkpis">
              <Kpi label="Investido" value={brl(data.midia.spend)} sub="em mídia no período" />
              <Kpi label="Leads de anúncio" value={int(data.midia.leads)} sub={deltaTxt && <span style={{ color: deltaColor, fontWeight: 600 }}>{deltaTxt}</span>} />
              <Kpi label="Custo por lead" value={data.midia.cpl != null ? brl(data.midia.cpl) : "—"} sub="quanto custou cada lead" />
            </div>
            {data.bestCampaign && (
              <CampaignShowcase campaign={data.bestCampaign} brandName={brandName} logoUrl={client?.logoUrl ?? null} accent={accent} onAccent={buildTheme(portal.accentColor, "light").onAccent} />
            )}
          </div>
        )}

        {/* ───── BLOCO 2 · ATENDIMENTO (como os leads foram tratados) ───── */}
        <div className="pcol pcol-atd">
          <div className="psec">
            <span style={{ fontSize: 15, fontWeight: 800, color: "var(--p-text)" }}>💬 Atendimento</span>
            <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>· velocidade de resposta e conversão</span>
          </div>
          <div className="pkpis">
            <Kpi label="Conversas no WhatsApp" value={int(a.leads)} sub={deltaTxt && <span style={{ color: deltaColor, fontWeight: 600 }}>{deltaTxt}</span>} />
            <Kpi label="Tempo de resposta" value={a.tempoMedioMin != null ? `${a.tempoMedioMin} min` : "—"} sub={`${a.taxaResposta}% respondidos`} />
            <Kpi label="Conversões" value={int(a.conversoes)} sub="sinalizados no chat" />
          </div>
          <div className="ptiles">
            {/* Saúde do atendimento — gauge animado, a estrela do bloco */}
            <div style={{ ...card, display: "flex", alignItems: "center", gap: 16 }}>
              <Gauge score={data.health.score} color={healthColor} />
              <div>
                <div style={capLabel}>Saúde do atendimento</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: healthColor, marginTop: 4 }}>{data.health.label}</div>
                {benchmark != null && <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 4 }}>Melhor que {benchmark}% das contas</div>}
              </div>
            </div>

            {/* Aguardando agora */}
            <div style={card}>
              <div style={{ ...capLabel, marginBottom: 12 }}>🌡️ Aguardando atendimento agora</div>
              {term.total === 0 ? (
                <div style={{ fontSize: 14, color: "var(--p-muted)" }}>Nenhum lead aguardando. 👌</div>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  {[{ k: "🔥 Quentes", v: term.hot }, { k: "🟠 Mornos", v: term.warm }, { k: "🧊 Frios", v: term.cold }].map((x) => (
                    <div key={x.k} style={{ flex: 1, textAlign: "center", padding: "10px 6px", background: "var(--p-accent-soft)", borderRadius: 12 }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "var(--p-text)" }}>{x.v}</div>
                      <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 2 }}>{x.k}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {data.series.length > 1 && <Sparkline series={data.series} />}
        </div>

      </div>
    </main>
  );
}
