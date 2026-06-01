"use client";

import { useState } from "react";
import {
  Users, Plus, X, Briefcase, DollarSign, Phone,
  Mail, Edit2, Trash2, UserCheck, UserX, Loader2,
  Building2, Wrench,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type PersonType = "FUNCIONARIO" | "PRESTADOR";
type PersonStatus = "ATIVO" | "INATIVO";

interface Person {
  id: string;
  type: PersonType;
  name: string;
  role: string;
  department: string;
  email: string;
  phone: string;
  salary: number;
  status: PersonStatus;
  startDate: string;
  notes: string;
}

const DEPARTMENTS = ["Operações", "Criação", "Tráfego", "Comercial", "Gestão", "Financeiro", "Outro"];

const TYPE_CONFIG: Record<PersonType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  FUNCIONARIO: { label: "Funcionário",        icon: <Users size={12} />,    color: "#2563EB", bg: "rgba(37,99,235,0.1)" },
  PRESTADOR:   { label: "Prestador de Serviço", icon: <Wrench size={12} />, color: "#7C3AED", bg: "rgba(124,58,237,0.1)" },
};

const STATUS_CONFIG: Record<PersonStatus, { label: string; color: string; bg: string }> = {
  ATIVO:   { label: "Ativo",   color: "#16A34A", bg: "rgba(22,163,74,0.1)" },
  INATIVO: { label: "Inativo", color: "#64748B", bg: "rgba(100,116,139,0.1)" },
};

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function HrContent() {
  const [people, setPeople] = useState<Person[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [filterType, setFilterType] = useState<"TODOS" | PersonType>("TODOS");
  const [filterStatus, setFilterStatus] = useState<"TODOS" | PersonStatus>("TODOS");

  const filtered = people.filter(p => {
    if (filterType !== "TODOS" && p.type !== filterType) return false;
    if (filterStatus !== "TODOS" && p.status !== filterStatus) return false;
    return true;
  });

  const ativos      = people.filter(p => p.status === "ATIVO");
  const funcionarios = ativos.filter(p => p.type === "FUNCIONARIO");
  const prestadores  = ativos.filter(p => p.type === "PRESTADOR");
  const totalMensal  = ativos.reduce((s, p) => s + p.salary, 0);

  function handleSave(person: Omit<Person, "id">) {
    if (editing) {
      setPeople(prev => prev.map(p => p.id === editing.id ? { ...person, id: editing.id } : p));
    } else {
      setPeople(prev => [...prev, { ...person, id: crypto.randomUUID() }]);
    }
    setShowForm(false);
    setEditing(null);
  }

  function handleEdit(person: Person) {
    setEditing(person);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    setPeople(prev => prev.filter(p => p.id !== id));
  }

  function handleToggleStatus(id: string) {
    setPeople(prev => prev.map(p =>
      p.id === id ? { ...p, status: p.status === "ATIVO" ? "INATIVO" : "ATIVO" } : p
    ));
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
            Equipe
          </h1>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Funcionários e prestadores de serviço
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 16px", borderRadius: 9,
            background: "var(--accent)", color: "#fff",
            border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer",
            boxShadow: "0 4px 12px rgba(124,58,237,0.25)",
          }}
        >
          <Plus size={13} /> Adicionar pessoa
        </button>
      </div>

      <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── KPIs ─────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
          <KpiCard label="Total ativo" value={String(ativos.length)} sub="pessoas na equipe" icon={<Users size={15} color="var(--accent)" />} iconBg="var(--accent-soft)" valueColor="var(--accent)" />
          <KpiCard label="Funcionários" value={String(funcionarios.length)} sub="CLT / PJ" icon={<Building2 size={15} color="#2563EB" />} iconBg="rgba(37,99,235,0.1)" valueColor="#2563EB" />
          <KpiCard label="Prestadores" value={String(prestadores.length)} sub="freelancers / terceiros" icon={<Wrench size={15} color="#7C3AED" />} iconBg="rgba(124,58,237,0.1)" valueColor="#7C3AED" />
          <KpiCard label="Custo mensal" value={fmtBRL(totalMensal)} sub="salários + honorários" icon={<DollarSign size={15} color="#16A34A" />} iconBg="rgba(22,163,74,0.1)" valueColor="#16A34A" />
        </div>

        {/* ── Filters + list ───────────────────────────────── */}
        <div>
          {/* Filter bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <ToggleGroup
              options={[
                { value: "TODOS", label: "Todos" },
                { value: "FUNCIONARIO", label: "Funcionários" },
                { value: "PRESTADOR", label: "Prestadores" },
              ]}
              value={filterType}
              onChange={v => setFilterType(v as typeof filterType)}
            />
            <div style={{ width: 1, height: 20, background: "var(--border)" }} />
            <ToggleGroup
              options={[
                { value: "TODOS", label: "Todos" },
                { value: "ATIVO", label: "Ativos" },
                { value: "INATIVO", label: "Inativos" },
              ]}
              value={filterStatus}
              onChange={v => setFilterStatus(v as typeof filterStatus)}
            />
          </div>

          {/* Table */}
          {filtered.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "64px 20px",
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 12,
            }}>
              <Users size={32} style={{ color: "var(--text-muted)", opacity: 0.2, margin: "0 auto 12px", display: "block" }} />
              <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>
                {people.length === 0 ? "Nenhuma pessoa cadastrada" : "Nenhum resultado para os filtros"}
              </p>
              {people.length === 0 && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, opacity: 0.7 }}>
                  Adicione funcionários e prestadores para controlar custos com equipe
                </p>
              )}
            </div>
          ) : (
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
              {/* Header */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 120px 130px 120px 110px 100px 80px",
                padding: "10px 18px", borderBottom: "1px solid var(--border)",
                background: "var(--bg-elevated)",
              }}>
                {["Nome", "Tipo", "Departamento", "Custo/mês", "Início", "Status", ""].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{h}</span>
                ))}
              </div>
              {filtered.map((person, i) => (
                <PersonRow
                  key={person.id}
                  person={person}
                  last={i === filtered.length - 1}
                  onEdit={() => handleEdit(person)}
                  onDelete={() => handleDelete(person.id)}
                  onToggleStatus={() => handleToggleStatus(person.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <PersonModal
          initial={editing ?? undefined}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}

// ── Person Row ─────────────────────────────────────────────────────────────────

function PersonRow({ person, last, onEdit, onDelete, onToggleStatus }: {
  person: Person; last: boolean;
  onEdit: () => void; onDelete: () => void; onToggleStatus: () => void;
}) {
  const [hover, setHover] = useState(false);
  const tc = TYPE_CONFIG[person.type];
  const sc = STATUS_CONFIG[person.status];

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid", gridTemplateColumns: "1fr 120px 130px 120px 110px 100px 80px",
        padding: "12px 18px",
        borderBottom: last ? "none" : "1px solid var(--border)",
        background: hover ? "var(--bg-elevated)" : "transparent",
        transition: "background 100ms", alignItems: "center",
      }}
    >
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{person.name}</p>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>{person.role}</p>
      </div>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: tc.color, background: tc.bg, padding: "3px 8px", borderRadius: 20 }}>
        {tc.icon} {tc.label}
      </span>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{person.department}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>{fmtBRL(person.salary)}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {person.startDate ? new Date(person.startDate + "T00:00:00").toLocaleDateString("pt-BR", { month: "short", year: "numeric" }) : "—"}
      </span>
      <span style={{ fontSize: 10, fontWeight: 600, color: sc.color, background: sc.bg, padding: "3px 8px", borderRadius: 20, display: "inline-block" }}>
        {sc.label}
      </span>
      {hover && (
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onToggleStatus} title={person.status === "ATIVO" ? "Desativar" : "Ativar"} style={iconBtn}>
            {person.status === "ATIVO" ? <UserX size={12} /> : <UserCheck size={12} />}
          </button>
          <button onClick={onEdit} title="Editar" style={iconBtn}><Edit2 size={12} /></button>
          <button onClick={onDelete} title="Remover" style={{ ...iconBtn, color: "var(--red)" }}><Trash2 size={12} /></button>
        </div>
      )}
    </div>
  );
}

