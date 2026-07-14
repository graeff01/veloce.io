import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { resolvePortal, parseSections, getPortalShellData } from "@/lib/notifications/client-portal";
import { getClientDashboard, getBenchmark, getSectorBenchmark, normalizePeriod, recentMonths } from "@/lib/notifications/client-report";
import { PortalPeriod } from "@/components/portal/portal-period";
import { themeStyle, themeSwitchCss, themeInitScript, PORTAL_UI_CSS } from "@/lib/portal-theme";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { PortalGate } from "@/components/portal/portal-gate";
import { PortalShell } from "@/components/portal/portal-shell";
import { AreaChart, Sparkline } from "@/components/portal/portal-charts";
import { PortalShare } from "@/components/portal/portal-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const int = (v: number) => v.toLocaleString("pt-BR");
const scoreColor = (s: number) => (s >= 80 ? "var(--p-good)" : s >= 60 ? "var(--p-accent)" : s >= 40 ? "var(--p-warn)" : "var(--p-crit)");

// Chip de variação (▲/▼) com cor semântica. goodWhenUp indefinido = neutro.
function DeltaChip({ pct, goodWhenUp }: { pct: number | null; goodWhenUp?: boolean }) {
  if (pct == null) return <span className="p-chip flat">— estável</span>;
  const up = pct >= 0;
  const cls = goodWhenUp === undefined ? "flat" : up === goodWhenUp ? "up" : "down";
  return <span className={`p-chip ${cls}`}>{up ? "▲" : "▼"} {up ? "+" : ""}{pct}%</span>;
}

