"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";
import { BarChart } from "@/components/portal/bar-chart";

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

export default function OrigemPage() {
  const router = useRouter();
  const [data, setData] = useState<OrigemData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me").then((r) => { if (!r.ok) router.replace("/portal/login"); }).catch(() => router.replace("/portal/login"));
    fetch("/api/portal/v1/origem")
      .then((r) => r.ok ? r.json() : null)
      .then((d: OrigemData | null) => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <div>
      <PortalNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Origem dos Leads</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Últimos 30 dias</p>
        </div>

        {loading ? (
          <div style={{ height: 300, borderRadius: 16, background: "rgba(255,255,255,0.04)" }} />
        ) : !data || data.total === 0 ? (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", textAlign: "center", padding: "64px 0" }}>
            Sem dados de origem no período
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
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
                Volume de leads por origem
              </p>
              <BarChart
                data={data.origens.filter((o) => o.leads > 0).map((o) => ({
                  label: o.label,
                  value: o.leads,
                  color: o.color,
                }))}
                height={200}
              />
            </div>

            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.origens.map((o) => (
                <div
                  key={o.label}
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 14,
                    padding: "18px 20px",
                    borderLeft: `3px solid ${o.color}`,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "rgba(255,255,255,0.87)" }}>{o.label}</p>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: o.color,
                        background: o.color + "22",
                        padding: "2px 8px",
                        borderRadius: 20,
                      }}
                    >
                      {o.percent}%
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      { l: "Leads", v: String(o.leads) },
                      { l: "Investimento", v: o.investimento > 0 ? `R$${o.investimento.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}` : "—" },
                      { l: "CPL", v: o.cpl > 0 ? `R$${o.cpl.toFixed(2)}` : "—" },
                    ].map((item) => (
                      <div key={item.l}>
                        <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 2 }}>{item.l}</p>
                        <p style={{ fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.87)", fontVariantNumeric: "tabular-nums" }}>{item.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
