"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";
import { SparkLine } from "@/components/portal/spark-line";
import { TrendingUp, TrendingDown } from "lucide-react";

/* ============================== Tipos das APIs ============================== */

interface Kpis {
  leadsTotal: number;
  leadsGrowth: number;
  leads7d: number;
  investment: number;
  investmentGrowth: number;
  cpl: number;
  cplGrowth: number;
  taxaAtendimento: number;
  avgResponseMin: number;
  avgResponseSec: number;
  negociacoes: number;
  vendas: number;
}

interface DashboardData {
  kpis: Kpis;
  series: { date: string; leads: number }[];
}

interface Origem {
  label: string;
  leads: number;
  percent: number;
  investimento: number;
  cpl: number;
  color: string;
}

interface OrigemData {
  total: number;
  origens: Origem[];
}

interface Campanha {
  id: string;
  name: string;
  status: string;
  leads: number;
  investimento: number;
  cpl: number;
}

interface AtendimentoData {
  kpis: {
    total: number;
    respondidos: number;
    pendentes: number;
    taxaResposta: number;
    avgResponseMin: number;
    avgResponseSec: number;
  };
  distribuicao: { ate5m: number; ate30m: number; ate1h: number; mais1h: number };
}

interface EvolucaoData {
  period: string;
  series: { date: string; leads: number; investimento: number; cpl: number }[];
  totais: { leads: number; investimento: number; cpl: number };
}

/* ============================== Tokens ============================== */

const T = {
  textHi: "rgba(255,255,255,0.95)",
  textMid: "rgba(255,255,255,0.55)",
  textLow: "rgba(255,255,255,0.35)",
  surface: "rgba(255,255,255,0.025)",
  border: "rgba(255,255,255,0.06)",
  accent: "#818CF8",
  good: "#34D399",
  warn: "#F59E0B",
  bad: "#F87171",
};

const CARD: React.CSSProperties = {
  background: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 16,
};

/* ============================== Formatadores ============================== */

