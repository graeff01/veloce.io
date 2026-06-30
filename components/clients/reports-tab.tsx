"use client";

import { useState } from "react";
import { FileText, Printer, ArrowUpRight, MessageCircle, Megaphone, BarChart3 } from "lucide-react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const select: React.CSSProperties = {
  height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid var(--border)",
  background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
};

interface ChannelReport {
  key: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  href: (clientId: string, year: number, month: number) => string;
  module?: string; // só aparece se o cliente tiver o módulo
}

const CHANNEL_REPORTS: ChannelReport[] = [
  {
    key: "whatsapp",
    label: "Diagnóstico de atendimento",
    desc: "Velocidade de resposta lead a lead e auditoria do que ficou sem retorno.",
    icon: <MessageCircle size={16} />,
    module: "leads",
    href: (id, y, m) => `/api/clients/${id}/whatsapp/attendance-report?year=${y}&month=${m}`,
  },
  {
    key: "ads",
    label: "Performance de anúncios",
    desc: "Investimento, CPL real e desempenho por campanha e criativo (Meta).",
    icon: <Megaphone size={16} />,
    module: "anuncios",
    href: (id, y, m) => `/api/clients/${id}/meta/report?year=${y}&month=${m}`,
  },
  {
    key: "google",
    label: "Performance Google Ads",
    desc: "Resultado das campanhas de busca e display do Google.",
    icon: <BarChart3 size={16} />,
    module: "google",
    href: (id) => `/api/clients/${id}/google/report`,
  },
  {
    key: "executive",
    label: "Relatório executivo",
    desc: "Visão de negócio e atendimento do mês, com comparativo e funil.",
    icon: <FileText size={16} />,
    href: (id, y, m) => `/api/clients/${id}/executive-report?year=${y}&month=${m}`,
  },
];

export function ReportsTab({ clientId, modules }: { clientId: string; modules?: string[] }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const channels = CHANNEL_REPORTS.filter((c) => !c.module || (modules ? modules.includes(c.module) : true));

  return (
    <div style={{ padding: "24px 28px", maxWidth: 920 }}>
      {/* Cabeçalho + seletor de período */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", marginBottom: 3 }}>Relatórios</h2>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Gere o relatório de reunião do mês e os detalhes por canal.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={select}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={select}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* PROTAGONISTA — relatório de reunião (impresso) */}
      <a
        href={`/api/clients/${clientId}/report?year=${year}&month=${month}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block", textDecoration: "none",
          border: "1px solid var(--border-strong)", borderRadius: 14,
          background: "linear-gradient(180deg, var(--bg-surface), var(--bg-elevated))",
          padding: 22, marginBottom: 26,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: 11, background: "var(--accent, #4F46E5)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Printer size={22} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Relatório do mês</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent, #4F46E5)", background: "color-mix(in srgb, var(--accent, #4F46E5) 12%, transparent)", padding: "2px 7px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>Para imprimir</span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 12 }}>
              O documento de reunião: o <strong>gargalo do mês</strong>, o quanto ele custa, a <strong>solução</strong> e o <strong>resultado</strong> — pronto pra discutir com o cliente. As informações abaixo são o detalhe que sustenta esse relatório.
            </p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 16px", borderRadius: 9, background: "var(--accent, #4F46E5)", color: "#fff", fontSize: 13, fontWeight: 600 }}>
              <Printer size={15} /> Gerar e imprimir
            </span>
          </div>
        </div>
      </a>

      {/* SECUNDÁRIOS — detalhe por canal */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
        Detalhe por canal · sob demanda
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {channels.map((c) => (
          <a
            key={c.key}
            href={c.href(clientId, year, month)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block", textDecoration: "none",
              border: "1px solid var(--border)", borderRadius: 11, background: "var(--bg-surface)",
              padding: 15,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                {c.icon}
              </span>
              <ArrowUpRight size={15} color="var(--text-muted)" />
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>{c.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.45 }}>{c.desc}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
