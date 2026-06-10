"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PortalNav } from "@/components/portal/portal-nav";

interface Campanha {
  id: string;
  name: string;
  status: string;
  leads: number;
  investimento: number;
  cpl: number;
}

function statusDot(status: string) {
  const color = status === "ACTIVE" ? "#34D399" : status === "PAUSED" ? "#F59E0B" : "rgba(255,255,255,0.25)";
  return <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />;
}

export default function CampanhasPage() {
  const router = useRouter();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/portal/v1/auth/me").then((r) => { if (!r.ok) router.replace("/portal/login"); }).catch(() => router.replace("/portal/login"));
    fetch("/api/portal/v1/campanhas")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { campanhas: Campanha[] } | null) => { if (d) setCampanhas(d.campanhas); })
      .finally(() => setLoading(false));
  }, [router]);

  const totalLeads = campanhas.reduce((s, c) => s + c.leads, 0);
  const totalSpend = campanhas.reduce((s, c) => s + c.investimento, 0);

  return (
    <div>
      <PortalNav />
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px 64px" }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>Campanhas</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 3 }}>Últimos 30 dias · Meta Ads</p>
        </div>

        {/* Totais */}
        {!loading && campanhas.length > 0 && (
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
            {[
              { label: "Campanhas ativas", value: String(campanhas.filter((c) => c.status === "ACTIVE").length) },
              { label: "Total de leads", value: String(totalLeads) },
              { label: "Investimento total", value: `R$${totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` },
            ].map((item) => (
              <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", padding: "16px 20px" }}>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>{item.label}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: "rgba(255,255,255,0.92)", fontVariantNumeric: "tabular-nums" }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabela */}
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 80px 120px 100px",
              padding: "10px 20px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {["Campanha", "Leads", "Investimento", "CPL"].map((h) => (
              <p key={h} style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</p>
            ))}
          </div>

          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)", display: "grid", gridTemplateColumns: "1fr 80px 120px 100px", gap: 8 }}>
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} style={{ height: 14, borderRadius: 4, background: "rgba(255,255,255,0.06)", width: j === 0 ? "70%" : "60%" }} />
                ))}
              </div>
            ))
          ) : campanhas.length === 0 ? (
            <p style={{ padding: "48px 20px", textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.25)" }}>
              Nenhuma campanha encontrada no período
            </p>
          ) : (
            campanhas.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 120px 100px",
                  padding: "14px 20px",
                  borderBottom: i < campanhas.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  {statusDot(c.status)}
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.82)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</p>
                </div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.87)", fontVariantNumeric: "tabular-nums" }}>{c.leads}</p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>
                  R${c.investimento.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontVariantNumeric: "tabular-nums" }}>
                  R${c.cpl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
