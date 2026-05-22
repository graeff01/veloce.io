"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronDown, ChevronRight, Plus, Star, X } from "lucide-react";

interface PlaybookStep {
  id: string;
  order: number;
  title: string;
  description: string;
  rationale?: string | null;
}

interface Playbook {
  id: string;
  name: string;
  niche?: string | null;
  vehicleType?: string | null;
  objective?: string | null;
  platform?: string | null;
  summary: string;
  starred: boolean;
  tags: string[];
  steps: PlaybookStep[];
}

const PLATFORMS = ["Meta Ads", "Google Ads", "TikTok Ads", "Todos"];
const NICHES = ["Automotivo", "Imoveis", "Saude", "Educacao", "Varejo"];

export function PlaybooksPage() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [steps, setSteps] = useState<{ title: string; description: string; rationale: string }[]>([
    { title: "", description: "", rationale: "" },
  ]);

  const form = useRef({
    name: "", niche: "", vehicleType: "", objective: "", platform: "", summary: "", tags: "",
  });

  useEffect(() => {
    fetch("/api/playbooks")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { setPlaybooks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleStar(id: string, starred: boolean) {
    await fetch(`/api/playbooks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !starred }),
    });
    setPlaybooks((prev) => prev.map((p) => p.id === id ? { ...p, starred: !p.starred } : p));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const f = form.current;
    if (!f.name || !f.summary) return;
    setSaving(true);
    const res = await fetch("/api/playbooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name,
        niche: f.niche || undefined,
        vehicleType: f.vehicleType || undefined,
        objective: f.objective || undefined,
        platform: f.platform || undefined,
        summary: f.summary,
        tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        steps: steps.filter((s) => s.title && s.description).map((s, i) => ({
          order: i + 1, title: s.title, description: s.description,
          rationale: s.rationale || undefined,
        })),
      }),
    });
    if (res.ok) {
      const pb = await res.json();
      setPlaybooks((prev) => [pb, ...prev]);
      setShowModal(false);
      setSteps([{ title: "", description: "", rationale: "" }]);
    }
    setSaving(false);
  }

  const sorted = [...playbooks].sort((a, b) => {
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return 0;
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/intelligence" style={{ color: "var(--text-muted)", display: "flex" }}>
            <ChevronLeft size={18} />
          </Link>
          <BookOpen size={18} color="#10B981" />
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
            Playbooks
          </h1>
          <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 6, padding: "2px 8px" }}>
            {playbooks.length}
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
          <Plus size={14} /> Novo playbook
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando...</p>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <BookOpen size={32} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Nenhum playbook</p>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 20 }}>
            Documente estratégias vencedoras por nicho, veículo e plataforma.
          </p>
          <button
            onClick={() => setShowModal(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Plus size={14} /> Criar primeiro playbook
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sorted.map((pb) => (
            <PlaybookCard
              key={pb.id}
              playbook={pb}
              expanded={expanded === pb.id}
              onToggle={() => setExpanded(expanded === pb.id ? null : pb.id)}
              onStar={() => handleStar(pb.id, pb.starred)}
            />
          ))}
        </div>
      )}

      {/* Modal novo playbook */}
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
              borderRadius: 14, padding: "24px 26px", width: "100%", maxWidth: 560,
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Novo Playbook</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Nome *">
                <input required placeholder="Ex: SUV Premium — Meta Ads — Prospeccao" onChange={(e) => { form.current.name = e.target.value; }} style={inputStyle} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Nicho">
                  <select onChange={(e) => { form.current.niche = e.target.value; }} style={inputStyle}>
                    <option value="">Selecionar</option>
                    {NICHES.map((n) => <option key={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Tipo de veiculo">
                  <input placeholder="Ex: SUV, Sedan, Todos" onChange={(e) => { form.current.vehicleType = e.target.value; }} style={inputStyle} />
                </Field>
                <Field label="Plataforma">
                  <select onChange={(e) => { form.current.platform = e.target.value; }} style={inputStyle}>
                    <option value="">Selecionar</option>
                    {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Objetivo">
                  <input placeholder="Ex: Leads, Vendas" onChange={(e) => { form.current.objective = e.target.value; }} style={inputStyle} />
                </Field>
              </div>
              <Field label="Resumo estratégico *">
                <textarea
                  required rows={3}
                  placeholder="Descreva a estratégia central deste playbook..."
                  onChange={(e) => { form.current.summary = e.target.value; }}
                  style={{ ...inputStyle, resize: "none" }}
                />
              </Field>

              {/* Steps */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", display: "block", marginBottom: 10 }}>
                  Passos do playbook
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", width: 20 }}>{i + 1}.</span>
                        <input
                          placeholder="Título do passo"
                          value={s.title}
                          onChange={(e) => setSteps((prev) => prev.map((p, j) => j === i ? { ...p, title: e.target.value } : p))}
                          style={{ ...inputStyle, flex: 1 }}
                        />
                        {steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      <input
                        placeholder="Descrição do que fazer"
                        value={s.description}
                        onChange={(e) => setSteps((prev) => prev.map((p, j) => j === i ? { ...p, description: e.target.value } : p))}
                        style={{ ...inputStyle, marginBottom: 6 }}
                      />
                      <input
                        placeholder="Por que isso funciona? (opcional)"
                        value={s.rationale}
                        onChange={(e) => setSteps((prev) => prev.map((p, j) => j === i ? { ...p, rationale: e.target.value } : p))}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSteps((prev) => [...prev, { title: "", description: "", rationale: "" }])}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "none", border: "1px dashed var(--border)",
                    borderRadius: 7, padding: "7px 14px", fontSize: 12,
                    color: "var(--text-muted)", cursor: "pointer", marginTop: 8, width: "100%",
                    justifyContent: "center",
                  }}
                >
                  <Plus size={12} /> Adicionar passo
                </button>
              </div>

              <Field label="Tags">
                <input placeholder="Ex: suv, meta, prospeccao" onChange={(e) => { form.current.tags = e.target.value; }} style={inputStyle} />
              </Field>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={btnSecondary}>Cancelar</button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Salvando..." : "Criar playbook"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PlaybookCard({
  playbook: pb,
  expanded,
  onToggle,
  onStar,
}: {
  playbook: Playbook;
  expanded: boolean;
  onToggle: () => void;
  onStar: () => void;
}) {
  return (
    <div
      style={{
        border: `1px solid ${pb.starred ? "#10B98144" : "var(--border)"}`,
        borderRadius: 12,
        background: pb.starred ? "linear-gradient(90deg, #10B98108, var(--bg-surface))" : "var(--bg-surface)",
      }}
    >
      {/* Header do card */}
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "14px 18px", cursor: "pointer",
        }}
        onClick={onToggle}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{pb.name}</p>
            {pb.starred && <Star size={12} color="#10B981" fill="#10B981" />}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[pb.niche, pb.vehicleType, pb.platform, pb.objective].filter(Boolean).map((v) => (
              <span
                key={v}
                style={{
                  fontSize: 10, background: "var(--bg-elevated)",
                  color: "var(--text-muted)", borderRadius: 5, padding: "2px 7px",
                }}
              >
                {v}
              </span>
            ))}
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {pb.steps.length} passo{pb.steps.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: pb.starred ? "#10B981" : "var(--text-muted)", padding: 4 }}
          >
            <Star size={13} fill={pb.starred ? "#10B981" : "none"} />
          </button>
          {expanded ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
        </div>
      </div>

      {/* Conteúdo expandido */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 18px" }}>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 16 }}>
            {pb.summary}
          </p>
          {pb.steps.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {pb.steps.map((s) => (
                <div key={s.id} style={{ display: "flex", gap: 12 }}>
                  <span
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: "var(--accent)", color: "#fff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                    }}
                  >
                    {s.order}
                  </span>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{s.title}</p>
                    <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>{s.description}</p>
                    {s.rationale && (
                      <p style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", marginTop: 3, lineHeight: 1.5 }}>
                        → {s.rationale}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
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
