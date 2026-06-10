"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { BarChart } from "@/components/portal/bar-chart";

interface AtendimentoData {
  kpis: {
    total: number;
    respondidos: number;
    pendentes: number;
    taxaResposta: number;
    avgResponseMin: number;
  };
  distribuicao: { ate5m: number; ate30m: number; ate1h: number; mais1h: number };
  series: { date: string; respondidos: number; total: number }[];
}

export default function AtendimentoPage() {
  const router = useRouter();
  const [data, setData] = useState<AtendimentoData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me").then((r) => { if (!r.ok) router.replace("/portal/login"); }).catch(() => router.replace("/portal/login"));
    fetch("/api/portal/v1/atendimento")
      .then((r) => r.ok ? r.json() : null)
      .then((d: AtendimentoData | null) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [router]);

  const k = data?.kpis;

  return (
    <div>
      <PortalNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Atendimento</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Últimos 30 dias</p>
        </div>

        {/* KPIs */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 1,
            background: "rgba(255,255,255,0.07)",
            borderRadius: 14,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          {[
            { label: "Leads recebidos", value: loading ? "—" : String(k?.total ?? 0) },
            { label: "Respondidos", value: loading ? "—" : String(k?.respondidos ?? 0), color: "#34D399" },
            { label: "Pendentes", value: loading ? "—" : String(k?.pendentes ?? 0), color: k?.pendentes ? "#F87171" : undefined },
            { label: "Taxa de resposta", value: loading ? "—" : `${k?.taxaResposta ?? 0}%` },
            { label: "Tempo médio", value: loading ? "—" : `${k?.avgResponseMin ?? 0}m` },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", padding: "18px 20px" }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6 }}>{item.label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: item.color ?? "rgba(255,255,255,0.92)", fontVariantNumeric: "tabular-nums" }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Distribuição por faixa de tempo */}
        {!loading && data && (
          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 16,
              padding: "24px 20px 16px",
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
              Distribuição do tempo de 1ª resposta
            </p>
            <BarChart
              data={[
                { label: "≤ 5 min", value: data.distribuicao.ate5m, color: "#34D399" },
                { label: "≤ 30 min", value: data.distribuicao.ate30m, color: "#818CF8" },
                { label: "≤ 1h", value: data.distribuicao.ate1h, color: "#F59E0B" },
                { label: "> 1h", value: data.distribuicao.mais1h, color: "#F87171" },
              ]}
              height={180}
            />
          </div>
        )}
      </main>
    </div>
  );
}