function fmtMoney(v: number, decimals = 0): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function fmtDuration(sec: number): string {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return s > 0 ? `${m}min ${s}s` : `${m}min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm > 0 ? `${h}h ${mm}min` : `${h}h`;
}

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 5) return "Boa noite";
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

/* O sistema interpreta os dados e fala com o cliente */
function buildVerdict(k: Kpis): { color: string; text: string } {
  if (k.leadsTotal === 0) {
    return {
      color: T.accent,
      text: "Tudo pronto. Assim que novos leads chegarem, seus resultados aparecem aqui automaticamente.",
    };
  }
  const cplDown = k.cpl > 0 && k.cplGrowth < -2;
  const cplUp = k.cpl > 0 && k.cplGrowth > 10;

  if (k.leadsGrowth >= 5) {
    let t = `Seus resultados estão crescendo: ${k.leadsGrowth.toFixed(0)}% mais leads que no período anterior`;
    if (cplDown) t += ", com custo por lead em queda";
    return { color: T.good, text: `${t}.` };
  }
  if (k.leadsGrowth <= -10) {
    return {
      color: T.warn,
      text: `Volume de leads ${Math.abs(k.leadsGrowth).toFixed(0)}% abaixo do período anterior — vale acompanhar as campanhas ativas.`,
    };
  }
  let t = "Resultados estáveis em relação ao período anterior";
  if (cplDown) t += ", com custo por lead em queda";
  else if (cplUp) t += ", atenção ao custo por lead em alta";
  return { color: T.accent, text: `${t}.` };
}

/* ============================== Micro-componentes ============================== */

function Skeleton({ height, width = "100%", radius = 8 }: { height: number; width?: number | string; radius?: number }) {
  return <div className="portal-skeleton" style={{ height, width, borderRadius: radius }} />;
}

function GrowthChip({ value, invert = false }: { value: number; invert?: boolean }) {
  const good = invert ? value <= 0 : value >= 0;
  const color = good ? T.good : T.bad;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `${color}1A`,
        padding: "3px 8px",
        borderRadius: 20,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <Icon size={12} />
      {Math.abs(value).toFixed(0)}%
    </span>
  );
}

function SectionHeader({ index, kicker, title, right }: { index: string; kicker: string; title: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: T.textLow, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 6 }}>
          {index} · {kicker}
        </p>
        <h2 style={{ fontSize: 19, fontWeight: 650, color: T.textHi, letterSpacing: "-0.3px" }}>{title}</h2>
      </div>
      {right}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ ...CARD, padding: "40px 32px", textAlign: "center" }}>
      <div
        style={{
          width: 8, height: 8, borderRadius: "50%", background: T.good,
          margin: "0 auto 14px", boxShadow: `0 0 12px ${T.good}80`,
        }}
      />
      <p style={{ fontSize: 13.5, color: T.textMid, maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>{children}</p>
    </div>
  );
}

/* ============================== Página ============================== */

type Period = "7d" | "30d" | "90d";
type Metric = "leads" | "investimento" | "cpl";

const METRICS: { value: Metric; label: string; color: string; money: boolean }[] = [
  { value: "leads", label: "Leads", color: "#818CF8", money: false },
  { value: "investimento", label: "Investimento", color: "#34D399", money: true },
  { value: "cpl", label: "CPL", color: "#F59E0B", money: true },
];

export default function PortalDashboard() {
  const router = useRouter();

  const [clientName, setClientName] = useState<string | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [origem, setOrigem] = useState<OrigemData | null>(null);
  const [campanhas, setCampanhas] = useState<Campanha[] | null>(null);
  const [atend, setAtend] = useState<AtendimentoData | null>(null);
  const [evolucao, setEvolucao] = useState<EvolucaoData | null>(null);
  const [period, setPeriod] = useState<Period>("30d");
  const [metric, setMetric] = useState<Metric>("leads");
  const [evoLoading, setEvoLoading] = useState(true);

  const loadEvolucao = useCallback((p: Period) => {
    setEvoLoading(true);
    fetch(`/api/portal/v1/evolucao?periodo=${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EvolucaoData | null) => { if (d) setEvolucao(d); })
      .finally(() => setEvoLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me")
      .then((r) => {
        if (!r.ok) { router.replace("/portal/login"); return null; }
        return r.json();
      })
      .then((d: { clientName?: string } | null) => { if (d) setClientName(d.clientName || "Cliente"); })
      .catch(() => router.replace("/portal/login"));

    fetch("/api/portal/v1/dashboard").then((r) => (r.ok ? r.json() : null)).then((d: DashboardData | null) => { if (d) setDash(d); });
    fetch("/api/portal/v1/origem").then((r) => (r.ok ? r.json() : null)).then((d: OrigemData | null) => { if (d) setOrigem(d); });
    fetch("/api/portal/v1/campanhas").then((r) => (r.ok ? r.json() : null)).then((d: { campanhas: Campanha[] } | null) => { if (d) setCampanhas(d.campanhas); });
    fetch("/api/portal/v1/atendimento").then((r) => (r.ok ? r.json() : null)).then((d: AtendimentoData | null) => { if (d) setAtend(d); });
  }, [router]);

  useEffect(() => { loadEvolucao(period); }, [loadEvolucao, period]);

  const k = dash?.kpis;
  const verdict = k ? buildVerdict(k) : null;
  const activeMetric = METRICS.find((m) => m.value === metric)!;
  const maxCampLeads = campanhas?.length ? Math.max(...campanhas.map((c) => c.leads), 1) : 1;
  const topCampanhas = campanhas?.slice(0, 5) ?? [];

  const distTotal = atend ? atend.distribuicao.ate5m + atend.distribuicao.ate30m + atend.distribuicao.ate1h + atend.distribuicao.mais1h : 0;
  const pctAte5m = distTotal > 0 && atend ? Math.round((atend.distribuicao.ate5m / distTotal) * 100) : 0;

  return (
    <div>
      <PortalNav />

      <main style={{ maxWidth: 1060, margin: "0 auto", padding: "44px 24px 80px" }}>
        {/* ============ VISÃO GERAL ============ */}
        <section id="visao" className="portal-section portal-rise" style={{ marginBottom: 64 }}>
          {/* Saudação */}
          <div style={{ marginBottom: 24 }}>
            {clientName === null ? (
              <Skeleton height={32} width={340} />
            ) : (
              <h1 style={{ fontSize: 27, fontWeight: 700, color: T.textHi, letterSpacing: "-0.5px" }}>
                {saudacao()}, {clientName}
              </h1>
            )}
            <p style={{ fontSize: 13.5, color: T.textLow, marginTop: 6 }}>
              Resumo dos últimos 30 dias
            </p>
          </div>

          {/* Veredito — o sistema responde "está funcionando?" */}
          {verdict ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: verdict.color, boxShadow: `0 0 10px ${verdict.color}90`, flexShrink: 0 }} />
              <p style={{ fontSize: 14.5, fontWeight: 500, color: "rgba(255,255,255,0.78)", lineHeight: 1.5 }}>{verdict.text}</p>
            </div>
          ) : (
            <div style={{ marginBottom: 28 }}><Skeleton height={20} width={440} /></div>
          )}

          {/* KPI herói: Leads Gerados */}
          <div
            style={{
              border: "1px solid rgba(129,140,248,0.18)",
              background: "linear-gradient(180deg, rgba(129,140,248,0.07) 0%, rgba(255,255,255,0.015) 100%)",
              borderRadius: 18,
              padding: "26px 28px",
              marginBottom: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div>
              <p style={{ fontSize: 11.5, fontWeight: 600, color: T.textMid, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
                Leads gerados
              </p>
              {k ? (
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 42, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums", lineHeight: 1, letterSpacing: "-1px" }}>
                    {k.leadsTotal}
                  </p>
                  <div>
                    <GrowthChip value={k.leadsGrowth} />
                    <p style={{ fontSize: 11.5, color: T.textLow, marginTop: 5 }}>vs período anterior · {k.leads7d} esta semana</p>
                  </div>
                </div>
              ) : (
                <Skeleton height={42} width={220} />
              )}
            </div>
            <div style={{ width: 220, minWidth: 160, flexShrink: 0 }}>
              {dash && dash.series.length > 1 ? (
                <SparkLine data={dash.series.map((s) => ({ value: s.leads }))} color={T.accent} height={56} />
              ) : (
                <Skeleton height={56} />
              )}
            </div>
          </div>

          {/* KPIs secundários */}
          <div
            style={{
              ...CARD,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              overflow: "hidden",
            }}
          >
            {[
              {
                label: "Investimento",
                value: k ? fmtMoney(k.investment) : null,
                extra: k && k.investment > 0 ? <GrowthChip value={k.investmentGrowth} /> : null,
              },
              {
                label: "Custo por lead",
                value: k ? (k.cpl > 0 ? fmtMoney(k.cpl, 2) : "—") : null,
                extra: k && k.cpl > 0 ? <GrowthChip value={k.cplGrowth} invert /> : null,
              },
              {
                label: "Tempo de 1ª resposta",
                value: k ? fmtDuration(k.avgResponseSec) : null,
                extra: null,
              },
              {
                label: "Taxa de atendimento",
                value: k ? `${k.taxaAtendimento.toFixed(0)}%` : null,
                extra: null,
              },
            ].map((item, i) => (
              <div
                key={item.label}
                style={{
                  padding: "20px 22px",
                  borderLeft: i > 0 ? `1px solid ${T.border}` : "none",
                }}
              >
                <p style={{ fontSize: 11, fontWeight: 600, color: T.textLow, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
                  {item.label}
                </p>
                {item.value === null ? (
                  <Skeleton height={24} width={90} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <p style={{ fontSize: 22, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {item.value}
                    </p>
                    {item.extra}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ============ 01 · ORIGEM ============ */}
        <section id="origem" className="portal-section portal-rise" style={{ marginBottom: 64, animationDelay: "80ms" }}>
          <SectionHeader index="01" kicker="Origem" title="De onde vieram os resultados?" />

          {origem === null ? (
            <Skeleton height={180} radius={16} />
          ) : origem.total === 0 ? (
            <EmptyState>
              Seu WhatsApp já está conectado. Assim que novos leads chegarem, a origem de cada um aparecerá aqui automaticamente.
            </EmptyState>
          ) : (
            <div style={{ ...CARD, padding: "26px 28px" }}>
              {/* Barra proporcional única */}
              <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", gap: 2, marginBottom: 24 }}>
                {origem.origens.filter((o) => o.leads > 0).map((o) => (
                  <div key={o.label} style={{ width: `${o.percent}%`, background: o.color, opacity: 0.85 }} />
                ))}
              </div>

              {/* Linhas por origem */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {origem.origens.map((o, i) => (
                  <div
                    key={o.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      flexWrap: "wrap",
                      padding: "14px 4px",
                      borderTop: i > 0 ? `1px solid ${T.border}` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: o.color, flexShrink: 0 }} />
                      <p style={{ fontSize: 14, fontWeight: 600, color: T.textHi }}>{o.label}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 22, flexWrap: "wrap" }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums" }}>
                        {o.leads} <span style={{ fontSize: 12, fontWeight: 500, color: T.textLow }}>leads</span>
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 600, color: o.color, fontVariantNumeric: "tabular-nums" }}>{o.percent.toFixed(0)}%</p>
                      <p style={{ fontSize: 12.5, color: T.textMid, fontVariantNumeric: "tabular-nums" }}>
                        {o.investimento > 0
                          ? `${fmtMoney(o.investimento)} investidos · CPL ${fmtMoney(o.cpl, 2)}`
                          : "Sem custo de mídia"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ============ 02 · CAMPANHAS ============ */}
        <section id="campanhas" className="portal-section portal-rise" style={{ marginBottom: 64, animationDelay: "140ms" }}>
          <SectionHeader index="02" kicker="Campanhas" title="Quais campanhas geraram resultado?" />

          {campanhas === null ? (
            <Skeleton height={240} radius={16} />
          ) : topCampanhas.length === 0 ? (
            <EmptyState>
              Assim que suas campanhas Meta Ads gerarem resultados, as de melhor desempenho aparecem aqui em destaque.
            </EmptyState>
          ) : (
            <div style={{ ...CARD, padding: "10px 28px" }}>
              {topCampanhas.map((c, i) => {
                const share = c.leads / maxCampLeads;
                const active = c.status === "ACTIVE";
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "28px 1fr auto",
                      gap: 16,
                      alignItems: "center",
                      padding: "16px 0",
                      borderTop: i > 0 ? `1px solid ${T.border}` : "none",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 700, color: i === 0 ? T.accent : T.textLow, fontVariantNumeric: "tabular-nums" }}>
                      {i + 1}
                    </p>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 600, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </p>
                        <span
                          style={{
                            fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 10, flexShrink: 0,
                            color: active ? T.good : T.textLow,
                            background: active ? `${T.good}15` : "rgba(255,255,255,0.05)",
                          }}
                        >
                          {active ? "Ativa" : c.status === "PAUSED" ? "Pausada" : "Encerrada"}
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%", borderRadius: 3, width: `${Math.max(share * 100, 2)}%`,
                            background: i === 0 ? `linear-gradient(90deg, ${T.accent}, #A5B4FC)` : "rgba(129,140,248,0.45)",
                            transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 15, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums" }}>
                        {c.leads} <span style={{ fontSize: 11.5, fontWeight: 500, color: T.textLow }}>leads</span>
                      </p>
                      <p style={{ fontSize: 11.5, color: T.textMid, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                        {c.cpl > 0 ? `CPL ${fmtMoney(c.cpl, 2)}` : fmtMoney(c.investimento)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ============ 03 · ATENDIMENTO ============ */}
        <section id="atendimento" className="portal-section portal-rise" style={{ marginBottom: 64, animationDelay: "200ms" }}>
          <SectionHeader index="03" kicker="Atendimento" title="Como está o atendimento?" />

          {atend === null ? (
            <Skeleton height={220} radius={16} />
          ) : atend.kpis.total === 0 ? (
            <EmptyState>
              Assim que as primeiras conversas chegarem, você acompanha aqui a velocidade e a qualidade do seu atendimento.
            </EmptyState>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14 }}>
              {/* Resumo */}
              <div style={{ ...CARD, padding: "26px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 20 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: T.textLow, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
                      Taxa de atendimento
                    </p>
                    <p style={{ fontSize: 34, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {atend.kpis.taxaResposta.toFixed(0)}%
                    </p>
                    <p style={{ fontSize: 11.5, color: T.textLow, marginTop: 6 }}>
                      {atend.kpis.respondidos} de {atend.kpis.total} leads
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: T.textLow, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
                      Tempo médio
                    </p>
                    <p style={{ fontSize: 34, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
                      {fmtDuration(atend.kpis.avgResponseSec)}
                    </p>
                    <p style={{ fontSize: 11.5, color: T.textLow, marginTop: 6 }}>até a 1ª resposta</p>
                  </div>
                </div>
                {distTotal > 0 && (
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", lineHeight: 1.55, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                    {pctAte5m >= 50
                      ? `${pctAte5m}% dos leads são atendidos em menos de 5 minutos — velocidade que aumenta a chance de conversão.`
                      : `${pctAte5m}% dos leads são atendidos em menos de 5 minutos. Quanto mais rápida a 1ª resposta, maior a conversão.`}
                  </p>
                )}
              </div>

              {/* Distribuição horizontal */}
              <div style={{ ...CARD, padding: "26px 28px" }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: T.textLow, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 18 }}>
                  Tempo até a 1ª resposta
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    { label: "≤ 5 min", value: atend.distribuicao.ate5m, color: T.good },
                    { label: "≤ 30 min", value: atend.distribuicao.ate30m, color: T.accent },
                    { label: "≤ 1 hora", value: atend.distribuicao.ate1h, color: T.warn },
                    { label: "> 1 hora", value: atend.distribuicao.mais1h, color: T.bad },
                  ].map((row) => {
                    const pct = distTotal > 0 ? (row.value / distTotal) * 100 : 0;
                    return (
                      <div key={row.label} style={{ display: "grid", gridTemplateColumns: "64px 1fr 70px", gap: 12, alignItems: "center" }}>
                        <p style={{ fontSize: 12, color: T.textMid, fontVariantNumeric: "tabular-nums" }}>{row.label}</p>
                        <div style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.05)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.max(pct, 1)}%`, background: row.color, opacity: 0.8, borderRadius: 4 }} />
                        </div>
                        <p style={{ fontSize: 12, color: T.textMid, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {row.value} · {pct.toFixed(0)}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ============ 04 · EVOLUÇÃO ============ */}
        <section id="evolucao" className="portal-section portal-rise" style={{ animationDelay: "260ms" }}>
          <SectionHeader
            index="04"
            kicker="Evolução"
            title="Como está a trajetória?"
            right={
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
                {(["7d", "30d", "90d"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    style={{
                      padding: "6px 13px",
                      borderRadius: 8,
                      border: "none",
                      background: period === p ? "rgba(255,255,255,0.1)" : "transparent",
                      color: period === p ? T.textHi : T.textLow,
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 150ms",
                    }}
                  >
                    {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "90 dias"}
                  </button>
                ))}
              </div>
            }
          />

          {/* Seletor de métrica */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {METRICS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMetric(m.value)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 20,
                  border: `1px solid ${metric === m.value ? `${m.color}55` : T.border}`,
                  background: metric === m.value ? `${m.color}14` : "transparent",
                  color: metric === m.value ? m.color : "rgba(255,255,255,0.45)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 150ms",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div style={{ ...CARD, padding: "24px 24px 18px" }}>
            {evoLoading ? (
              <Skeleton height={210} radius={10} />
            ) : evolucao && evolucao.series.length > 1 ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
                  <p style={{ fontSize: 24, fontWeight: 700, color: T.textHi, fontVariantNumeric: "tabular-nums" }}>
                    {activeMetric.money ? fmtMoney(evolucao.totais[metric], metric === "cpl" ? 2 : 0) : evolucao.totais[metric]}
                  </p>
                  <p style={{ fontSize: 12.5, color: T.textLow }}>
                    {metric === "cpl" ? "médio no período" : "no período"}
                  </p>
                </div>
                <LineChart
                  data={evolucao.series.map((s) => ({ date: s.date, value: s[metric] }))}
                  color={activeMetric.color}
                  height={190}
                  showDates
                />
              </>
            ) : (
              <p style={{ fontSize: 13.5, color: T.textMid, textAlign: "center", padding: "70px 0", lineHeight: 1.6 }}>
                O histórico diário é construído automaticamente conforme os dados chegam.
              </p>
            )}
          </div>
        </section>

        {/* Rodapé discreto */}
        <p style={{ marginTop: 64, textAlign: "center", fontSize: 11.5, color: "rgba(255,255,255,0.22)", letterSpacing: "0.3px" }}>
          Veloce · Centro de Performance — dados atualizados automaticamente
        </p>
      </main>
    </div>
  );
}
