"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { ChevronLeft, Image, Plus, Star, Trophy, X } from "lucide-react";

interface Campaign { id: string; name: string; client: { name: string } }
interface Creative {
  id: string;
  name: string;
  hook: string;
  format: string;
  angle?: string | null;
  style?: string | null;
  niche?: string | null;
  vehicleType?: string | null;
  platform?: string | null;
  retention?: number | null;
  ctr?: number | null;
  cpl?: number | null;
  winner: boolean;
  starred: boolean;
  notes?: string | null;
  tags: string[];
  campaign?: { id: string; name: string; client: { name: string } } | null;
}

const FORMATS = ["Video", "Carrossel", "Imagem", "Reels", "Stories"];
const ANGLES = ["conquista", "oportunidade", "familia", "status", "economia", "urgencia", "curiosidade", "prova social"];

export function CreativesPage() {
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterWinner, setFilterWinner] = useState(false);
  const [filterFormat, setFilterFormat] = useState("");
  const [filterAngle, setFilterAngle] = useState("");
  const [saving, setSaving] = useState(false);

  const form = useRef({
    campaignId: "", name: "", hook: "", format: "",
    angle: "", style: "", niche: "", vehicleType: "", platform: "",
    ctr: "", cpl: "", retention: "", notes: "", tags: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/creatives").then((r) => r.ok ? r.json() : []),
      fetch("/api/campaigns").then((r) => r.ok ? r.json() : []),
    ]).then(([cr, ca]) => {
      setCreatives(Array.isArray(cr) ? cr : []);
      setCampaigns(Array.isArray(ca) ? ca : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = creatives.filter((c) => {
    if (filterWinner && !c.winner) return false;
    if (filterFormat && c.format !== filterFormat) return false;
    if (filterAngle && c.angle !== filterAngle) return false;
    return true;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const f = form.current;
    if (!f.name || !f.hook || !f.format) return;
    setSaving(true);
    const res = await fetch("/api/creatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: f.campaignId || undefined,
        name: f.name,
        hook: f.hook,
        format: f.format,
        angle: f.angle || undefined,
        style: f.style || undefined,
        niche: f.niche || undefined,
        vehicleType: f.vehicleType || undefined,
        platform: f.platform || undefined,
        ctr: f.ctr ? parseFloat(f.ctr) : undefined,
        cpl: f.cpl ? parseFloat(f.cpl) : undefined,
        retention: f.retention ? parseFloat(f.retention) : undefined,
        notes: f.notes || undefined,
        tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }),
    });
    if (res.ok) {
      const cr = await res.json();
      setCreatives((prev) => [cr, ...prev]);
      setShowModal(false);
    }
    setSaving(false);
  }

  async function handleStar(id: string, starred: boolean) {
    await fetch(`/api/creatives/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !starred }),
    });
    setCreatives((prev) => prev.map((c) => c.id === id ? { ...c, starred: !c.starred } : c));
  }

  async function handleWinner(id: string, winner: boolean) {
    await fetch(`/api/creatives/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winner: !winner }),
    });
    setCreatives((prev) => prev.map((c) => c.id === id ? { ...c, winner: !c.winner } : c));
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/intelligence" style={{ color: "var(--text-muted)", display: "flex" }}>
            <ChevronLeft size={18} />
          </Link>
          <Image size={18} color="#3B82F6" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Biblioteca de Criativos
          </h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 6, padding: "2px 8px" }}>
            {creatives.length}
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
          <Plus size={14} /> Novo criativo
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <FilterChip active={filterWinner} onClick={() => setFilterWinner((v) => !v)}>
          <Trophy size={11} /> Vencedores
        </FilterChip>
        {FORMATS.map((f) => (
          <FilterChip key={f} active={filterFormat === f} onClick={() => setFilterFormat(filterFormat === f ? "" : f)}>
            {f}
          </FilterChip>
        ))}
      </div>

      {filterAngle || true ? (
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {ANGLES.map((a) => (
            <button
              key={a}
              onClick={() => setFilterAngle(filterAngle === a ? "" : a)}
              style={{
                fontSize: 11, border: `1px solid ${filterAngle === a ? "#3B82F6" : "var(--border)"}`,
                background: filterAngle === a ? "#3B82F618" : "transparent",
                color: filterAngle === a ? "#3B82F6" : "var(--text-muted)",
                borderRadius: 20, padding: "3px 10px", cursor: "pointer",
              }}
            >
              {a}
            </button>
          ))}
        </div>
      ) : null}

      {/* Grid de criativos */}
      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando...</p>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <Image size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Biblioteca vazia</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            Registre criativos para construir a base de inteligência da Veloce.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Plus size={14} /> Novo criativo
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map((cr) => (
            <CreativeCard
              key={cr.id}
              creative={cr}
              onStar={() => handleStar(cr.id, cr.starred)}
              onWinner={() => handleWinner(cr.id, cr.winner)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "24px 26px", width: "100%", maxWidth: 520,
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Novo Criativo</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Campanha (opcional)">
                <select onChange={(e) => { form.current.campaignId = e.target.value; }} style={inputStyle}>
                  <option value="">Sem campanha vinculada</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.client.name} — {c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Nome do criativo *">
                <input required placeholder="Ex: Video POV cliente satisfeito" onChange={(e) => { form.current.name = e.target.value; }} style={inputStyle} />
              </Field>
              <Field label="Hook *">
                <input required placeholder="Ex: Voce ainda dirige o carro errado?" onChange={(e) => { form.current.hook = e.target.value; }} style={inputStyle} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="Formato *">
                  <select required onChange={(e) => { form.current.format = e.target.value; }} style={inputStyle}>
                    <option value="">Selecionar</option>
                    {FORMATS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </Field>
                <Field label="Angulo">
                  <select onChange={(e) => { form.current.angle = e.target.value; }} style={inputStyle}>
                    <option value="">Selecionar</option>
                    {ANGLES.map((a) => <option key={a}>{a}</option>)}
                  </select>
                </Field>
                <Field label="Plataforma">
                  <select onChange={(e) => { form.current.platform = e.target.value; }} style={inputStyle}>
                    <option value="">Selecionar</option>
                    {["Meta Ads", "Google Ads", "TikTok Ads", "YouTube Ads"].map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Nicho">
                  <input placeholder="Ex: Automotivo" onChange={(e) => { form.current.niche = e.target.value; }} style={inputStyle} />
                </Field>
                <Field label="Veiculo">
                  <input placeholder="Ex: SUV, Sedan" onChange={(e) => { form.current.vehicleType = e.target.value; }} style={inputStyle} />
                </Field>
                <Field label="Retencao (%)">
                  <input type="number" step="0.1" placeholder="65" onChange={(e) => { form.current.retention = e.target.value; }} style={inputStyle} />
                </Field>
                <Field label="CTR (%)">
                  <input type="number" step="0.01" placeholder="2.1" onChange={(e) => { form.current.ctr = e.target.value; }} style={inputStyle} />
                </Field>
                <Field label="CPL (R$)">
                  <input type="number" step="0.01" placeholder="18.50" onChange={(e) => { form.current.cpl = e.target.value; }} style={inputStyle} />
                </Field>
              </div>
              <Field label="Observacoes">
                <textarea rows={2} placeholder="O que funcionou, contexto..." onChange={(e) => { form.current.notes = e.target.value; }} style={{ ...inputStyle, resize: "none" }} />
              </Field>
              <Field label="Tags">
                <input placeholder="Ex: pov, suv, emocional" onChange={(e) => { form.current.tags = e.target.value; }} style={inputStyle} />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Salvando..." : "Criar criativo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function CreativeCard({
  creative: cr,
  onStar,
  onWinner,
}: {
  creative: Creative;
  onStar: () => void;
  onWinner: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${cr.winner ? "#F59E0B55" : cr.starred ? "#3B82F633" : "var(--border)"}`,
        borderRadius: 12, padding: "16px 18px",
        background: "var(--bg-surface)",
        position: "relative",
      }}
    >
      {/* Badges topo */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 600, background: "#3B82F618", color: "#3B82F6", borderRadius: 5, padding: "2px 7px" }}>
            {cr.format}
          </span>
          {cr.angle && (
            <span style={{ fontSize: 10, background: "var(--bg-elevated)", color: "var(--text-muted)", borderRadius: 5, padding: "2px 7px" }}>
              {cr.angle}
            </span>
          )}
          {cr.vehicleType && (
            <span style={{ fontSize: 10, background: "var(--bg-elevated)", color: "var(--text-muted)", borderRadius: 5, padding: "2px 7px" }}>
              {cr.vehicleType}
            </span>
          )}
          {cr.platform && (
            <span style={{ fontSize: 10, background: "var(--bg-elevated)", color: "var(--text-muted)", borderRadius: 5, padding: "2px 7px" }}>
              {cr.platform}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          <button onClick={onStar} style={{ background: "none", border: "none", cursor: "pointer", color: cr.starred ? "#3B82F6" : "var(--text-muted)", padding: 3 }}>
            <Star size={12} fill={cr.starred ? "#3B82F6" : "none"} />
          </button>
          <button onClick={onWinner} style={{ background: "none", border: "none", cursor: "pointer", color: cr.winner ? "#F59E0B" : "var(--text-muted)", padding: 3 }}>
            <Trophy size={12} fill={cr.winner ? "#F59E0B" : "none"} />
          </button>
        </div>
      </div>

      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{cr.name}</p>

      {/* Hook */}
      <div
        style={{
          background: "var(--bg-base)", border: "1px solid var(--border)",
          borderRadius: 7, padding: "7px 10px", marginBottom: 10,
        }}
      >
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Hook</p>
        <p style={{ fontSize: 12, color: "var(--text-primary)", fontStyle: "italic" }}>"{cr.hook}"</p>
      </div>

      {/* Métricas */}
      {(cr.ctr != null || cr.retention != null || cr.cpl != null) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
          {cr.ctr != null && <MiniMetric label="CTR" value={`${cr.ctr}%`} />}
          {cr.retention != null && <MiniMetric label="Retenção" value={`${cr.retention}%`} />}
          {cr.cpl != null && <MiniMetric label="CPL" value={`R$ ${cr.cpl}`} />}
        </div>
      )}

      {cr.notes && (
        <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
          {cr.notes}
        </p>
      )}

      {cr.campaign && (
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
          {cr.campaign.client.name} · {cr.campaign.name}
        </p>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
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

const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 8,
  background: "var(--bg-base)", color: "var(--text-primary)",
  padding: "8px 10px", fontSize: 13, outline: "none", boxSizing: "border-box",
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