// ── Person Modal ───────────────────────────────────────────────────────────────

function PersonModal({ initial, onClose, onSave }: {
  initial?: Person;
  onClose: () => void;
  onSave: (person: Omit<Person, "id">) => void;
}) {
  const [type, setType]         = useState<PersonType>(initial?.type ?? "FUNCIONARIO");
  const [name, setName]         = useState(initial?.name ?? "");
  const [role, setRole]         = useState(initial?.role ?? "");
  const [department, setDept]   = useState(initial?.department ?? DEPARTMENTS[0]);
  const [email, setEmail]       = useState(initial?.email ?? "");
  const [phone, setPhone]       = useState(initial?.phone ?? "");
  const [salary, setSalary]     = useState(String(initial?.salary ?? ""));
  const [status, setStatus]     = useState<PersonStatus>(initial?.status ?? "ATIVO");
  const [startDate, setStart]   = useState(initial?.startDate ?? new Date().toISOString().slice(0, 10));
  const [notes, setNotes]       = useState(initial?.notes ?? "");
  const [saving, setSaving]     = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onSave({ type, name, role, department, email, phone, salary: parseFloat(salary) || 0, status, startDate, notes });
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)", padding: "26px 28px", width: 500, boxShadow: "0 24px 64px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            {initial ? "Editar pessoa" : "Adicionar pessoa"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Type selector */}
        <div style={{ display: "flex", gap: 0, background: "var(--bg-elevated)", borderRadius: 9, padding: 3, border: "1px solid var(--border)", marginBottom: 20 }}>
          {(["FUNCIONARIO", "PRESTADOR"] as const).map(t => {
            const c = TYPE_CONFIG[t];
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                style={{
                  flex: 1, padding: "8px 0", borderRadius: 7, border: "none",
                  background: type === t ? "var(--bg-surface)" : "transparent",
                  color: type === t ? c.color : "var(--text-muted)",
                  fontSize: 12, fontWeight: type === t ? 600 : 500,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  boxShadow: type === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                  transition: "all 120ms ease",
                }}
              >
                {c.icon} {c.label}
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Nome *">
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="Nome completo" style={inputStyle} />
            </FormField>
            <FormField label="Cargo / Função">
              <input value={role} onChange={e => setRole(e.target.value)} placeholder={type === "FUNCIONARIO" ? "Ex: Gestor de Tráfego" : "Ex: Editor de Vídeo"} style={inputStyle} />
            </FormField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="Departamento">
              <select value={department} onChange={e => setDept(e.target.value)} style={inputStyle}>
                {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </FormField>
            <FormField label={type === "FUNCIONARIO" ? "Salário/mês (R$)" : "Honorário/mês (R$)"}>
              <input type="number" min="0" step="0.01" value={salary} onChange={e => setSalary(e.target.value)} placeholder="0,00" style={inputStyle} />
            </FormField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label="E-mail">
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@empresa.com" style={inputStyle} />
            </FormField>
            <FormField label="Telefone / WhatsApp">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(11) 99999-0000" style={inputStyle} />
            </FormField>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <FormField label={type === "FUNCIONARIO" ? "Data de admissão" : "Início do contrato"}>
              <input type="date" value={startDate} onChange={e => setStart(e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Status">
              <select value={status} onChange={e => setStatus(e.target.value as PersonStatus)} style={inputStyle}>
                <option value="ATIVO">Ativo</option>
                <option value="INATIVO">Inativo</option>
              </select>
            </FormField>
          </div>

          <FormField label="Observações">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Detalhes do contrato, skills, observações..."
              rows={3}
              style={{ ...inputStyle, height: "auto", padding: "10px 12px", resize: "none" }}
            />
          </FormField>

          <div style={{ display: "flex", gap: 10, marginTop: 6, justifyContent: "flex-end" }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ padding: "8px 20px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
            >
              {saving && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />}
              {initial ? "Salvar alterações" : "Adicionar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function ToggleGroup({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 2, background: "var(--bg-elevated)", padding: 3, borderRadius: 9, border: "1px solid var(--border)" }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: "5px 13px", borderRadius: 7, border: "none",
            background: value === opt.value ? "var(--bg-surface)" : "transparent",
            color: value === opt.value ? "var(--text-primary)" : "var(--text-muted)",
            fontSize: 12, fontWeight: value === opt.value ? 600 : 500,
            cursor: "pointer",
            boxShadow: value === opt.value ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 120ms ease",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
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
  padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box",
};

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--text-muted)", padding: 4, borderRadius: 6,
  display: "flex", alignItems: "center",
};
