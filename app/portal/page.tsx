"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { LineChart } from "@/components/portal/line-chart";
import { TrendingUp, TrendingDown, Users, DollarSign, Zap, Clock, MessageSquare, Activity } from "lucide-react";

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
  negociacoes: number;
  vendas: number;
}

interface DashboardData {
  kpis: Kpis;
  series: { date: string; leads: number }[];
}

function Trend({ value }: { value: number }) {
  const up = value >= 0;
  const color = up ? "#34D399" : "#F87171";
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color }}>
      <Icon size={11} />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function Kpi({
  label,
  value,
  growth,
  icon: Icon,
  sub,
  loading,
}: {
  label: string;
  value: string;
  growth?: number;
  icon: React.ElementType;
  sub?: string;
  loading: boolean;
}) {
  return (
    <div
      style={{
        padding: "20px 22px",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <Icon size={13} style={{ color: "rgba(255,255,255,0.35)" }} />
        <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
          {label}
        </p>
      </div>
      {loading ? (
        <div style={{ height: 28, width: 80, borderRadius: 6, background: "rgba(255,255,255,0.08)", animation: "pulse 1.5s infinite" }} />
      ) : (
        <>
          <p style={{ fontSize: 26, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {value}
          </p>
          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
            {growth !== undefined && <Trend value={growth} />}
            {sub && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{sub}</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function PortalDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar auth
    fetch("/api/portal/v1/auth/me")
      .then((r) => { if (!r.ok) router.replace("/portal/login"); })
      .catch(() => router.replace("/portal/login"));

    // Carregar dados
    fetch("/api/portal/v1/dashboard")
      .then((r) => r.ok ? r.json() : null)
      .then((d: DashboardData | null) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [router]);

  const k = data?.kpis;

  return (
    <div>
      <PortalNav />

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
            Visão Geral
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>
            Últimos 30 dias
          </p>
        </div>

        {/* KPIs */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <Kpi
            label="Leads"
            value={loading ? "—" : String(k?.leadsTotal ?? 0)}
            growth={k?.leadsGrowth}
            icon={Users}
            sub={`${k?.leads7d ?? 0} esta semana`}
            loading={loading}
          />
          <Kpi
            label="Investimento"
            value={loading ? "—" : `R$${(k?.investment ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
            growth={k?.investmentGrowth}
            icon={DollarSign}
            loading={loading}
          />
          <Kpi
            label="CPL"
            value={loading ? "—" : `R$${(k?.cpl ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            growth={k?.cplGrowth !== undefined ? -k.cplGrowth : undefined}
            icon={Zap}
            sub="custo por lead"
            loading={loading}
          />
          <Kpi
            label="Atendimento"
            value={loading ? "—" : `${k?.taxaAtendimento ?? 0}%`}
            icon={MessageSquare}
            sub={`~${k?.avgResponseMin ?? 0}m de resposta`}
            loading={loading}
          />
          <Kpi
            label="Negociações"
            value={loading ? "—" : String(k?.negociacoes ?? 0)}
            icon={Activity}
            loading={loading}
          />
          <Kpi
            label="Conversões"
            value={loading ? "—" : String(k?.vendas ?? 0)}
            icon={Clock}
            loading={loading}
          />
        </div>

        {/* Gráfico de leads */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: "24px 24px 16px",
          }}
        >
          <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.6)", marginBottom: 16 }}>
            Leads por dia — 30 dias
          </p>
          {loading ? (
            <div style={{ height: 140, borderRadius: 8, background: "rgba(255,255,255,0.05)", animation: "pulse 1.5s infinite" }} />
          ) : data && data.series.length > 1 ? (
            <LineChart
              data={data.series.map((s) => ({ date: s.date, value: s.leads }))}
              color="#818CF8"
              height={140}
              showDates
            />
          ) : (
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "40px 0" }}>
              Sem dados disponíveis
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
