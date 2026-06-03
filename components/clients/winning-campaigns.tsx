"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Trophy, Plus, X, Loader2, Edit2, Trash2,
  TrendingUp, Users, MousePointer, DollarSign,
  ExternalLink, ChevronDown, ChevronUp, Tag, Sparkles, ClipboardPaste,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface WinningCampaign {
  id: string;
  month: number;
  year: number;
  name: string;
  platform: string;
  tags: string[];
  spend: number;
  leads: number;
  cpl: number;
  ctr: number;
  reach: number;
  roas: number;
  whatWorked: string | null;
  audience: string | null;
  creativeUrl: string | null;
  nextSteps: string | null;
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmt(v: number, d = 2) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

const PRESET_TAGS = ["Oferta direta", "Prova social", "Vídeo curto", "Carrossel", "Lead form", "Remarketing", "Topo de funil", "Fundo de funil"];

// ── Main ───────────────────────────────────────────────────────────────────────

export function WinningCampaigns({ clientId }: { clientId: string }) {
  const [campaigns, setCampaigns] = useState<WinningCampaign[]>([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(false);
  const [editing, setEditing]     = useState<WinningCampaign | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/winning-campaigns`);
    if (res.ok) setCampaigns(await res.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Remover esta campanha do acervo?")) return;
    await fetch(`/api/clients/${clientId}/winning-campaigns/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return (
    <div style={{ padding: "32px 0", display: "flex", justifyContent: "center" }}>
      <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
    </div>
  );

  return (
    <div>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Trophy size={14} style={{ color: "#D97706" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
            Campanhas Vencedoras
          </span>
          {campaigns.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", background: "rgba(217,119,6,0.1)", padding: "1px 7px", borderRadius: 20 }}>
              {campaigns.length}
            </span>
          )}
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 8, border: "1px solid #D97706", background: "rgba(217,119,6,0.06)", color: "#D97706", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
        >
          <Plus size={12} /> Adicionar vencedora
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 20px", background: "var(--bg-surface)", border: "1px dashed var(--border)", borderRadius: 12 }}>
          <Trophy size={28} style={{ color: "#D97706", opacity: 0.25, margin: "0 auto 10px", display: "block" }} />
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>Nenhuma campanha salva ainda</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.7 }}>
            Ao final do mês, salve aqui o que funcionou para replicar no próximo ciclo
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {campaigns.map(c => (
            <CampaignCard
              key={c.id}
              campaign={c}
              onEdit={() => { setEditing(c); setShowForm(true); }}
              onDelete={() => handleDelete(c.id)}
            />
          ))}
        </div>
      )}

      {showForm && (
        <CampaignForm
          clientId={clientId}
          initial={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Campaign Card ──────────────────────────────────────────────────────────────

function CampaignCard({ campaign: c, onEdit, onDelete }: {
  campaign: WinningCampaign;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover]       = useState(false);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderLeft: "3px solid #D97706", borderRadius: 10, overflow: "hidden", transition: "box-shadow 120ms" }}
    >
      {/* Card header */}
      <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        {/* Month badge */}
        <div style={{ width: 42, height: 42, borderRadius: 9, background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#D97706", lineHeight: 1 }}>{MONTHS[c.month - 1]}</span>
          <span style={{ fontSize: 9, color: "#D97706", opacity: 0.7, lineHeight: 1.4 }}>{c.year}</span>
        </div>

        {/* Name + tags */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.name}
          </p>
          <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 600, color: "#7C3AED", background: "rgba(124,58,237,0.1)", padding: "1px 6px", borderRadius: 4 }}>{c.platform}</span>
            {c.tags.slice(0, 3).map(t => (
              <span key={t} style={{ fontSize: 9, color: "var(--text-muted)", background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--border)" }}>{t}</span>
            ))}
          </div>
        </div>

        {/* Key metrics inline */}
        <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
          {c.cpl > 0 && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#16A34A", margin: 0, letterSpacing: "-0.02em" }}>{fmtBRL(c.cpl)}</p>
              <p style={{ fontSize: 9, color: "var(--text-muted)", margin: 0 }}>CPL</p>
            </div>
          )}
          {c.ctr > 0 && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#2563EB", margin: 0, letterSpacing: "-0.02em" }}>{fmt(c.ctr)}%</p>
              <p style={{ fontSize: 9, color: "var(--text-muted)", margin: 0 }}>CTR</p>
            </div>
          )}
          {c.leads > 0 && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "#D97706", margin: 0, letterSpacing: "-0.02em" }}>{c.leads}</p>
              <p style={{ fontSize: 9, color: "var(--text-muted)", margin: 0 }}>Leads</p>
            </div>
          )}
          {c.spend > 0 && (
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)", margin: 0, letterSpacing: "-0.02em" }}>{fmtBRL(c.spend)}</p>
              <p style={{ fontSize: 9, color: "var(--text-muted)", margin: 0 }}>Gasto</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 4, opacity: hover ? 1 : 0, transition: "opacity 120ms" }}>
          <button onClick={onEdit}   style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 5, display: "flex" }}><Edit2 size={12} /></button>
          <button onClick={onDelete} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)",        padding: 4, borderRadius: 5, display: "flex" }}><Trash2 size={12} /></button>
        </div>

        <button
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, display: "flex", flexShrink: 0 }}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12, background: "var(--bg-base)" }}>

          {/* Full metrics row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {[
              { label: "Gasto",       value: fmtBRL(c.spend),    icon: <DollarSign size={11} color="#DC2626" />,    show: c.spend > 0 },
              { label: "Leads",       value: String(c.leads),    icon: <TrendingUp size={11} color="#16A34A" />,    show: c.leads > 0 },
              { label: "CPL",         value: fmtBRL(c.cpl),      icon: <TrendingUp size={11} color="#16A34A" />,    show: c.cpl > 0 },
              { label: "CTR",         value: `${fmt(c.ctr)}%`,   icon: <MousePointer size={11} color="#2563EB" />,  show: c.ctr > 0 },
              { label: "Alcance",     value: fmtK(c.reach),      icon: <Users size={11} color="#7C3AED" />,         show: c.reach > 0 },
              { label: "ROAS",        value: `${fmt(c.roas)}x`,  icon: <TrendingUp size={11} color="#D97706" />,    show: c.roas > 0 },
            ].filter(m => m.show).map(m => (
              <div key={m.label} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                {m.icon}
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{m.value}</p>
                  <p style={{ fontSize: 9, color: "var(--text-muted)", margin: 0 }}>{m.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Learnings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {c.whatWorked && (
              <LearningBlock icon={<Trophy size={11} color="#D97706" />} label="O que funcionou" text={c.whatWorked} color="#D97706" />
            )}
            {c.audience && (
              <LearningBlock icon={<Users size={11} color="#7C3AED" />} label="Público-alvo" text={c.audience} color="#7C3AED" />
            )}
            {c.nextSteps && (
              <LearningBlock icon={<TrendingUp size={11} color="#16A34A" />} label="Replicar no próximo mês" text={c.nextSteps} color="#16A34A" />
            )}
            {c.creativeUrl && (
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 9, padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                  <ExternalLink size={11} color="var(--accent)" />
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Criativo</span>
                </div>
                <a href={c.creativeUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none", wordBreak: "break-all" }}>
                  {c.creativeUrl.replace(/^https?:\/\//, "").slice(0, 60)}{c.creativeUrl.length > 60 ? "..." : ""}
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function LearningBlock({ icon, label, text, color }: { icon: React.ReactNode; label: string; text: string; color: string }) {
  return (
    <div style={{ background: "var(--bg-surface)", border: `1px solid ${color}22`, borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

// ── Campaign Form ──────────────────────────────────────────────────────────────

function CampaignForm({ clientId, initial, onClose, onSaved }: {
  clientId: string;
  initial?: WinningCampaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const now = new Date();
  const [saving, setSaving]         = useState(false);
  const [name, setName]             = useState(initial?.name ?? "");
  const [platform, setPlatform]     = useState(initial?.platform ?? "Meta Ads");
  const [month, setMonth]           = useState(initial?.month ?? now.getMonth() + 1);
  const [year, setYear]             = useState(initial?.year ?? now.getFullYear());
  const [tags, setTags]             = useState<string[]>(initial?.tags ?? []);
  const [tagInput, setTagInput]     = useState("");
  const [spend, setSpend]           = useState(String(initial?.spend ?? ""));
  const [leads, setLeads]           = useState(String(initial?.leads ?? ""));
  const [cpl, setCpl]               = useState(String(initial?.cpl ?? ""));
  const [ctr, setCtr]               = useState(String(initial?.ctr ?? ""));
  const [reach, setReach]           = useState(String(initial?.reach ?? ""));
  const [roas, setRoas]             = useState(String(initial?.roas ?? ""));
  const [whatWorked, setWhatWorked] = useState(initial?.whatWorked ?? "");
  const [audience, setAudience]     = useState(initial?.audience ?? "");
  const [creativeUrl, setCreativeUrl] = useState(initial?.creativeUrl ?? "");
  const [nextSteps, setNextSteps]   = useState(initial?.nextSteps ?? "");

  // Importar por IA (colar relatório/planilha)
  const [pasteOpen, setPasteOpen]   = useState(false);
  const [pasteText, setPasteText]   = useState("");
  const [parsing, setParsing]       = useState(false);
  const [parseErr, setParseErr]     = useState("");

  async function handleParse() {
    if (!pasteText.trim()) return;
    setParsing(true);
    setParseErr("");
    try {
      const res = await fetch("/api/winning-campaigns/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText }),
      });
      const d = await res.json();
      if (!res.ok) { setParseErr(d?.error ?? "Não consegui interpretar."); setParsing(false); return; }
      if (d.name)              setName(String(d.name));
      if (d.spend != null)     setSpend(String(d.spend));
      if (d.leads != null)     setLeads(String(d.leads));
      if (d.cpl != null)       setCpl(String(d.cpl));
      if (d.ctr != null)       setCtr(String(d.ctr));
      if (d.reach != null)     setReach(String(d.reach));
      if (d.roas != null)      setRoas(String(d.roas));
      if (d.audience)          setAudience(String(d.audience));
      if (d.whatWorked)        setWhatWorked(String(d.whatWorked));
      setPasteOpen(false);
      setPasteText("");
    } catch {
      setParseErr("Falha de rede.");
    }
    setParsing(false);
  }

  function toggleTag(t: string) {
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function addCustomTag() {
    const v = tagInput.trim();
    if (v && !tags.includes(v)) { setTags(prev => [...prev, v]); setTagInput(""); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    const spendN = parseFloat(spend) || 0;
    const leadsN = parseInt(leads) || 0;
    const cplCalc = cpl ? parseFloat(cpl) : (leadsN > 0 && spendN > 0 ? spendN / leadsN : 0);

    const body = {
      month, year, name: name.trim(), platform, tags,
      spend: spendN, leads: leadsN,
      cpl: cplCalc,
      ctr: parseFloat(ctr) || 0,
      reach: parseInt(reach) || 0,
      roas: parseFloat(roas) || 0,
      whatWorked: whatWorked.trim() || null,
      audience: audience.trim() || null,
      creativeUrl: creativeUrl.trim() || null,
      nextSteps: nextSteps.trim() || null,
    };

    const url    = initial ? `/api/clients/${clientId}/winning-campaigns/${initial.id}` : `/api/clients/${clientId}/winning-campaigns`;
    const method = initial ? "PUT" : "POST";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    onSaved();
  }

  const inp: React.CSSProperties = {
    height: 38, width: "100%", borderRadius: 8, border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)", color: "var(--text-primary)",
    padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box",
  };
  const ta: React.CSSProperties = { ...inp, height: "auto", padding: "9px 12px", resize: "none", lineHeight: 1.5 };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: 600, maxHeight: "90vh", overflowY: "auto", background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.25)" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(217,119,6,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Trophy size={15} color="#D97706" />
          </div>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", flex: 1, margin: 0 }}>
            {initial ? "Editar campanha vencedora" : "Salvar campanha vencedora"}
          </h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 22px 22px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Importar por IA — cola o relatório/planilha e preenche sozinho */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", padding: pasteOpen ? "12px 14px" : "0" }}>
            {!pasteOpen ? (
              <button
                type="button"
                onClick={() => setPasteOpen(true)}
                style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: 12.5, fontWeight: 600 }}
              >
                <Sparkles size={13} /> Colar dados e preencher com IA
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)", fontSize: 11 }}>
                  <ClipboardPaste size={12} /> Cole o relatório do Meta, uma linha da planilha ou anotações — a IA extrai os números.
                </div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder={"Ex: Campanha Lead Verão — Gasto R$ 1.240, 83 leads, CPL R$ 14,9, CTR 2,1%, alcance 38.000..."}
                  style={{ ...ta, height: "auto" }}
                />
                {parseErr && <span style={{ fontSize: 11, color: "var(--red, #DC2626)" }}>{parseErr}</span>}
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => { setPasteOpen(false); setPasteText(""); setParseErr(""); }} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                  <button type="button" onClick={handleParse} disabled={parsing || !pasteText.trim()} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: parsing ? "default" : "pointer", opacity: parsing || !pasteText.trim() ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                    {parsing ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={12} />}
                    {parsing ? "Lendo..." : "Preencher campos"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Name + platform + period */}
          <div>
            <label style={lbl}>Nome da campanha *</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} required placeholder="Ex: Lead Form — Oferta Verão" style={inp} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={lbl}>Plataforma</label>
              <select value={platform} onChange={e => setPlatform(e.target.value)} style={inp}>
                {["Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads", "Outro"].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Mês</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} style={inp}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Ano</label>
              <select value={year} onChange={e => setYear(Number(e.target.value))} style={inp}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label style={lbl}><Tag size={10} style={{ display: "inline", marginRight: 4 }} />Tags</label>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
              {PRESET_TAGS.map(t => (
                <button key={t} type="button" onClick={() => toggleTag(t)} style={{ padding: "4px 10px", borderRadius: 20, border: `1px solid ${tags.includes(t) ? "#D97706" : "var(--border)"}`, background: tags.includes(t) ? "rgba(217,119,6,0.1)" : "var(--bg-elevated)", color: tags.includes(t) ? "#D97706" : "var(--text-muted)", fontSize: 11, cursor: "pointer", fontWeight: tags.includes(t) ? 600 : 400 }}>
                  {t}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomTag(); } }} placeholder="Tag personalizada..." style={{ ...inp, flex: 1 }} />
              <button type="button" onClick={addCustomTag} style={{ padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer" }}>Add</button>
            </div>
            {tags.filter(t => !PRESET_TAGS.includes(t)).length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
                {tags.filter(t => !PRESET_TAGS.includes(t)).map(t => (
                  <span key={t} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, color: "var(--text-secondary)" }}>
                    {t}
                    <button type="button" onClick={() => setTags(prev => prev.filter(x => x !== t))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", padding: 0, display: "flex" }}><X size={9} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Metrics */}
          <div>
            <label style={{ ...lbl, marginBottom: 10 }}>Métricas</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {[
                { label: "Gasto (R$)", value: spend, set: setSpend, placeholder: "Ex: 1500" },
                { label: "Leads",      value: leads, set: setLeads, placeholder: "Ex: 42" },
                { label: "CPL (R$) — auto se vazio", value: cpl, set: setCpl, placeholder: "Calculado automaticamente" },
                { label: "CTR (%)",    value: ctr,   set: setCtr,  placeholder: "Ex: 2.4" },
                { label: "Alcance",    value: reach, set: setReach, placeholder: "Ex: 18000" },
                { label: "ROAS",       value: roas,  set: setRoas, placeholder: "Ex: 3.2" },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ ...lbl, textTransform: "none", fontSize: 10 }}>{f.label}</label>
                  <input type="number" min="0" step="0.01" value={f.value} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={inp} />
                </div>
              ))}
            </div>
          </div>

          {/* Learnings */}
          <div>
            <label style={lbl}>O que funcionou</label>
            <textarea value={whatWorked} onChange={e => setWhatWorked(e.target.value)} rows={3} placeholder="Ex: Copy com gatilho de escassez + vídeo de 15s converteu 2x mais que imagem estática. Frase de abertura: 'Você tem 48h para...' gerou mais curiosidade." style={ta} />
          </div>

          <div>
            <label style={lbl}>Público-alvo que converteu</label>
            <textarea value={audience} onChange={e => setAudience(e.target.value)} rows={2} placeholder="Ex: Mulheres 28-45, interesse em empreendedorismo, excluindo compradores dos últimos 30 dias." style={ta} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Link do criativo</label>
              <input value={creativeUrl} onChange={e => setCreativeUrl(e.target.value)} placeholder="https://drive.google.com/..." style={inp} />
            </div>
            <div>
              <label style={lbl}>O que replicar no próximo mês</label>
              <input value={nextSteps} onChange={e => setNextSteps(e.target.value)} placeholder="Ex: Testar mesmo copy com novo público + aumentar budget 30%" style={inp} />
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button type="submit" disabled={saving || !name.trim()} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 20px", borderRadius: 9, border: "none", background: "#D97706", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trophy size={13} />}
              {initial ? "Salvar alterações" : "Salvar no acervo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
