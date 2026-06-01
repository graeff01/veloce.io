"use client";

import { useState } from "react";
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  Plus, Filter, ChevronLeft, ChevronRight, Circle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type EntryType = "RECEITA" | "DESPESA";

interface Entry {
  id: string;
  type: EntryType;
  description: string;
  category: string;
  value: number;
  date: string;
  status: "PAGO" | "PENDENTE" | "VENCIDO";
  client?: string;
}

// ── Mock data ──────────────────────────────────────────────────────────────────

const MOCK_ENTRIES: Entry[] = [
  { id: "1", type: "RECEITA", description: "Mensalidade — Boqueirão Veículos", category: "Serviço", value: 2400, date: "2026-06-05", status: "PAGO",     client: "Boqueirão Veículos" },
  { id: "2", type: "RECEITA", description: "Mensalidade — Auxiliadora Predial", category: "Serviço", value: 4000, date: "2026-06-08", status: "PAGO",    client: "Auxiliadora Predial" },
  { id: "3", type: "RECEITA", description: "Projeto extra — Landing Page",      category: "Projeto", value: 1800, date: "2026-06-14", status: "PENDENTE", client: "Jardim do Lago" },
  { id: "4", type: "DESPESA", description: "Plataforma — Filmaker Pro",          category: "Software", value: 1000, date: "2026-06-01", status: "PAGO"   },
  { id: "5", type: "DESPESA", description: "Freelancer — Edição de vídeo",       category: "Equipe",   value: 800,  date: "2026-06-10", status: "PENDENTE" },
  { id: "6", type: "DESPESA", description: "Google Workspace",                   category: "Software", value: 120,  date: "2026-06-01", status: "PAGO"   },
  { id: "7", type: "RECEITA", description: "Mensalidade — Moinhos de Vento",     category: "Serviço", value: 3200, date: "2026-06-20", status: "PENDENTE", client: "Moinhos de Vento" },
  { id: "8", type: "DESPESA", description: "Tráfego pago — Meta Ads",            category: "Marketing", value: 500, date: "2026-06-15", status: "PENDENTE" },
];

