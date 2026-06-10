"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";

type Period = "7d" | "30d" | "90d";

interface SeriesPoint {
  date: string;
  leads: number;
  investimento: number;
  cpl: number;
}

interface EvolucaoData {
  period: Period;
  series: SeriesPoint[];
  totais: { leads: number; investimento: number; cpl: number };
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
];

type Metric = "leads" | "investimento" | "cpl";

const METRICS: { value: Metric; label: string; color: string; prefix: string }[] = [
  { value: "leads", label: "Leads", color: "#818CF8", prefix: "" },
  { value: "investimento", label: "Investimento", color: "#34D399", prefix: "R$" },
  { value: "cpl", label: "CPL", color: "#F59E0B", prefix: "R$" },
];

export default function EvolucaoPage() {
  const router = useRouter();
  const [period, setPeriod] = useState<Period>("30d");
  const [metric, setMetric] = useState<Metric>("leads");
  const [data, setData] = useState<EvolucaoData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    (p: Period) => {
      setLoading(true);
      fetch(`/api/portal/v1/evolucao?periodo=${p}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: EvolucaoData | null) => { if (d) setData(d); })
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    fetch("/api/portal/v1/auth/me").then((r) => { if (!r.ok) router.replace("/portal/login"); }).catch(() => router.replace("/portal/login"));
    load(period);
  }, [router, load, period]);

  const activeMetric = METRICS.find((m) => m.value === metric)!;

  return (
    <div>
      <PortalNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ marginBottom: 28, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Evolução</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Série histórica diária</p>
          </div>

          {/* Filtro de período */}
          <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3 }}>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: period === p.value ? "rgba(255,255,255,0.12)" : "transparent",
                  color: period === p.value ? "rgba(255,255,255,0.87)" : "rgba(255,255,255,0.4)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "all 150ms",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Selector de métrica */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {METRICS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              style={{
                padding: "7px 16px",
                borderRadius: 20,
                border: `1px solid ${metric === m.value ? m.color + "60" : "rgba(255,255,255,0.09)"}`,
                background: metric === m.value ? m.color + "18" : "transparent",
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

        {/* Totais */}
        {!loading && data && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 1,
              background: "rgba(255,255,255,0.07)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 20,
            }}
          >
            {METRICS.map((m) => {
              const val = data.totais[m.value];
              const formatted = m.prefix
                ? `${m.prefix}${Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : String(val);
              return (
                <div key={m.value} style={{ background: "rgba(255,255,255,0.03)", padding: "16px 20px" }}>
                  <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{m.label}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: metric === m.value ? m.color : "rgba(255,255,255,0.87)", fontVariantNumeric: "tabular-nums" }}>
                    {formatted}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Gráfico */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: "24px 20px 16px",
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
            {activeMetric.label} — {PERIODS.find((p) => p.value === period)?.label}
          </p>
          {loading ? (
            <div style={{ height: 200, borderRadius: 8, background: "rgba(255,255,255,0.05)" }} />
          ) : data && data.series.length > 1 ? (
            <LineChart
              data={data.series.map((s) => ({ date: s.date, value: s[metric] }))}
              color={activeMetric.color}
              height={200}
              showDates
            />
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "60px 0" }}>
              Sem dados no período
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