export default async function PortalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ p?: string }> }) {
  const { token } = await params;
  const { p } = await searchParams;
  const months = recentMonths(12);
  const period = normalizePeriod(p);
  const selected = period === "week" ? "week" : period === "month" ? months[0].value : period;
  const portal = await resolvePortal(token);

  if (!portal) {
    return (
      <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#101319", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
        <div><div style={{ fontSize: 40 }}>🔒</div><h1 style={{ fontSize: 18, marginTop: 12 }}>Link indisponível</h1><p style={{ color: "#6b7480", marginTop: 6, fontSize: 14 }}>Este painel foi desativado ou o link expirou. Peça um novo à sua agência.</p></div>
      </main>
    );
  }

  // No celular, a entrada do painel vai DIRETO para as conversas (foco em responder
  // os leads — é a tela nova). Desktop mantém o dashboard de métricas como entrada.
  const ua = (await headers()).get("user-agent") || "";
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(ua)) redirect(`/r/${token}/conversas`);

  // Se o gestor desligou o "Painel" (dashboard) para este cliente, a entrada vai pras conversas.
  const cpSections = await prisma.clientPortal.findUnique({ where: { clientId: portal.clientId }, select: { sections: true } });
  if (!parseSections(cpSections?.sections).includes("painel")) redirect(`/r/${token}/conversas`);

  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    const c = await prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } });
    return (
      <main style={{ minHeight: "100dvh", background: "var(--p-bg)", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <style>{`${themeStyle(portal.accentColor, portal.mode)} *{box-sizing:border-box}`}</style>
        <PortalGate token={token} brandName={c?.name || "Painel"} logoUrl={c?.logoUrl ?? null} />
      </main>
    );
  }

  const [client, bot, data, benchmark, sector] = await Promise.all([
    prisma.client.findUnique({ where: { id: portal.clientId }, select: { name: true, logoUrl: true } }),
    prisma.clientBot.findUnique({ where: { clientId: portal.clientId }, select: { brandName: true } }),
    getClientDashboard(portal.clientId, period),
    getBenchmark(portal.clientId, period).catch(() => null),
    getSectorBenchmark(portal.clientId, period).catch(() => null),
  ]);

  const brandName = (bot?.brandName || "").trim() || client?.name || "Painel";
  const shell = await getPortalShellData(portal.clientId);
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


  return (
    <main className="pmain">
      <script dangerouslySetInnerHTML={{ __html: themeInitScript(token, portal.mode) }} />
      <PortalShell token={token} brandName={brandName} logoUrl={client?.logoUrl ?? null} active="painel" sections={shell.sections} account={shell.account} aiTest={shell.aiTest} />
      <style>{`${themeSwitchCss(portal.accentColor, portal.mode)} ${PORTAL_UI_CSS} *{box-sizing:border-box}
        .pmain{min-height:100dvh;color:var(--p-text);font-family:system-ui,-apple-system,sans-serif;background:var(--p-bg)}
        @media(min-width:1024px){ .pmain{margin-left:236px} }
        .ptop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:14px 26px;border-bottom:1px solid var(--p-border);background:color-mix(in srgb,var(--p-bg) 82%,transparent);backdrop-filter:saturate(180%) blur(12px)}
        .ptop h1{font-size:18px;font-weight:700;letter-spacing:-.02em;margin:0}
        .ptop .sub{color:var(--p-muted);font-size:12.5px}
        .p-track{height:7px;border-radius:5px;background:var(--p-raise);overflow:hidden}
        .p-track>span{display:block;height:100%;border-radius:5px}
        @media print{.ptop{display:none!important}}`}</style>

      <div className="ptop">
        <div><h1>Visão geral</h1><div className="sub">{data.periodLabel} · atualizado {atualizado}</div></div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <PortalShare />
          <PortalPeriod selected={selected} months={months} />
        </div>
      </div>

      <div className="p-wrap">
        {/* Resumo */}
        {summary.length > 0 && (
          <div className="p-panel">
            <div className="p-phead"><h2>Resumo da operação</h2></div>
            <p style={{ padding: "14px 18px", fontSize: 14.5, lineHeight: 1.55, color: "var(--p-text)", margin: 0 }}>{summary.slice(0, 4).join(" ")}</p>
          </div>
        )}

        {/* Receita & Retorno — prova de valor em R$ (dinheiro que voltou vs. investido) */}
        {data.financials && (data.financials.revenue > 0 || data.financials.spend > 0) && (() => {
          const f = data.financials;
          return (
            <div className="p-panel" style={{ overflow: "hidden" }}>
              <div className="p-phead"><h2>Receita &amp; retorno</h2><span className="hint">vendas confirmadas neste período</span></div>
              <div style={{ padding: "18px 18px 6px", display: "flex", gap: 30, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div className="p-eyebrow">Receita gerada</div>
                  <div className="tnum" style={{ fontSize: 46, fontWeight: 800, color: "var(--p-good)", letterSpacing: "-0.035em", lineHeight: 0.95, marginTop: 6 }}>{brl(f.revenue)}</div>
                  <div style={{ marginTop: 8 }}><DeltaChip pct={f.revenueDelta} goodWhenUp /></div>
                </div>
                {f.roas != null && (
                  <div style={{ paddingLeft: 30, borderLeft: "1px solid var(--p-border)" }}>
                    <div className="p-eyebrow">Retorno sobre o investido</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
                      <div className="tnum" style={{ fontSize: 46, fontWeight: 800, color: "var(--p-accent)", letterSpacing: "-0.035em", lineHeight: 0.95 }}>{f.roas.toLocaleString("pt-BR")}x</div>
                      <span className="p-pill good" style={{ fontSize: 12.5 }}>cada R$ 1 virou {brl(f.roas)}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--p-muted)", marginTop: 8 }}>investiu {brl(f.spend)} · voltou <b style={{ color: "var(--p-text)" }}>{brl(f.revenue)}</b> em vendas</div>
                  </div>
                )}
              </div>
              <div className="p-metrics">
                <div className="p-metric"><div className="k">Vendas fechadas</div><div className="v">{int(f.sales)}</div></div>
                <div className="p-metric"><div className="k">Ticket médio</div><div className="v">{f.avgTicket != null ? brl(f.avgTicket) : "—"}</div></div>
                <div className="p-metric"><div className="k">Investimento em mídia</div><div className="v">{brl(f.spend)}</div></div>
                <div className="p-metric"><div className="k">Retorno</div><div className="v" style={{ color: f.profit != null && f.profit >= 0 ? "var(--p-good)" : undefined }}>{f.profit != null ? brl(f.profit) : "—"}</div>{f.profit != null && <div className="foot">receita − investimento</div>}</div>
              </div>
            </div>
          );
        })()}

        {/* Métricas + split (velocidade de atendimento · health score) */}
        <div className="p-panel">
          <div className="p-metrics">
            <div className="p-metric">
              <div className="k">Investimento</div>
              <div className="v">{data.midia ? brl(data.midia.spend) : "—"}</div>
              {data.midia ? <DeltaChip pct={d.spend} /> : <div className="foot">sem anúncios conectados</div>}
            </div>
            <div className="p-metric">
              <div className="k">Leads</div>
              <div className="v">{int(a.leads)}</div>
              <DeltaChip pct={d.leads} goodWhenUp />
              {data.series.length > 1 && <div style={{ marginTop: 10 }}><Sparkline points={data.series.map((s) => s.leads)} colorVar="--p-good" /></div>}
            </div>
            <div className="p-metric">
              <div className="k">Custo por lead</div>
              <div className="v">{data.midia?.cpl != null ? brl(data.midia.cpl) : "—"}</div>
              {data.midia?.cpl != null && <DeltaChip pct={d.cpl} goodWhenUp={false} />}
              {sector && <div className="foot">{sector.pctBelow >= 0 ? `${sector.pctBelow}% abaixo do setor` : `${Math.abs(sector.pctBelow)}% acima do setor`}</div>}
            </div>
            <div className="p-metric">
              <div className="k">Leads sem resposta</div>
              <div className="v" style={{ color: semResposta > 0 ? "var(--p-crit)" : "var(--p-good)" }}>{semResposta > 0 ? int(semResposta) : "0"}</div>
              <span className={`p-chip ${semResposta > 0 ? "down" : "up"}`}>{semResposta > 0 ? `~${int(lostOps)} parada${lostOps !== 1 ? "s" : ""}` : "tudo respondido"}</span>
            </div>
          </div>

          <div className="p-split">
            {/* Desempenho · leads por dia (gráfico de área) */}
            <div>
              <div className="p-eyebrow">Desempenho · leads por dia</div>
              <div style={{ marginTop: 14 }}>
                <AreaChart points={data.series.map((s) => s.leads)} height={172} />
              </div>
            </div>
            {/* Health score */}
            <div>
              <div className="p-eyebrow">Health score</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 12 }}>
                <div className="tnum" style={{ fontSize: 46, fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 0.9, color: scoreColor(sc.total) }}>{sc.total}<span style={{ fontSize: 15, fontWeight: 600, color: "var(--p-muted)" }}>/100</span></div>
                <span className={`p-pill ${sc.total >= 80 ? "good" : sc.total >= 40 ? "warn" : "crit"}`}>{data.health.label}</span>
              </div>
              {benchmark != null && <div style={{ fontSize: 11.5, color: "var(--p-muted)", marginTop: 6 }}>melhor que {benchmark}% das contas</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                {([["Marketing", sc.marketing, "40%"], ["Atendimento", sc.atendimento, "35%"], ["Conversão", sc.conversao, "25%"]] as const).map(([label, val, w]) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12 }}><span style={{ color: "var(--p-text)", fontWeight: 600 }}>{label} <span style={{ color: "var(--p-muted)", fontWeight: 400 }}>· peso {w}</span></span><b className="tnum" style={{ color: scoreColor(val) }}>{val}</b></div>
                    <div className="p-track"><span style={{ width: `${val}%`, background: scoreColor(val) }} /></div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "var(--p-muted)", marginTop: 14 }}>{healthHint}</div>
            </div>
          </div>
        </div>

        {/* Velocidade de atendimento */}
        <div className="p-panel">
          <div className="p-phead"><h2>Velocidade de atendimento</h2><span className="hint">{a.tempoMedioMin != null ? `${int(a.tempoMedioMin)}min médio` : "sem dados"} · {a.taxaResposta}% respondidos</span></div>
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 11 }}>
            {(() => {
              const rows = [
                { label: "Respondido em até 5 min", value: data.responseBuckets.upTo5, c: "var(--p-good)" },
                { label: "Entre 5 e 30 min", value: data.responseBuckets.upTo30, c: "#65a30d" },
                { label: "Entre 30 e 60 min", value: data.responseBuckets.upTo60, c: "var(--p-warn)" },
                { label: "Mais de 1 hora", value: data.responseBuckets.over60, c: "#f97316" },
                { label: "Sem resposta", value: data.responseBuckets.sem, c: "var(--p-crit)" },
              ];
              const max = Math.max(1, ...rows.map((r) => r.value));
              return rows.map((r, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 12.5 }}><span style={{ color: "var(--p-text)" }}>{r.label}</span><b className="tnum" style={{ color: r.c }}>{r.value}</b></div>
                  <div className="p-track"><span style={{ width: `${(r.value / max) * 100}%`, background: r.c }} /></div>
                </div>
              ));
            })()}
          </div>
        </div>

        {/* Transformação */}
        {data.transformation && (
          <div className="p-panel">
            <div className="p-phead"><h2>O que mudou com a Veloce</h2><span className="hint">desde {data.transformation.baselineLabel} · antes → depois</span></div>
            <div style={{ padding: "4px 18px 12px" }}>
              {data.transformation.tempo.before != null && data.transformation.tempo.after != null && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "11px 0", borderBottom: "1px solid var(--p-border)" }}>
                  <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>Tempo de 1ª resposta</span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="tnum" style={{ color: "var(--p-muted)", textDecoration: "line-through", fontSize: 12.5 }}>{int(data.transformation.tempo.before)}min</span><span style={{ color: "var(--p-good)" }}>→</span><b className="tnum" style={{ fontSize: 16 }}>{int(data.transformation.tempo.after)}min</b></span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "11px 0", borderBottom: data.projection ? "1px solid var(--p-border)" : "none" }}>
                <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>Taxa de conversão</span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="tnum" style={{ color: "var(--p-muted)", textDecoration: "line-through", fontSize: 12.5 }}>{data.transformation.conversao.before}%</span><span style={{ color: "var(--p-good)" }}>→</span><b className="tnum" style={{ fontSize: 16 }}>{data.transformation.conversao.after}%</b></span>
              </div>
              {data.projection && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "11px 0" }}>
                  <span style={{ fontSize: 12.5, color: "var(--p-muted)" }}>Projeção próximo mês</span>
                  <b className="tnum" style={{ fontSize: 15 }}>~{int(data.projection.sales)} venda{data.projection.sales !== 1 ? "s" : ""}{data.projection.revenue != null ? ` · ${brl(data.projection.revenue)}` : ""}</b>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