const CATEGORIES_RECEITA = ["Serviço", "Projeto", "Consultoria", "Outro"];
const CATEGORIES_DESPESA  = ["Software", "Equipe", "Marketing", "Infra", "Outro"];

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const STATUS_CONFIG = {
  PAGO:     { label: "Pago",     color: "#16A34A", bg: "rgba(22,163,74,0.1)"  },
  PENDENTE: { label: "Pendente", color: "#D97706", bg: "rgba(217,119,6,0.1)"  },
  VENCIDO:  { label: "Vencido",  color: "#DC2626", bg: "rgba(220,38,38,0.1)"  },
};

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function FinancesContent() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [filter, setFilter] = useState<"TODOS" | EntryType>("TODOS");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<EntryType>("RECEITA");

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  }

  const entries = MOCK_ENTRIES;
  const filtered = filter === "TODOS" ? entries : entries.filter(e => e.type === filter);

  const totalReceita = entries.filter(e => e.type === "RECEITA" && e.status === "PAGO").reduce((s, e) => s + e.value, 0);
  const totalDespesa = entries.filter(e => e.type === "DESPESA" && e.status === "PAGO").reduce((s, e) => s + e.value, 0);
  const lucro        = totalReceita - totalDespesa;
  const pendReceita  = entries.filter(e => e.type === "RECEITA" && e.status === "PENDENTE").reduce((s, e) => s + e.value, 0);
  const pendDespesa  = entries.filter(e => e.type === "DESPESA" && e.status === "PENDENTE").reduce((s, e) => s + e.value, 0);
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        padding: "20px 32px 18px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>
            Finanças
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Receitas, despesas e fluxo de caixa da operação
          </p>
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={prevMonth} style={navBtn}><ChevronLeft size={14} /></button>
          <div style={{ textAlign: "center", minWidth: 150 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {MONTHS[month - 1]} {year}
            </span>
            {isCurrentMonth && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 7px", borderRadius: 20 }}>
                atual
              </span>
            )}
          </div>
          <button onClick={nextMonth} style={navBtn}><ChevronRight size={14} /></button>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn
            label="Nova receita"
            icon={<ArrowUpRight size={12} />}
            color="#16A34A"
            onClick={() => { setFormType("RECEITA"); setShowForm(true); }}
          />
          <ActionBtn
            label="Nova despesa"
            icon={<ArrowDownRight size={12} />}
            color="#DC2626"
            onClick={() => { setFormType("DESPESA"); setShowForm(true); }}
          />
        </div>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── KPI row ─────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KpiCard
            label="Receita confirmada"
            value={fmtBRL(totalReceita)}
            sub={`+${fmtBRL(pendReceita)} pendente`}
            icon={<TrendingUp size={15} color="#16A34A" />}
            iconBg="rgba(22,163,74,0.1)"
            valueColor="#16A34A"
          />
          <KpiCard
            label="Despesas pagas"
            value={fmtBRL(totalDespesa)}
            sub={`+${fmtBRL(pendDespesa)} pendente`}
            icon={<TrendingDown size={15} color="#DC2626" />}
            iconBg="rgba(220,38,38,0.1)"
            valueColor="#DC2626"
          />
          <KpiCard
            label="Lucro líquido"
            value={fmtBRL(lucro)}
            sub="receita − despesa (pago)"
            icon={<Wallet size={15} color={lucro >= 0 ? "var(--accent)" : "#DC2626"} />}
            iconBg="var(--accent-soft)"
            valueColor={lucro >= 0 ? "var(--accent)" : "#DC2626"}
          />
          <KpiCard
            label="A receber"
            value={fmtBRL(pendReceita)}
            sub={`${entries.filter(e => e.type === "RECEITA" && e.status === "PENDENTE").length} cobranças pendentes`}
            icon={<ArrowUpRight size={15} color="#D97706" />}
            iconBg="rgba(217,119,6,0.1)"
            valueColor="#D97706"
          />
        </div>

        {/* ── Main content ────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "start" }}>

          {/* LEFT — Transaction list */}
          <div>
            {/* Filter tabs */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", gap: 2, background: "var(--bg-elevated)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
                {(["TODOS", "RECEITA", "DESPESA"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "5px 14px", borderRadius: 7, border: "none",
                      background: filter === f ? "var(--bg-surface)" : "transparent",
                      color: filter === f ? "var(--text-primary)" : "var(--text-muted)",
                      fontSize: 12, fontWeight: filter === f ? 600 : 500,
                      cursor: "pointer",
                      boxShadow: filter === f ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                      transition: "all 120ms ease",
                    }}
                  >
                    {f === "TODOS" ? "Todos" : f === "RECEITA" ? "Receitas" : "Despesas"}
                  </button>
                ))}
              </div>
              <button style={{
                display: "flex", alignItems: "center", gap: 5,
                border: "1px solid var(--border)", borderRadius: 8,
                background: "var(--bg-surface)", color: "var(--text-muted)",
                padding: "6px 12px", fontSize: 12, cursor: "pointer",
              }}>
                <Filter size={11} /> Filtrar
              </button>
            </div>

            {/* Table */}
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 12, overflow: "hidden",
            }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 110px 130px 110px 100px",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)",
              }}>
                {["Descrição", "Categoria", "Valor", "Data", "Status"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {h}
                  </span>
                ))}
              </div>

              {/* Rows */}
              {filtered.length === 0 ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
                  Nenhum lançamento neste período
                </div>
              ) : (
                filtered.map((entry, i) => (
                  <EntryRow key={entry.id} entry={entry} last={i === filtered.length - 1} />
                ))
              )}

              {/* Footer sum */}
              {filtered.length > 0 && (
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 110px 130px 110px 100px",
                  padding: "10px 18px",
                  borderTop: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / 3" }}>
                    {filtered.length} lançamento{filtered.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    {fmtBRL(
                      filtered.reduce((s, e) => e.type === "RECEITA" ? s + e.value : s - e.value, 0)
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Categories receita */}
            <CategoryBreakdown
              title="Categorias de Receita"
              color="#16A34A"
              entries={entries.filter(e => e.type === "RECEITA")}
              categories={CATEGORIES_RECEITA}
            />

            {/* Categories despesa */}
            <CategoryBreakdown
              title="Categorias de Despesa"
              color="#DC2626"
              entries={entries.filter(e => e.type === "DESPESA")}
              categories={CATEGORIES_DESPESA}
            />
          </div>
        </div>
      </div>

      {/* ── New entry modal ─────────────────────────────── */}
      {showForm && (
        <NewEntryModal
          type={formType}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ── Entry Row ──────────────────────────────────────────────────────────────────

function EntryRow({ entry, last }: { entry: Entry; last: boolean }) {
  const [hover, setHover] = useState(false);
  const isReceita = entry.type === "RECEITA";
  const st = STATUS_CONFIG[entry.status];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 110px 130px 110px 100px",
        padding: "12px 18px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: hover ? "var(--bg-elevated)" : "transparent",
        transition: "background 100ms",
        alignItems: "center",
      }}
    >
      {/* Description */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{
            width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
            background: isReceita ? "#16A34A" : "#DC2626",
          }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.description}
          </p>
        </div>
        {entry.client && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 13, marginTop: 2 }}>
            {entry.client}
          </p>
        )}
      </div>

      {/* Category */}
      <span style={{
        fontSize: 11, fontWeight: 500, color: "var(--text-secondary)",
        background: "var(--bg-elevated)", padding: "2px 8px", borderRadius: 20,
        display: "inline-block", whiteSpace: "nowrap",
      }}>
        {entry.category}
      </span>

      {/* Value */}
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: isReceita ? "#16A34A" : "#DC2626",
        letterSpacing: "-0.02em",
      }}>
        {isReceita ? "+" : "−"}{fmtBRL(entry.value)}
      </span>

      {/* Date */}
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {fmtDate(entry.date)}
      </span>

      {/* Status */}
      <span style={{
        fontSize: 10, fontWeight: 600,
        color: st.color, background: st.bg,
        padding: "3px 9px", borderRadius: 20,
        display: "inline-block", whiteSpace: "nowrap",
      }}>
        {st.label}
      </span>
    </div>
  );
}

