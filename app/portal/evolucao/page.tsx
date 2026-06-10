"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";

type Period = "7d" | "30d" | "90d" | "12m";
type Metric = "leads" | "conversoes" | "investimento" | "cpl";

interface Point { date: string; leads: number; conversoes: number; investimento: number; cpl: number }
interface EvolucaoData {
  period: Period;
  granularity: "day" | "month";
  series: Point[];
  hasInvestmentData: boolean;
  totais: { leads: number; conversoes: number; investimento: number; cpl: number | null };
}

const PERIODS: { v: Period; label: string }[] = [
  { v: "7d", label: "7 dias" },
  { v: "30d", label: "30 dias" },
  { v: "90d", label: "90 dias" },
  { v: "12m", label: "12 meses" },
];

const METRICS: { v: Metric; label: string; color: string; money: boolean }[] = [
  { v: "leads", label: "Oportunidades", color: "#6366F1", money: false },
  { v: "conversoes", label: "Conversões", color: "#10B981", money: false },
  { v: "investimento", label: "Investimento", color: "#0EA5E9", money: true },
  { v: "cpl", label: "Custo por oportunidade", color: "#F59E0B", money: true },
];

const num: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

function fmtMoney(v: number, d = 0) { return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}`; }
function fmtMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
}

export default function PortalEvolucao() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [metric, setMetric] = useState<Metric>("leads");
  const [data, setData] = useState<EvolucaoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const load = useCallback((p: Period) => {
    setLoading(true);
    fetch(`/api/portal/v1/evolucao?periodo=${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: EvolucaoData | null) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me")
      .then((r) => { if (!r.ok) { router.replace("/portal/login"); return; } setAuthChecked(true); })
      .catch(() => router.replace("/portal/login"));
  }, [router]);

  useEffect(() => { load(period); }, [load, period]);

  const active = METRICS.find((m) => m.v === metric)!;
  const investUnavailable = (metric === "investimento" || metric === "cpl") && data && !data.hasInvestmentData;

  const chartData = data
    ? data.series.map((s) => ({
        date: data.granularity === "month" ? `${s.date}-01` : s.date,
        value: s[metric],
      }))
    : [];

  function totalLabel(): string {
    if (!data) return "—";
    if (metric === "leads") return String(data.totais.leads);
    if (metric === "conversoes") return String(data.totais.conversoes);
    if (metric === "investimento") return data.hasInvestmentData ? fmtMoney(data.totais.investimento) : "Dado indisponível";
    return data.totais.cpl != null ? fmtMoney(data.totais.cpl, 2) : "Dado indisponível";
  }

  return (
    <div>
      <PortalNav />
      <main className="portal-rise" style={{ padding: "32px clamp(20px, 4vw, 48px) 48px", display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Header + filtros de período */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>Evolução</h1>
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", margin: "5px 0 0" }}>Estamos melhorando?</p>
          </div>
          <div style={{ display: "flex", gap: 3, background: "var(--bg-elevated)", borderRadius: 11, padding: 3 }}>
            {PERIODS.map((p) => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                style={{
                  padding: "7px 15px", borderRadius: 8, border: "none", cursor: "pointer",
                  background: period === p.v ? "var(--bg-surface)" : "transparent",
                  color: period === p.v ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: 12.5, fontWeight: 500, boxShadow: period === p.v ? "var(--shadow-card)" : "none",
                  transition: "all 150ms",
                }}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Seletor de métrica (cards) */}
        {authChecked && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14 }}>
            {METRICS.map((m) => {
              const isActive = metric === m.v;
              let val = "—";
              if (data) {
                if (m.v === "leads") val = String(data.totais.leads);
                else if (m.v === "conversoes") val = String(data.totais.conversoes);
                else if (m.v === "investimento") val = data.hasInvestmentData ? fmtMoney(data.totais.investimento) : "Indisponível";
                else val = data.totais.cpl != null ? fmtMoney(data.totais.cpl, 2) : "Indisponível";
              }
              return (
                <button key={m.v} onClick={() => setMetric(m.v)}
                  style={{
                    textAlign: "left", cursor: "pointer",
                    background: "var(--bg-surface)",
                    border: `1px solid ${isActive ? m.color : "var(--border)"}`,
                    boxShadow: isActive ? `0 0 0 1px ${m.color}` : "var(--shadow-card)",
                    borderRadius: 14, padding: "16px 18px", transition: "all 150ms",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color }} />
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--text-secondary)" }}>{m.label}</span>
                  </div>
                  <p style={{ ...num, fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text-primary)", margin: 0 }}>{val}</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Gráfico */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "var(--shadow-card)", padding: "24px 26px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 18 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: active.color }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{active.label}</span>
            <span style={{ ...num, marginLeft: "auto", fontSize: 20, fontWeight: 700, color: "var(--text-primary)" }}>{totalLabel()}</span>
          </div>

          {loading ? (
            <div style={{ height: 240, borderRadius: 10, background: "var(--bg-elevated)", animation: "pulse 1.5s infinite" }} />
          ) : investUnavailable ? (
            <div style={{ height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-secondary)" }}>Dado indisponível</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>O investimento aparece após a sincronização dos anúncios.</p>
            </div>
          ) : chartData.length > 1 ? (
            <LineChart data={chartData} color={active.color} height={240} showDates={data?.granularity !== "month"} />
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--text-muted)", textAlign: "center", padding: "90px 0" }}>
              Ainda não há dados suficientes neste período.
            </p>
          )}

          {/* Eixo de meses (12m) — rótulos legíveis */}
          {!loading && data?.granularity === "month" && chartData.length > 1 && (
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, padding: "0 2px" }}>
              {data.series.map((s) => (
                <span key={s.date} style={{ ...num, fontSize: 10.5, color: "var(--text-muted)", textTransform: "capitalize" }}>{fmtMonthLabel(s.date)}</span>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
