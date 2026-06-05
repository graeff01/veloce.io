"use client";

import { useCallback, useEffect, useState } from "react";
import {
  TrendingUp, TrendingDown, Wallet, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight, Circle, X, RefreshCw, Zap,
  Loader2, Repeat, Users,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type EntryType = "RECEITA" | "DESPESA";
type EntryMode = "RECORRENTE" | "AVULSO";

interface Client { id: string; name: string; brand?: string | null; }

interface Entry {
  id: string;
  type: EntryType;
  mode: EntryMode;
  description: string;
  category: string;
  value: number;
  date: string;
  status: "PAGO" | "PENDENTE" | "VENCIDO";
  clientId?: string | null;
  client?: Client | null;
  notes?: string | null;
}

interface TeamMember {
  id: string;
  type: "FUNCIONARIO" | "PRESTADOR";
  name: string;
  role: string;
  salary: number;
  unitValue?: number | null;
  unit?: string | null;
  status: "ATIVO" | "INATIVO";
}

const CATEGORIES_RECEITA = ["Mensalidade", "Projeto", "Consultoria", "Bônus", "Outro"];

const EXPENSE_GROUPS: { group: string; color: string; categories: string[] }[] = [
  { group: "Assinaturas & Software",  color: "#7C3AED", categories: ["SaaS / Plataforma", "Ferramenta de gestão", "Hospedagem", "Domínio", "Cloud / Infra"] },
  { group: "Equipe",                  color: "#2563EB", categories: ["Salário CLT", "Pagamento PJ", "Freelancer", "Benefícios", "Treinamento"] },
  { group: "Operação & Marketing",    color: "#D97706", categories: ["Tráfego pago", "Criativo externo", "Impressão / Material", "Evento"] },
  { group: "Financeiro & Admin",      color: "#DC2626", categories: ["Imposto / Taxa", "Contador", "Jurídico", "Banco / Cartão"] },
  { group: "Outro",                   color: "#64748B", categories: ["Outro"] },
];

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
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function FinancesContent() {
  const now = new Date();
  const [month, setMonth]   = useState(now.getMonth() + 1);
  const [year,  setYear]    = useState(now.getFullYear());
  const [filter, setFilter] = useState<"TODOS" | EntryType>("TODOS");
  const [showForm, setShowForm]   = useState(false);
  const [formType, setFormType]   = useState<EntryType>("RECEITA");
  const [entries, setEntries]     = useState<Entry[]>([]);
  const [recorrentes, setRecorrentes] = useState<Entry[]>([]);
  const [team, setTeam]           = useState<TeamMember[]>([]);
  const [clients, setClients]     = useState<Client[]>([]);
  const [loading, setLoading]     = useState(true);
  // per-month status for recurring/team entries: { refKey: status }
  const [statusOverrides, setStatusOverrides] = useState<Record<string, Entry["status"]>>({});
  // qty for variable contractors this month: { teamMemberId: qty }
  const [hrQty, setHrQty]         = useState<Record<string, number>>({});
  const LS_QTY = `veloce-hr-qty-${year}-${month}`;

  // persist hrQty per month in localStorage (lightweight — just numbers)
  useEffect(() => { localStorage.setItem(LS_QTY, JSON.stringify(hrQty)); }, [hrQty, LS_QTY]);
  useEffect(() => {
    try { setHrQty(JSON.parse(localStorage.getItem(LS_QTY) ?? "{}")); } catch { setHrQty({}); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const load = useCallback(async () => {
    setLoading(true);
    const [avulsoRes, recRes, teamRes, clientsRes, statusRes] = await Promise.all([
      fetch(`/api/finance?mode=AVULSO&month=${month}&year=${year}`),
      fetch(`/api/finance?mode=RECORRENTE`),
      fetch(`/api/team`),
      fetch(`/api/clients`),
      fetch(`/api/finance/status?month=${month}&year=${year}`),
    ]);
    if (avulsoRes.ok) setEntries(await avulsoRes.json());
    if (recRes.ok)    setRecorrentes(await recRes.json());
    if (teamRes.ok)   setTeam(await teamRes.json());
    if (clientsRes.ok) {
      const data = await clientsRes.json();
      setClients(Array.isArray(data) ? data : (data.clients ?? []));
    }
    if (statusRes.ok) setStatusOverrides(await statusRes.json());
    setLoading(false);
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  // Team entries derived from TeamMembers
  const teamEntries: Entry[] = team
    .filter(p => p.status === "ATIVO")
    .flatMap((p): Entry[] => {
      const key = p.id;
      if (p.type === "PRESTADOR" && p.unitValue) {
        const qty = hrQty[key] ?? 0;
        if (qty === 0) return [];
        return [{
          id: `team-${p.id}`,
          type: "DESPESA", mode: "AVULSO",
          description: p.name,
          category: "Pagamento PJ",
          value: qty * p.unitValue,
          date: `${monthPrefix}-05`,
          status: statusOverrides[`team-${p.id}`] ?? "PENDENTE",
          client: null,
          notes: `${qty}× ${p.unit || "entrega"} · ${p.role || ""}`.trim(),
        }];
      }
      if (p.salary > 0) {
        return [{
          id: `team-${p.id}`,
          type: "DESPESA", mode: "RECORRENTE",
          description: p.name,
          category: p.type === "FUNCIONARIO" ? "Salário CLT" : "Pagamento PJ",
          value: p.salary,
          date: `${monthPrefix}-05`,
          status: statusOverrides[`team-${p.id}`] ?? "PENDENTE",
          client: null,
          notes: p.role || null,
        }];
      }
      return [];
    });

  // Recorrentes stamped with current month date + per-month status
  const recorrentesThisMonth: Entry[] = recorrentes.map(r => ({
    ...r,
    id: `rec-${r.id}`,
    date: `${monthPrefix}-01`,
    status: statusOverrides[`rec-${r.id}`] ?? r.status,
  }));

  const allEntries = [...entries, ...recorrentesThisMonth, ...teamEntries];
  const filtered   = filter === "TODOS" ? allEntries : allEntries.filter(e => e.type === filter);

  const totalReceita = allEntries.filter(e => e.type === "RECEITA" && e.status === "PAGO").reduce((s, e) => s + e.value, 0);
  const totalDespesa = allEntries.filter(e => e.type === "DESPESA" && e.status === "PAGO").reduce((s, e) => s + e.value, 0);
  const lucro        = totalReceita - totalDespesa;
  const pendReceita  = allEntries.filter(e => e.type === "RECEITA" && e.status === "PENDENTE").reduce((s, e) => s + e.value, 0);
  const pendDespesa  = allEntries.filter(e => e.type === "DESPESA" && e.status === "PENDENTE").reduce((s, e) => s + e.value, 0);

  // Lucratividade por cliente
  const byClient: Record<string, { name: string; receita: number; despesa: number }> = {};
  for (const e of allEntries) {
    if (!e.clientId || !e.client) continue;
    const cid = e.clientId;
    if (!byClient[cid]) byClient[cid] = { name: e.client.brand || e.client.name, receita: 0, despesa: 0 };
    if (e.type === "RECEITA") byClient[cid].receita += e.value;
    else byClient[cid].despesa += e.value;
  }
  const clientProfitability = Object.entries(byClient)
    .map(([id, d]) => ({ id, ...d, lucro: d.receita - d.despesa }))
    .sort((a, b) => b.lucro - a.lucro);

  async function handleSave(data: {
    type: EntryType; mode: EntryMode; description: string; category: string;
    value: number; date: string; status: Entry["status"]; clientId?: string | null; notes?: string;
  }) {
    await fetch("/api/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
  }

  async function handleDelete(id: string) {
    if (id.startsWith("rec-") || id.startsWith("team-")) return; // rec: delete original; team: managed via /hr
    await fetch(`/api/finance/${id}`, { method: "DELETE" });
    load();
  }

  async function handleDeleteRec(id: string) {
    const origId = id.replace(/^rec-/, "");
    await fetch(`/api/finance/${origId}`, { method: "DELETE" });
    load();
  }

  async function handleStatusChange(id: string, status: Entry["status"]) {
    // Recorrentes e equipe: status por mês (não muda os outros meses)
    if (id.startsWith("rec-") || id.startsWith("team-")) {
      setStatusOverrides(prev => ({ ...prev, [id]: status })); // otimista
      await fetch(`/api/finance/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refKey: id, year, month, status }),
      });
      load();
      return;
    }
    // Avulsos: status no próprio lançamento
    await fetch(`/api/finance/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Loader2 size={22} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        padding: "20px 32px 18px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.03em", lineHeight: 1 }}>Finanças</h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>Receitas, despesas e lucratividade</p>
        </div>

        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={prevMonth} style={navBtn}><ChevronLeft size={14} /></button>
          <div style={{ textAlign: "center", minWidth: 150 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>{MONTHS[month - 1]} {year}</span>
            {isCurrentMonth && (
              <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: "var(--accent)", background: "var(--accent-soft)", padding: "2px 7px", borderRadius: 20 }}>atual</span>
            )}
          </div>
          <button onClick={nextMonth} style={navBtn}><ChevronRight size={14} /></button>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8 }}>
          <ActionBtn label="Nova receita"  icon={<ArrowUpRight size={12} />}  color="#16A34A" onClick={() => { setFormType("RECEITA");  setShowForm(true); }} />
          <ActionBtn label="Nova despesa"  icon={<ArrowDownRight size={12} />} color="#DC2626" onClick={() => { setFormType("DESPESA"); setShowForm(true); }} />
        </div>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── KPIs ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KpiCard label="Receita confirmada" value={fmtBRL(totalReceita)} sub={`+${fmtBRL(pendReceita)} pendente`}   icon={<TrendingUp size={15} color="#16A34A" />}                                    iconBg="rgba(22,163,74,0.1)"   valueColor="#16A34A" />
          <KpiCard label="Despesas pagas"     value={fmtBRL(totalDespesa)} sub={`+${fmtBRL(pendDespesa)} pendente`}  icon={<TrendingDown size={15} color="#DC2626" />}                                   iconBg="rgba(220,38,38,0.1)"   valueColor="#DC2626" />
          <KpiCard label="Lucro líquido"      value={fmtBRL(lucro)}        sub="receita − despesa (pago)"            icon={<Wallet size={15} color={lucro >= 0 ? "var(--accent)" : "#DC2626"} />}       iconBg="var(--accent-soft)"    valueColor={lucro >= 0 ? "var(--accent)" : "#DC2626"} />
          <KpiCard label="A receber"          value={fmtBRL(pendReceita)}  sub={`${allEntries.filter(e => e.type === "RECEITA" && e.status === "PENDENTE").length} pendentes`} icon={<ArrowUpRight size={15} color="#D97706" />} iconBg="rgba(217,119,6,0.1)" valueColor="#D97706" />
        </div>

        {/* ── Main content ────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, alignItems: "start" }}>

          {/* LEFT — Transactions */}
          <div>
            <div style={{ display: "flex", gap: 2, background: "var(--bg-elevated)", padding: 3, borderRadius: 9, border: "1px solid var(--border)", marginBottom: 14, width: "fit-content" }}>
              {(["TODOS", "RECEITA", "DESPESA"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: "5px 14px", borderRadius: 7, border: "none",
                  background: filter === f ? "var(--bg-surface)" : "transparent",
                  color: filter === f ? "var(--text-primary)" : "var(--text-muted)",
                  fontSize: 12, fontWeight: filter === f ? 600 : 500, cursor: "pointer",
                  boxShadow: filter === f ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 120ms ease",
                }}>
                  {f === "TODOS" ? "Todos" : f === "RECEITA" ? "Receitas" : "Despesas"}
                </button>
              ))}
            </div>

            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              {/* Table header */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 80px 120px 90px 90px", padding: "10px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                {["Descrição","Categoria","Modo","Valor","Data","Status"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</span>
                ))}
              </div>

              {filtered.length === 0 ? (
                <div style={{ padding: "52px 0", textAlign: "center" }}>
                  <Wallet size={28} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 10px", display: "block" }} />
                  <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum lançamento neste período</p>
                </div>
              ) : (
                filtered.map((entry, i) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    last={i === filtered.length - 1}
                    onDelete={entry.id.startsWith("team-") ? undefined : entry.id.startsWith("rec-") ? handleDeleteRec : handleDelete}
                    onStatusChange={entry.id.startsWith("team-") || entry.id.startsWith("rec-") ? undefined : handleStatusChange}
                    isTeam={entry.id.startsWith("team-")}
                  />
                ))
              )}

              {filtered.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 80px 120px 90px 90px", padding: "10px 18px", borderTop: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", gridColumn: "1 / 4" }}>{filtered.length} lançamento{filtered.length !== 1 ? "s" : ""}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)" }}>
                    {fmtBRL(filtered.reduce((s, e) => e.type === "RECEITA" ? s + e.value : s - e.value, 0))}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Sidebar panels */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Lucratividade por cliente */}
            {clientProfitability.length > 0 && (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", gap: 7 }}>
                  <TrendingUp size={11} style={{ color: "#16A34A" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>Lucratividade por cliente</span>
                </div>
                <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {clientProfitability.map(c => (
                    <div key={c.id}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: c.lucro >= 0 ? "#16A34A" : "#DC2626" }}>{fmtBRL(c.lucro)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, color: "#16A34A" }}>↑ {fmtBRL(c.receita)}</span>
                        <span style={{ fontSize: 10, color: "#DC2626" }}>↓ {fmtBRL(c.despesa)}</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 2, width: `${c.receita > 0 ? Math.min(100, Math.round((c.lucro / c.receita) * 100 + 50)) : 0}%`, background: c.lucro >= 0 ? "#16A34A" : "#DC2626", opacity: 0.7 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category breakdowns */}
            <CategoryBreakdown title="Receitas por categoria" color="#16A34A" entries={allEntries.filter(e => e.type === "RECEITA")} />
            <CategoryBreakdown title="Despesas por categoria" color="#DC2626" entries={allEntries.filter(e => e.type === "DESPESA")} />

            {/* Team notice */}
            {team.filter(p => p.status === "ATIVO").length > 0 && (
              <div style={{ padding: "10px 14px", borderRadius: 9, background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", fontSize: 11, color: "#2563EB", display: "flex", alignItems: "center", gap: 6 }}>
                <Users size={11} />
                <span><strong>{team.filter(p => p.status === "ATIVO").length}</strong> pessoa(s) da equipe incluídas automaticamente.</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <NewEntryModal
          type={formType}
          clients={clients}
          currentMonth={month}
          currentYear={year}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Entry Row ──────────────────────────────────────────────────────────────────

function EntryRow({ entry, last, onDelete, onStatusChange, isTeam }: {
  entry: Entry; last: boolean;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, status: Entry["status"]) => void;
  isTeam?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const isReceita = entry.type === "RECEITA";
  const st = STATUS_CONFIG[entry.status];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 110px 80px 120px 90px 90px",
        padding: "11px 18px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: isTeam ? "rgba(37,99,235,0.03)" : hover ? "var(--bg-elevated)" : "transparent",
        borderLeft: isTeam ? "2px solid rgba(37,99,235,0.3)" : "2px solid transparent",
        transition: "background 100ms", alignItems: "center",
      }}
    >
      {/* Description */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: isReceita ? "#16A34A" : "#DC2626" }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", margin: 0 }}>{entry.description}</p>
          {isTeam && <span style={{ fontSize: 9, fontWeight: 700, color: "#2563EB", background: "rgba(37,99,235,0.1)", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>Equipe</span>}
        </div>
        {(entry.client || entry.notes) && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 12, marginTop: 2 }}>
            {entry.client ? (entry.client.brand || entry.client.name) : entry.notes}
          </p>
        )}
      </div>

      <span style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-elevated)", padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.category}</span>

      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: entry.mode === "RECORRENTE" ? "var(--accent)" : "var(--text-muted)", fontWeight: 500 }}>
        {entry.mode === "RECORRENTE" ? <Repeat size={9} /> : <Zap size={9} />}
        {entry.mode === "RECORRENTE" ? "Recorr." : "Avulso"}
      </span>

      <span style={{ fontSize: 13, fontWeight: 700, color: isReceita ? "#16A34A" : "#DC2626", letterSpacing: "-0.02em" }}>
        {isReceita ? "+" : "−"}{fmtBRL(entry.value)}
      </span>

      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtDate(entry.date)}</span>

      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <button
          disabled={!onStatusChange}
          onClick={() => {
            if (!onStatusChange) return;
            const next: Entry["status"][] = ["PENDENTE", "PAGO", "VENCIDO"];
            const idx = next.indexOf(entry.status);
            onStatusChange(entry.id, next[(idx + 1) % next.length]);
          }}
          title={onStatusChange ? "Clique para avançar status" : undefined}
          style={{ fontSize: 10, fontWeight: 600, color: st.color, background: st.bg, padding: "3px 7px", borderRadius: 20, border: "none", cursor: onStatusChange ? "pointer" : "default", whiteSpace: "nowrap" }}
        >
          {st.label}
        </button>
        {hover && onDelete && (
          <button onClick={() => onDelete(entry.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex", alignItems: "center" }}>
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Category Breakdown ─────────────────────────────────────────────────────────

function CategoryBreakdown({ title, color, entries }: { title: string; color: string; entries: Entry[] }) {
  const total = entries.reduce((s, e) => s + e.value, 0);
  const byCat: Record<string, number> = {};
  for (const e of entries) byCat[e.category] = (byCat[e.category] ?? 0) + e.value;
  const used = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", gap: 7 }}>
        <Circle size={7} fill={color} color={color} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-primary)" }}>{title}</span>
      </div>
      {used.length === 0 ? (
        <div style={{ padding: "14px 16px", fontSize: 12, color: "var(--text-muted)" }}>Sem lançamentos</div>
      ) : (
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {used.map(([cat, val]) => {
            const pct = total > 0 ? Math.round((val / total) * 100) : 0;
            return (
              <div key={cat}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--text-primary)", fontWeight: 500 }}>{cat}</span>
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{pct}%</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>{fmtBRL(val)}</span>
                  </div>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${pct}%`, background: color, opacity: 0.7 }} />
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

function NewEntryModal({ type, clients, currentMonth, currentYear, onClose, onSave }: {
  type: EntryType;
  clients: Client[];
  currentMonth: number;
  currentYear: number;
  onClose: () => void;
  onSave: (data: {
    type: EntryType; mode: EntryMode; description: string; category: string;
    value: number; date: string; status: Entry["status"]; clientId?: string | null; notes?: string;
  }) => void;
}) {
  const isReceita = type === "RECEITA";
  const [saving, setSaving]           = useState(false);
  const [description, setDescription] = useState("");
  const [value, setValue]             = useState("");
  // Para avulso: data editável. Para recorrente: não tem data relevante (sempre dia 1 do mês exibido)
  const defaultDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
  const [date, setDate]               = useState(defaultDate);
  const [category, setCategory]       = useState(isReceita ? CATEGORIES_RECEITA[0] : EXPENSE_GROUPS[0].categories[0]);
  const [status, setStatus]           = useState<Entry["status"]>("PENDENTE");
  const [mode, setMode]               = useState<EntryMode>("AVULSO");
  const [clientId, setClientId]       = useState<string>("");
  const [notes, setNotes]             = useState("");

  // Quando muda para recorrente, reseta status para Pendente (status por mês é gerenciado separado)
  function handleModeChange(m: EntryMode) {
    setMode(m);
    if (m === "RECORRENTE") setStatus("PENDENTE");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !value) return;
    setSaving(true);
    // Recorrentes sempre iniciam como Pendente — o status por mês é controlado via statusOverride
    const finalStatus: Entry["status"] = mode === "RECORRENTE" ? "PENDENTE" : status;
    // Recorrentes não têm data relevante (é stampada no mês exibido) — salva dia 1
    const finalDate = mode === "RECORRENTE" ? defaultDate : date;
    await onSave({
      type, mode,
      description: description.trim(),
      category,
      value: parseFloat(value),
      date: finalDate,
      status: finalStatus,
      clientId: clientId || null,
      notes: notes.trim() || undefined,
    });
    setSaving(false);
    onClose();
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)", padding: "26px 28px", width: 480, boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: isReceita ? "rgba(22,163,74,0.1)" : "rgba(220,38,38,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {isReceita ? <ArrowUpRight size={15} color="#16A34A" /> : <ArrowDownRight size={15} color="#DC2626" />}
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Nova {isReceita ? "Receita" : "Despesa"}</h2>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={16} /></button>
        </div>

        {/* Mode toggle */}
        <div style={{ display: "flex", background: "var(--bg-elevated)", borderRadius: 9, padding: 3, border: "1px solid var(--border)", marginBottom: mode === "RECORRENTE" ? 10 : 18 }}>
          {(["RECORRENTE", "AVULSO"] as const).map(m => (
            <button key={m} type="button" onClick={() => handleModeChange(m)} style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "none", background: mode === m ? "var(--bg-surface)" : "transparent", color: mode === m ? "var(--text-primary)" : "var(--text-muted)", fontSize: 12, fontWeight: mode === m ? 600 : 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5, transition: "all 120ms ease" }}>
              {m === "RECORRENTE" ? <RefreshCw size={11} /> : <Zap size={11} />}
              {m === "RECORRENTE" ? "Recorrente (todo mês)" : "Avulso (este mês)"}
            </button>
          ))}
        </div>

        {/* Info recorrente */}
        {mode === "RECORRENTE" && (
          <div style={{ padding: "8px 12px", background: "var(--accent-soft)", border: "1px solid var(--accent)", borderRadius: 8, marginBottom: 14, fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>
            Aparece em todos os meses. O status (Pago/Pendente) é independente por mês — mude direto na linha.
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FormField label="Descrição">
            <input autoFocus value={description} onChange={e => setDescription(e.target.value)} required placeholder={isReceita ? "Ex: Mensalidade — Cliente X" : "Ex: Plataforma de agendamento"} style={inputStyle} />
          </FormField>

          <div style={{ display: "grid", gridTemplateColumns: mode === "RECORRENTE" ? "1fr" : "1fr 1fr", gap: 12 }}>
            <FormField label="Valor (R$)">
              <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} required placeholder="0,00" style={inputStyle} />
            </FormField>
            {/* Data e Status só para avulso */}
            {mode === "AVULSO" && (
              <FormField label="Data">
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required style={inputStyle} />
              </FormField>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: mode === "AVULSO" ? "1fr 1fr" : "1fr", gap: 12 }}>
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
            {mode === "AVULSO" && (
              <FormField label="Status">
                <select value={status} onChange={e => setStatus(e.target.value as Entry["status"])} style={inputStyle}>
                  <option value="PAGO">Pago</option>
                  <option value="PENDENTE">Pendente</option>
                  <option value="VENCIDO">Vencido</option>
                </select>
              </FormField>
            )}
          </div>

          {/* Client link */}
          <FormField label={isReceita ? "Vincular ao cliente (opcional)" : "Vincular ao cliente (opcional)"}>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={inputStyle}>
              <option value="">— Sem vínculo —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.brand || c.name}</option>)}
            </select>
          </FormField>

          <FormField label="Observação (opcional)">
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas adicionais..." style={inputStyle} />
          </FormField>

          <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: isReceita ? "#16A34A" : "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
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
  label: string; value: string; sub: string; icon: React.ReactNode; iconBg: string; valueColor: string;
}) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
      <div>
        <p style={{ fontSize: 22, fontWeight: 800, color: valueColor, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{label}</p>
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 2, opacity: 0.7 }}>{sub}</p>
      </div>
    </div>
  );
}

function ActionBtn({ label, icon, color, onClick }: { label: string; icon: React.ReactNode; color: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: `1px solid ${color}44`, background: hover ? color + "18" : color + "0d", color, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "background 120ms ease" }}>
      {icon} {label}
    </button>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  height: 38, width: "100%", borderRadius: 9,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-elevated)", color: "var(--text-primary)",
  padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const navBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7, border: "1px solid var(--border)",
  background: "var(--bg-surface)", display: "flex", alignItems: "center",
  justifyContent: "center", cursor: "pointer", color: "var(--text-muted)", padding: 0,
};