// ── Category Breakdown ─────────────────────────────────────────────────────────

function CategoryBreakdown({ title, color, entries, categories }: {
  title: string;
  color: string;
  entries: Entry[];
  categories: string[];
}) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  const byCat: Record<string, number> = {};
  for (const e of entries) {
    byCat[e.category] = (byCat[e.category] ?? 0) + e.value;
  }
  const used = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{
        padding: "11px 16px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-elevated)",
        display: "flex", alignItems: "center", gap: 7,
      }}>
        <Circle size={7} fill={color} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>
          {title}
        </span>
      </div>

      {used.length === 0 ? (
        <div style={{ padding: "20px 16px", fontSize: 12, color: "var(--text-muted)" }}>
          Sem lançamentos
        </div>
      ) : (
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {used.map(([cat, val]) => {
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
            return (
              <div key={cat}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{cat}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{pct}%</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", letterSpacing: "-0.02em" }}>{fmtBRL(val)}</span>
                  </div>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${pct}%`, background: color,
                    opacity: 0.75,
                    transition: "width 400ms ease",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── New Entry Modal ────────────────────────────────────────────────────────────

function NewEntryModal({ type, onClose }: { type: EntryType; onClose: () => void }) {
  const isReceita = type === "RECEITA";
  const categories = isReceita ? CATEGORIES_RECEITA : CATEGORIES_DESPESA;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-surface)", borderRadius: 16,
          border: "1px solid var(--border)",
          padding: "28px 28px",
          width: 440, boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: isReceita ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isReceita
              ? <ArrowUpRight size={15} color="#16A34A" />
              : <ArrowDownRight size={15} color="#DC2626" />
            }
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)" }}>
            Nova {isReceita ? "Receita" : "Despesa"}
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FormField label="Descrição">
            <input
              autoFocus
              placeholder={isReceita ? "Ex: Mensalidade — Cliente" : "Ex: Software — Plataforma X"}
              style={inputStyle}
            />
          </FormField>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Valor (R$)">
              <input type="number" placeholder="0,00" style={inputStyle} />
            </FormField>
            <FormField label="Data">
              <input type="date" style={inputStyle} defaultValue={new Date().toISOString().slice(0, 10)} />
            </FormField>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Categoria">
              <select style={inputStyle}>
                {categories.map(c => <option key={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select style={inputStyle}>
                <option value="PAGO">Pago</option>
                <option value="PENDENTE">Pendente</option>
                <option value="VENCIDO">Vencido</option>
              </select>
            </FormField>
          </div>
          {isReceita && (
            <FormField label="Cliente (opcional)">
              <input placeholder="Nome do cliente" style={inputStyle} />
            </FormField>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "8px 20px", borderRadius: 9, border: "none",
              background: isReceita ? "#16A34A" : "#DC2626",
              color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Salvar {isReceita ? "receita" : "despesa"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, iconBg, valueColor }: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; iconBg: string; valueColor: string;
}) {
  return (
    <div style={{
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderRadius: 12, padding: "16px 18px",
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 800, color: valueColor, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</p>
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, opacity: 0.7 }}>{sub}</p>
      </div>
    </div>
  );
}

function ActionBtn({ label, icon, color, onClick }: {
  label: string; icon: React.ReactNode; color: string; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 14px", borderRadius: 9,
        border: `1px solid ${color}44`,
        background: hover ? color + "18" : color + "0d",
        color, fontSize: 12, fontWeight: 600, cursor: "pointer",
        transition: "background 120ms ease",
      }}
    >
      {icon} {label}
    </button>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38, width: "100%", borderRadius: 9,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)", color: "var(--text-primary)",
  padding: "0 12px", fontSize: 13, outline: "none",
};

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--text-muted)", padding: 0,
};
