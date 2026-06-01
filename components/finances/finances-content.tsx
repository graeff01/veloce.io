"use client";

import { useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  Plus, ChevronLeft, ChevronRight, Circle, X, RefreshCw, Zap,
  Loader2, Repeat,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type EntryType = "RECEITA" | "DESPESA";
type EntryMode = "RECORRENTE" | "AVULSO";

interface Entry {
  id: string;
  type: EntryType;
  mode: EntryMode;
  description: string;
  category: string;
  value: number;
  date: string;
  status: "PAGO" | "PENDENTE" | "VENCIDO";
  client?: string;
}

// HR person synced from /hr page via localStorage
interface HrPerson {
  id: string;
  type: "FUNCIONARIO" | "PRESTADOR";
  name: string;
  role: string;
  salary: number;
  status: "ATIVO" | "INATIVO";
}

function loadHrPeople(): HrPerson[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("veloce-hr-people") ?? "[]") as HrPerson[]; } catch { return []; }
}

const CATEGORIES_RECEITA = ["Mensalidade", "Projeto", "Consultoria", "Bônus", "Outro"];

// Despesas organizadas por grupo semântico
const EXPENSE_GROUPS: { group: string; color: string; categories: string[] }[] = [
  { group: "Assinaturas & Software",  color: "#7C3AED", categories: ["SaaS / Plataforma", "Ferramenta de gestão", "Hospedagem", "Domínio", "Cloud / Infra"] },
  { group: "Equipe",                  color: "#2563EB", categories: ["Salário CLT", "Pagamento PJ", "Freelancer", "Benefícios", "Treinamento"] },
  { group: "Operação & Marketing",    color: "#D97706", categories: ["Tráfego pago", "Criativo externo", "Impressão / Material", "Evento"] },
  { group: "Financeiro & Admin",      color: "#DC2626", categories: ["Imposto / Taxa", "Contador", "Jurídico", "Banco / Cartão"] },
  { group: "Outro",                   color: "#64748B", categories: ["Outro"] },
];

const CATEGORIES_DESPESA = EXPENSE_GROUPS.flatMap(g => g.categories);

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

