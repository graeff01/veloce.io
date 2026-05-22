"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  Plus, Star, Trophy, ChevronLeft, X, Megaphone,
} from "lucide-react";

interface Client { id: string; name: string; brand?: string | null }
interface Metric { cpl?: number | null; ctr?: number | null; cpm?: number | null; leads?: number | null; retention?: number | null }
interface Campaign {
  id: string;
  name: string;
  objective: string;
  type: string;
  platform: string;
  vehicle?: string | null;
  budget?: number | null;
  status: string;
  winner: boolean;
  result?: string | null;
  tags: string[];
  client: { id: string; name: string; brand?: string | null };
  metrics: Metric[];
  _count: { creatives: number; insights: number };
}

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "YouTube Ads"];
const TYPES = ["Prospeccao", "Remarketing", "Branding", "Conversao"];
const OBJECTIVES = ["Leads", "Reconhecimento", "Vendas", "Trafego", "Engajamento"];

export function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterWinner, setFilterWinner] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState("");
  const [saving, setSaving] = useState(false);

  const form = useRef({
    clientId: "", name: "", objective: "", type: "", platform: "",
    vehicle: "", budget: "", tags: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/campaigns").then((r) => r.ok ? r.json() : []),
      fetch("/api/clients").then((r) => r.ok ? r.json() : []),
    ]).then(([c, cl]) => {
      setCampaigns(Array.isArray(c) ? c : []);
      setClients(Array.isArray(cl) ? cl : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = campaigns.filter((c) => {
    if (filterWinner && !c.winner) return false;
    if (filterPlatform && c.platform !== filterPlatform) return false;
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const f = form.current;
    if (!f.clientId || !f.name || !f.objective || !f.type || !f.platform) return;
    setSaving(true);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: f.clientId,
        name: f.name,
        objective: f.objective,
        type: f.type,
        platform: f.platform,
        vehicle: f.vehicle || undefined,
        budget: f.budget ? parseFloat(f.budget) : undefined,
        tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }),
    });
    if (res.ok) {
      const c = await res.json();
      setCampaigns((prev) => [c, ...prev]);
      setShowModal(false);
    }
    setSaving(false);
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/intelligence" style={{ color: "var(--text-muted)", display: "flex" }}>
            <ChevronLeft size={18} />
          </Link>
          <Megaphone size={18} color="#7C3AED" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Campanhas
          </h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 6, padding: "2px 8px" }}>
            {campaigns.length}
          </span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "var(--accent)", color: "#fff",
            border: "none", borderRadius: 8, padding: "8px 14px",
            fontSize: 13, fontWeight: 500, cursor: "pointer",
            boxShadow: "0 4px 14px rgba(124,58,237,0.25)",
          }}
        >
          <Plus size={14} /> Nova campanha
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <FilterChip active={filterWinner} onClick={() => setFilterWinner((v) => !v)}>
          <Trophy size={12} /> Vencedoras
        </FilterChip>
        {PLATFORMS.map((p) => (
          <FilterChip key={p} active={filterPlatform === p} onClick={() => setFilterPlatform(filterPlatform === p ? "" : p)}>
            {p}
          </FilterChip>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando...</p>
      ) : filtered.length === 0 ? (
        <EmptyState onNew={() => setShowModal(true)} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {filtered.map((c) => (
            <CampaignCard key={c.id} campaign={c} onToggleWinner={async () => {
              const res = await fetch(`/api/campaigns/${c.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ winner: !c.winner }),
              });
              if (res.ok) setCampaigns((prev) => prev.map((p) => p.id === c.id ? { ...p, winner: !p.winner } : p));
            }} />
          ))}
        </div>
      )}

      {/* Modal nova campanha */}
      {showModal && (
        <Modal title="Nova Campanha" onClose={() => setShowModal(false)}>
          <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Cliente *">
              <select
                required
                onChange={(e) => { form.current.clientId = e.target.value; }}
                style={inputStyle}
              >
                <option value="">Selecionar cliente</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>{cl.brand ?? cl.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Nome da campanha *">
              <input required placeholder="Ex: SUV Premium — Prospeccao" onChange={(e) => { form.current.name = e.target.value; }} style={inputStyle} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Objetivo *">
                <select required onChange={(e) => { form.current.objective = e.target.value; }} style={inputStyle}>
                  <option value="">Selecionar</option>
                  {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>
              <Field label="Tipo *">
                <select required onChange={(e) => { form.current.type = e.target.value; }} style={inputStyle}>
                  <option value="">Selecionar</option>
                  {TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Plataforma *">
                <select required onChange={(e) => { form.current.platform = e.target.value; }} style={inputStyle}>
                  <option value="">Selecionar</option>
                  {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Verba mensal (R$)">
                <input type="number" placeholder="0" onChange={(e) => { form.current.budget = e.target.value; }} style={inputStyle} />
              </Field>
            </div>
            <Field label="Tipo de veiculo">
              <input placeholder="Ex: SUV, Sedan, Pick-up, Todos" onChange={(e) => { form.current.vehicle = e.target.value; }} style={inputStyle} />
            </Field>
            <Field label="Tags (separadas por virgula)">
              <input placeholder="Ex: topo-funil, suv, meta" onChange={(e) => { form.current.tags = e.target.value; }} style={inputStyle} />
            </Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => setShowModal(false)} style={btnSecondary}>Cancelar</button>
              <button type="submit" disabled={saving} style={btnPrimary}>
                {saving ? "Criando..." : "Criar campanha"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function CampaignCard({ campaign: c, onToggleWinner }: { campaign: Campaign; onToggleWinner: () => void }) {
  const m = c.metrics[0];
  const statusColor: Record<string, string> = {
    ACTIVE: "#10B981", PAUSED: "#F59E0B", FINISHED: "#6B7280", ARCHIVED: "#6B7280",
  };
  const statusLabel: Record<string, string> = {
    ACTIVE: "Ativa", PAUSED: "Pausada", FINISHED: "Finalizada", ARCHIVED: "Arquivada",
  };

  return (
    <div
      style={{
        border: `1px solid ${c.winner ? "#7C3AED44" : "var(--border)"}`,
        borderRadius: 12,
        padding: "16px 18px",
        background: c.winner ? "linear-gradient(135deg, #7C3AED08, var(--bg-surface))" : "var(--bg-surface)",
        position: "relative",
      }}
    >
      {c.winner && (
        <div style={{ position: "absolute", top: 12, right: 12 }}>
          <Trophy size={14} color="#F59E0B" />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", lineHeight: "18px", paddingRight: 20 }}>
            {c.name}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            {c.client.brand ?? c.client.name}
          </p>
        </div>
      </div>

      {/* Badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
        <Badge color={statusColor[c.status]}>{statusLabel[c.status]}</Badge>
        <Badge color="#6B7280">{c.platform}</Badge>
        <Badge color="#6B7280">{c.type}</Badge>
        {c.vehicle && <Badge color="#3B82F666">{c.vehicle}</Badge>}
      </div>

      {/* Métricas */}
      {m && (
        <div style={{ display: "flex", gap: 12, marginBottom: 12, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
          {m.cpl != null && <Metric label="CPL" value={`R$ ${m.cpl}`} />}
          {m.ctr != null && <Metric label="CTR" value={`${m.ctr}%`} />}
          {m.leads != null && <Metric label="Leads" value={String(m.leads)} />}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10 }}>
          {c._count.creatives > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c._count.creatives} criativo{c._count.creatives > 1 ? "s" : ""}</span>
          )}
          {c._count.insights > 0 && (
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c._count.insights} insight{c._count.insights > 1 ? "s" : ""}</span>
          )}
        </div>
        <button
          onClick={onToggleWinner}
          title={c.winner ? "Remover destaque" : "Marcar como vencedora"}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: c.winner ? "#F59E0B" : "var(--text-muted)", padding: 4,
          }}
        >
          <Star size={13} fill={c.winner ? "#F59E0B" : "none"} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px" }}>
      <Megaphone size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
      <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Nenhuma campanha registrada</p>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>Registre sua primeira campanha para começar a acumular inteligência operacional.</p>
      <button onClick={onNew} style={{ ...btnPrimary, margin: "0 auto" }}>
        <Plus size={14} /> Nova campanha
      </button>
    </div>
  );
}

function FilterChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
        background: active ? "var(--accent-soft)" : "var(--bg-surface)",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 500,
        color,
        background: `${color}18`,
        border: `1px solid ${color}33`,
        borderRadius: 5, padding: "2px 6px",
      }}
    >
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", display: "block", marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 14, padding: "24px 26px", width: "100%", maxWidth: 500,
          maxHeight: "90vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>{title}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--bg-base)", color: "var(--text-primary)",
  padding: "8px 10px", fontSize: 13, outline: "none",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "var(--accent)", color: "#fff",
  border: "none", borderRadius: 8, padding: "8px 16px",
  fontSize: 13, fontWeight: 500, cursor: "pointer",
};

const btnSecondary: React.CSSProperties = {
  background: "none", color: "var(--text-secondary)",
  border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px",
  fontSize: 13, cursor: "pointer",
};
