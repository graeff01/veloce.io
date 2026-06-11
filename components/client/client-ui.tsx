"use client";

import React from "react";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ── Formatação ───────────────────────────────────────────────────────────────
export function fmtBRL(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
export function fmtNum(v: number | null): string {
  return v == null ? "—" : v.toLocaleString("pt-BR");
}
export function fmtPct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v)}%`;
}
export function fmtDur(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}min` : `${h}h`;
}
export function growthLabel(g: number | null): string {
  if (g == null) return "sem base anterior";
  const r = Math.round(g);
  return `${r > 0 ? "+" : ""}${r}% vs mês anterior`;
}
export function growthColor(g: number | null, lowerIsBetter = false): string {
  if (g == null || g === 0) return "var(--text-muted)";
  const good = lowerIsBetter ? g < 0 : g > 0;
  return good ? "#067647" : "#B42318";
}

// ── Componentes ──────────────────────────────────────────────────────────────
export function PeriodSelector({ year, month, onYear, onMonth }: { year: number; month: number; onYear: (y: number) => void; onMonth: (m: number) => void }) {
  const now = new Date();
  const sel: React.CSSProperties = { height: 34, borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <select value={month} onChange={(e) => onMonth(Number(e.target.value))} style={sel}>
        {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
      </select>
      <select value={year} onChange={(e) => onYear(Number(e.target.value))} style={sel}>
        {[0, 1, 2].map((d) => { const y = now.getFullYear() - d; return <option key={y} value={y}>{y}</option>; })}
      </select>
    </div>
  );
}

export function ClientHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function KpiCard({ label, value, hint, hintColor }: { label: string; value: string; hint?: string; hintColor?: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", margin: 0 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", margin: "10px 0 0", lineHeight: 1 }}>{value}</p>
      {hint && <p style={{ fontSize: 11.5, color: hintColor ?? "var(--text-muted)", margin: "8px 0 0" }}>{hint}</p>}
    </div>
  );
}

export function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 16px" }}>{title}</p>
      {children}
    </div>
  );
}

export function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const w = max > 0 ? Math.max(2, (count / max) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 9 }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)", width: 90, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 10, background: "var(--bg-elevated)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, height: 10, background: "var(--accent)", borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", width: 40, textAlign: "right" }}>{count}</span>
    </div>
  );
}

export function PageWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "28px 32px" }}>{children}</div>;
}

export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