const STATUS_CONFIG = {
  PAGO:     { label: "Pago",     color: "#16A34A", bg: "rgba(22,163,74,0.1)"  },
  PENDENTE: { label: "Pendente", color: "#D97706", bg: "rgba(217,119,6,0.1)"  },
  VENCIDO:  { label: "Vencido",  color: "#DC2626", bg: "rgba(220,38,38,0.1)"  },
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function FinancesContent() {
  const now = new Date();
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [year,  setYear]    = useState(now.getFullYear());
  const [filter, setFilter] = useState<"TODOS" | EntryType>("TODOS");
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<EntryType>("RECEITA");
  const [entries, setEntries]   = useState<Entry[]>([]);
  const [hrPeople, setHrPeople] = useState<HrPerson[]>([]);

  // sync HR people from localStorage (re-reads when tab gains focus)
  useEffect(() => {
    function sync() { setHrPeople(loadHrPeople()); }
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("focus", sync); window.removeEventListener("storage", sync); };
  }, []);

  // HR entries are read-only, derived from hrPeople (active only, current month)
  const hrEntries: Entry[] = hrPeople
    .filter(p => p.status === "ATIVO" && p.salary > 0)
    .map(p => ({
      id: `hr-${p.id}`,
      type: "DESPESA" as const,
      mode: "RECORRENTE" as const,
      description: p.name,
      category: p.type === "FUNCIONARIO" ? "Salário CLT" : "Pagamento PJ",
      value: p.salary,
      date: `${year}-${String(month).padStart(2, "0")}-05`,
      status: "PENDENTE" as const,
      client: p.role || undefined,
    }));

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1);
  }

  // all entries = manual + auto-generated from HR
  const allEntries = [...entries, ...hrEntries];

  const filtered = (filter === "TODOS" ? allEntries : allEntries.filter(e => e.type === filter));

  const totalReceita = allEntries.filter(e => e.type === "RECEITA" && e.status === "PAGO").reduce((s, e) => s + e.value, 0);
  const totalDespesa = allEntries.filter(e => e.type === "DESPESA" && e.status === "PAGO").reduce((s, e) => s + e.value, 0);
  const lucro        = totalReceita - totalDespesa;
  const pendReceita  = allEntries.filter(e => e.type === "RECEITA" && e.status === "PENDENTE").reduce((s, e) => s + e.value, 0);
  const pendDespesa  = allEntries.filter(e => e.type === "DESPESA" && e.status === "PENDENTE").reduce((s, e) => s + e.value, 0);
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  function handleSave(entry: Omit<Entry, "id">) {
    setEntries(prev => [{ ...entry, id: crypto.randomUUID() }, ...prev]);
  }

  function handleDelete(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

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
            </div>

            {/* Table */}
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 100px 80px 130px 110px 80px",
                padding: "10px 18px",
                borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)",
              }}>
                {["Descrição", "Tipo", "Modo", "Valor", "Data", "Status"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                    {h}
                  </span>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ padding: "52px 0", textAlign: "center" }}>
                  <Wallet size={28} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 10px", display: "block" }} />
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum lançamento neste período</p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, opacity: 0.7 }}>
                    Use os botões acima para registrar receitas ou despesas
                  </p>
                </div>
              ) : (
                filtered.map((entry, i) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    last={i === filtered.length - 1}
                    onDelete={entry.id.startsWith("hr-") ? undefined : handleDelete}
                    isHr={entry.id.startsWith("hr-")}
                  />
                ))
              )}

              {filtered.length > 0 && (
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 100px 80px 130px 110px 80px",
                  padding: "10px 18px",
                  borderTop: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / 4" }}>
                    {filtered.length} lançamento{filtered.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    {fmtBRL(filtered.reduce((s, e) => e.type === "RECEITA" ? s + e.value : s - e.value, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CategoryBreakdown
              title="Categorias de Receita"
              color="#16A34A"
              entries={allEntries.filter(e => e.type === "RECEITA")}
            />
            <CategoryBreakdown
              title="Categorias de Despesa"
              color="#DC2626"
              entries={allEntries.filter(e => e.type === "DESPESA")}
            />
            {/* Recorrentes summary */}
            <RecurrenteSummary entries={allEntries} />
            {/* HR notice */}
            {hrPeople.filter(p => p.status === "ATIVO").length > 0 && (
              <div style={{
                padding: "10px 14px", borderRadius: 9,
                background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)",
                fontSize: 11, color: "#2563EB",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontWeight: 700 }}>Equipe:</span>
                {hrPeople.filter(p => p.status === "ATIVO").length} pessoa(s) importada(s) do RH automaticamente.
                As despesas de equipe são geradas a cada mês.
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <NewEntryModal
          type={formType}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Entry Row ──────────────────────────────────────────────────────────────────

function EntryRow({ entry, last, onDelete, isHr }: {
  entry: Entry; last: boolean;
  onDelete?: (id: string) => void;
  isHr?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const isReceita = entry.type === "RECEITA";
  const st = STATUS_CONFIG[entry.status];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 100px 80px 130px 110px 80px",
        padding: "11px 18px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: isHr ? "rgba(37,99,235,0.03)" : hover ? "var(--bg-elevated)" : "transparent",
        borderLeft: isHr ? "2px solid rgba(37,99,235,0.3)" : "2px solid transparent",
        transition: "background 100ms",
        alignItems: "center",
      }}
    >
      {/* Description */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: isReceita ? "#16A34A" : "#DC2626" }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.description}
          </p>
          {isHr && (
            <span style={{ fontSize: 9, fontWeight: 700, color: "#2563EB", background: "rgba(37,99,235,0.1)", padding: "1px 5px", borderRadius: 4, letterSpacing: "0.04em", flexShrink: 0 }}>
              RH
            </span>
          )}
        </div>
        {entry.client && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 13, marginTop: 2 }}>{entry.client}</p>
        )}
      </div>

      {/* Category */}
      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-secondary)", background: "var(--bg-elevated)", padding: "2px 8px", borderRadius: 20, display: "inline-block", whiteSpace: "nowrap" }}>
        {entry.category}
      </span>

      {/* Mode */}
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: entry.mode === "RECORRENTE" ? "var(--accent)" : "var(--text-muted)", fontWeight: 500 }}>
        {entry.mode === "RECORRENTE" ? <Repeat size={9} /> : <Zap size={9} />}
        {entry.mode === "RECORRENTE" ? "Recorr." : "Avulso"}
      </span>

      {/* Value */}
      <span style={{ fontSize: 13, fontWeight: 700, color: isReceita ? "#16A34A" : "#DC2626", letterSpacing: "-0.02em" }}>
        {isReceita ? "+" : "−"}{fmtBRL(entry.value)}
      </span>

      {/* Date */}
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{fmtDate(entry.date)}</span>

      {/* Status + delete */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "3px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
          {st.label}
        </span>
        {hover && !isHr && onDelete && (
          <button
            onClick={() => onDelete(entry.id)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex", alignItems: "center" }}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Category Breakdown ─────────────────────────────────────────────────────────

function CategoryBreakdown({ title, color, entries }: {
  title: string; color: string; entries: Entry[];
}) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  const byCat: Record<string, number> = {};
  for (const e of entries) byCat[e.category] = (byCat[e.category] ?? 0) + e.value;
  const used = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", gap: 7 }}>
        <Circle size={7} fill={color} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "0.02em" }}>{title}</span>
      </div>
      {used.length === 0 ? (
        <div style={{ padding: "18px 16px", fontSize: 12, color: "var(--text-muted)" }}>Sem lançamentos</div>
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
                  <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color, opacity: 0.75, transition: "width 400ms ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Recorrentes Summary ────────────────────────────────────────────────────────

function RecurrenteSummary({ entries }: { entries: Entry[] }) {
  const recorrentes = entries.filter(e => e.mode === "RECORRENTE");
  const totalRec = recorrentes.filter(e => e.type === "RECEITA").reduce((s, e) => s + e.value, 0);
  const totalDes = recorrentes.filter(e => e.type === "DESPESA").reduce((s, e) => s + e.value, 0);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", gap: 7 }}>
        <RefreshCw size={11} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>Recorrências</span>
      </div>
      {recorrentes.length === 0 ? (
        <div style={{ padding: "18px 16px", fontSize: 12, color: "var(--text-muted)" }}>Nenhum lançamento recorrente</div>
      ) : (
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Receitas recorrentes</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#16A34A" }}>{fmtBRL(totalRec)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Despesas recorrentes</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626" }}>{fmtBRL(totalDes)}</span>
          </div>
          <div style={{ height: 1, background: "var(--border)", margin: "2px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{recorrentes.length} lançamento{recorrentes.length !== 1 ? "s" : ""}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: totalRec - totalDes >= 0 ? "#16A34A" : "#DC2626" }}>
              {fmtBRL(totalRec - totalDes)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── New Entry Modal ────────────────────────────────────────────────────────────

function NewEntryModal({ type, onClose, onSave }: {
  type: EntryType;
  onClose: () => void;
  onSave: (entry: Omit<Entry, "id">) => void;
}) {
  const isReceita = type === "RECEITA";
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState(isReceita ? CATEGORIES_RECEITA[0] : EXPENSE_GROUPS[0].categories[0]);
  const [status, setStatus] = useState<Entry["status"]>("PENDENTE");
  const [mode, setMode] = useState<EntryMode>("AVULSO");
  const [client, setClient] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !value) return;
    setSaving(true);
    onSave({
      type,
      mode,
      description: description.trim(),
      category,
      value: parseFloat(value),
      date,
      status,
      client: client.trim() || undefined,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)", padding: "26px 28px", width: 460, boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: isReceita ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isReceita ? <ArrowUpRight size={15} color="#16A34A" /> : <ArrowDownRight size={15} color="#DC2626" />}
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
              Nova {isReceita ? "Receita" : "Despesa"}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", gap: 0, background: "var(--bg-elevated)", borderRadius: 9, padding: 3, border: "1px solid var(--border)", marginBottom: 18 }}>
          {(["RECORRENTE", "AVULSO"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 7, border: "none",
                background: mode === m ? "var(--bg-surface)" : "transparent",
                color: mode === m ? "var(--text-primary)" : "var(--text-muted)",
                fontSize: 12, fontWeight: mode === m ? 600 : 500,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                boxShadow: mode === m ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 120ms ease",
              }}
            >
              {m === "RECORRENTE" ? <RefreshCw size={11} /> : <Zap size={11} />}
              {m === "RECORRENTE" ? "Recorrente" : "Avulso"}
            </button>
          ))}
        </div>

        {mode === "RECORRENTE" && (
          <div style={{ padding: "9px 12px", background: "var(--accent-soft)", borderRadius: 8, border: "1px solid var(--accent)", marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: "var(--accent)", margin: 0, fontWeight: 500 }}>
              Lançamento recorrente será registrado mensalmente a partir desta data.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FormField label="Descrição">
            <input
              autoFocus
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              placeholder={isReceita ? "Ex: Mensalidade — Cliente X" : "Ex: Plataforma de agendamento"}
              style={inputStyle}
            />
          </FormField>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Valor (R$)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={value}
                onChange={e => setValue(e.target.value)}
                required
                placeholder="0,00"
                style={inputStyle}
              />
            </FormField>
            <FormField label="Data">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
                style={inputStyle}
              />
            </FormField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Categoria">
              {isReceita ? (
                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                  {CATEGORIES_RECEITA.map(c => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
                  {EXPENSE_GROUPS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.categories.map(c => <option key={c}>{c}</option>)}
                    </optgroup>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Status">
              <select value={status} onChange={e => setStatus(e.target.value as Entry["status"])} style={inputStyle}>
                <option value="PAGO">Pago</option>
                <option value="PENDENTE">Pendente</option>
                <option value="VENCIDO">Vencido</option>
              </select>
            </FormField>
          </div>

          {isReceita && (
            <FormField label="Cliente (opcional)">
              <input
                value={client}
                onChange={e => setClient(e.target.value)}
                placeholder="Nome do cliente"
                style={inputStyle}
              />
            </FormField>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: isReceita ? "#16A34A" : "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              {saving && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
              Salvar {isReceita ? "receita" : "despesa"}
            </button>
          </div>
        </form>
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
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
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
  boxSizing: "border-box",
};

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  border: "1px solid var(--border)", background: "var(--bg-surface)",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", color: "var(--text-muted)", padding: 0,
};
