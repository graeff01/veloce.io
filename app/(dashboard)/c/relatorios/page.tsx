"use client";

import { useState } from "react";
import { FileText, Download, Eye } from "lucide-react";
import { PageWrap, ClientHeader } from "@/components/client/client-ui";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function ClientReportsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());

  // Meses disponíveis: do início do ano (ou mês 1) até o mês atual, se for o ano corrente.
  const lastMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const months = Array.from({ length: lastMonth }, (_, i) => lastMonth - i); // mais recente primeiro

  const sel: React.CSSProperties = { height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" };

  return (
    <PageWrap>
      <ClientHeader
        title="Relatórios"
        subtitle="Relatórios executivos mensais"
        right={
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={sel}>
            {[0, 1, 2].map((d) => { const y = now.getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
          </select>
        }
      />

      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {months.map((m, i) => {
          const url = `/api/client/report?year=${year}&month=${m}`;
          return (
            <div key={m} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: i < months.length - 1 ? "1px solid var(--border)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText size={18} style={{ color: "var(--text-muted)" }} />
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Relatório Executivo</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>{MONTHS[m - 1]} de {year}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={url} target="_blank" rel="noopener noreferrer" style={btn(false)}>
                  <Eye size={13} /> Visualizar
                </a>
                <a href={`${url}&download=1`} download style={btn(true)}>
                  <Download size={13} /> Baixar PDF
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </PageWrap>
  );
}

function btn(primary: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 14px", borderRadius: 8,
    border: primary ? "none" : "1px solid var(--border-strong)",
    background: primary ? "var(--accent)" : "var(--bg-elevated)",
    color: primary ? "#fff" : "var(--text-secondary)",
    fontSize: 12.5, fontWeight: 600, textDecoration: "none",
  };
}
