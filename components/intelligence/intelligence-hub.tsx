"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Brain, Search, Plus, Star, Trophy, ChevronRight,
  Lightbulb, BookOpen, Image, Megaphone, X, Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  campaigns: SearchCampaign[];
  creatives: SearchCreative[];
  insights: SearchInsight[];
  playbooks: SearchPlaybook[];
  total: number;
}

interface SearchCampaign {
  id: string;
  name: string;
  platform: string;
  vehicle?: string | null;
  winner: boolean;
  client: { name: string; brand?: string | null; niche?: string | null };
  metrics: Array<{ cpl?: number | null; ctr?: number | null; retention?: number | null }>;
}

interface SearchCreative {
  id: string;
  name: string;
  hook: string;
  format: string;
  angle?: string | null;
  niche?: string | null;
  vehicleType?: string | null;
  retention?: number | null;
  ctr?: number | null;
  winner: boolean;
  starred: boolean;
  notes?: string | null;
  campaign?: { name: string; client: { name: string } } | null;
}

interface SearchInsight {
  id: string;
  content: string;
  type: string;
  starred: boolean;
  niche?: string | null;
  vehicleType?: string | null;
  tags: string[];
  _scope: "global" | "campaign";
  campaign?: { name: string; client: { name: string } } | null;
}

interface SearchPlaybook {
  id: string;
  name: string;
  niche?: string | null;
  vehicleType?: string | null;
  platform?: string | null;
  summary: string;
  starred: boolean;
  steps: Array<{ title: string; description: string }>;
}

// ── Quick-register types ───────────────────────────────────────────────────────

const KIND_OPTIONS = [
  { value: "hook", label: "Hook vencedor", icon: Zap, color: "#F59E0B", desc: "Um gancho que performou bem" },
  { value: "insight", label: "Insight / Padrão", icon: Lightbulb, color: "#10B981", desc: "Aprendizado ou padrão identificado" },
  { value: "creative", label: "Criativo completo", icon: Image, color: "#3B82F6", desc: "Criativo com hook, formato e métricas" },
  { value: "playbook", label: "Playbook", icon: BookOpen, color: "#8B5CF6", desc: "Estratégia estruturada por nicho/veículo" },
] as const;

type KindValue = typeof KIND_OPTIONS[number]["value"];

const FORMATS = ["Video", "Carrossel", "Imagem", "Reels", "Stories"];
const ANGLES = ["conquista", "oportunidade", "familia", "status", "economia", "urgencia", "curiosidade", "prova social"];
const INSIGHT_TYPES = [
  { value: "OBSERVATION", label: "Observação" },
  { value: "PATTERN", label: "Padrão" },
  { value: "WARNING", label: "Aviso" },
  { value: "WINNING_STRATEGY", label: "Estratégia vencedora" },
  { value: "HYPOTHESIS", label: "Hipótese" },
];

const SUGGESTION_QUERIES = [
  { label: "SUVs", q: "SUV", vehicle: "SUV" },
  { label: "Premium", q: "premium" },
  { label: "Alta retenção", q: "", winners: true },
  { label: "Meta Ads", q: "", platform: "Meta Ads" },
  { label: "Google Ads", q: "", platform: "Google Ads" },
  { label: "Hooks POV", q: "POV" },
  { label: "Automotivo", q: "automotivo", niche: "Automotivo" },
  { label: "Vencedores", q: "", winners: true },
];

// ── Main Component ─────────────────────────────────────────────────────────────

export function IntelligenceHub() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ platform?: string; vehicle?: string; winners?: boolean }>({});
  const [showRegister, setShowRegister] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(async (q: string, filters: typeof activeFilters) => {
    if (!q && !filters.platform && !filters.vehicle && !filters.winners) {
      setResults(null);
      return;
    }
    setSearching(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (filters.platform) params.set("platform", filters.platform);
    if (filters.vehicle) params.set("vehicle", filters.vehicle);
    if (filters.winners) params.set("winners", "true");

    try {
      const res = await fetch(`/api/intelligence/search?${params}`);
      if (res.ok) setResults(await res.json());
    } finally {
      setSearching(false);
    }
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val, activeFilters), 320);
  }

  function applySuggestion(s: typeof SUGGESTION_QUERIES[number]) {
    const newFilters = {
      platform: s.platform,
      vehicle: s.vehicle,
      winners: s.winners,
    };
    setQuery(s.q);
    setActiveFilters(newFilters);
    doSearch(s.q, newFilters);
  }

  function clearSearch() {
    setQuery("");
    setActiveFilters({});
    setResults(null);
  }

  const hasResults = results && results.total > 0;
  const isEmpty = results && results.total === 0;

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: "linear-gradient(135deg, #7C3AED, #3B82F6)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Brain size={17} color="#fff" />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
              Inteligência Operacional
            </h1>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 44 }}>
            Motor de recuperação de padrões vencedores
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowRegister((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: showRegister ? "var(--accent)" : "var(--bg-surface)",
              color: showRegister ? "#fff" : "var(--text-primary)",
              border: `1px solid ${showRegister ? "var(--accent)" : "var(--border)"}`,
              borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            <Plus size={14} />
            Registrar padrão
          </button>
          <Link
            href="/intelligence/export"
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "var(--bg-surface)", color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 8, padding: "8px 14px", fontSize: 13, textDecoration: "none",
            }}
          >
            <Brain size={14} />
            Exportar para IA
          </Link>
        </div>
      </div>

      {/* Quick register panel */}
      {showRegister && (
        <QuickRegisterPanel onClose={() => setShowRegister(false)} onSaved={() => setShowRegister(false)} />
      )}

      {/* Barra de busca */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Search
          size={16}
          color="var(--text-muted)"
          style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
        />
        <input
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="SUV Compass, hooks vencedores, retenção alta, Meta Ads..."
          autoFocus
          style={{
            width: "100%",
            height: 46,
            paddingLeft: 42,
            paddingRight: query ? 40 : 16,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            fontSize: 14,
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 150ms",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
        />
        {query && (
          <button
            onClick={clearSearch}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Sugestões contextuais */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {SUGGESTION_QUERIES.map((s) => (
          <button
            key={s.label}
            onClick={() => applySuggestion(s)}
            style={{
              fontSize: 12, borderRadius: 20, padding: "4px 12px",
              border: "1px solid var(--border)",
              background: "var(--bg-surface)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Estado: buscando */}
      {searching && (
        <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "32px 0" }}>
          Buscando padrões...
        </p>
      )}

      {/* Estado: sem resultados */}
      {!searching && isEmpty && (
        <div style={{ textAlign: "center", padding: "48px 0" }}>
          <Search size={28} color="var(--text-muted)" style={{ margin: "0 auto 12px" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
            Nenhum resultado para esta busca
          </p>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Tente outro termo ou registre um novo padrão.
          </p>
        </div>
      )}

      {/* Resultados */}
      {!searching && hasResults && (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {results.total} resultado{results.total !== 1 ? "s" : ""} encontrado{results.total !== 1 ? "s" : ""}
          </p>

          {results.creatives.length > 0 && (
            <ResultSection title="Hooks & Criativos" icon={Zap} color="#F59E0B" count={results.creatives.length}>
              {results.creatives.map((cr) => <CreativeResult key={cr.id} creative={cr} />)}
            </ResultSection>
          )}

          {results.campaigns.length > 0 && (
            <ResultSection title="Campanhas" icon={Megaphone} color="#7C3AED" count={results.campaigns.length}>
              {results.campaigns.map((c) => <CampaignResult key={c.id} campaign={c} />)}
            </ResultSection>
          )}

          {results.insights.length > 0 && (
            <ResultSection title="Insights & Padrões" icon={Lightbulb} color="#10B981" count={results.insights.length}>
              {results.insights.map((ins) => <InsightResult key={ins.id} insight={ins} />)}
            </ResultSection>
          )}

          {results.playbooks.length > 0 && (
            <ResultSection title="Playbooks" icon={BookOpen} color="#8B5CF6" count={results.playbooks.length}>
              {results.playbooks.map((pb) => <PlaybookResult key={pb.id} playbook={pb} />)}
            </ResultSection>
          )}
        </div>
      )}

      {/* Estado inicial: sem busca — atalhos de seção */}
      {!results && !searching && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 8 }}>
          {[
            { href: "/intelligence/campaigns", icon: Megaphone, label: "Campanhas", color: "#7C3AED", desc: "Registre e recupere campanhas por veículo, plataforma e resultado" },
            { href: "/intelligence/creatives", icon: Image, label: "Biblioteca de Criativos", color: "#3B82F6", desc: "Hooks, formatos, ângulos e criativos vencedores" },
            { href: "/intelligence/insights", icon: Lightbulb, label: "Insights & Padrões", color: "#F59E0B", desc: "Aprendizados rápidos, observações e estratégias vencedoras" },
            { href: "/intelligence/playbooks", icon: BookOpen, label: "Playbooks", color: "#10B981", desc: "Estratégias estruturadas por nicho, veículo e plataforma" },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.href} href={s.href} style={{ textDecoration: "none" }}>
                <div
                  style={{
                    border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px",
                    background: "var(--bg-surface)", cursor: "pointer",
                    transition: "border-color 150ms, transform 150ms",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = s.color;
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Icon size={15} color={s.color} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{s.label}</span>
                    <ChevronRight size={13} color="var(--text-muted)" style={{ marginLeft: "auto" }} />
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{s.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Quick Register Panel ───────────────────────────────────────────────────────

function QuickRegisterPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<KindValue>("hook");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<Record<string, string>>({});

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const f = formRef.current;
    setSaving(true);

    let body: Record<string, unknown> = { kind };

    if (kind === "hook") {
      body = { kind, hook: f.hook, format: f.format, angle: f.angle, niche: f.niche, vehicleType: f.vehicleType, platform: f.platform, retention: f.retention ? Number(f.retention) : undefined, ctr: f.ctr ? Number(f.ctr) : undefined, notes: f.notes, tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [], winner: true };
    } else if (kind === "creative") {
      body = { kind, name: f.name, hook: f.hook, format: f.format, angle: f.angle, niche: f.niche, vehicleType: f.vehicleType, platform: f.platform, retention: f.retention ? Number(f.retention) : undefined, ctr: f.ctr ? Number(f.ctr) : undefined, cpl: f.cpl ? Number(f.cpl) : undefined, notes: f.notes, tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [] };
    } else if (kind === "insight") {
      body = { kind, content: f.content, type: f.type || "OBSERVATION", niche: f.niche, vehicleType: f.vehicleType, platform: f.platform, tags: f.tags ? f.tags.split(",").map((t) => t.trim()).filter(Boolean) : [], starred: false };
    } else if (kind === "playbook") {
      body = { kind, name: f.name, summary: f.summary, niche: f.niche, vehicleType: f.vehicleType, platform: f.platform, objective: f.objective };
    }

    const res = await fetch("/api/intelligence/pattern", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (res.ok) {
      setSuccess(true);
      formRef.current = {};
      setTimeout(() => { setSuccess(false); onSaved(); }, 1200);
    }
  }

  const selectedKind = KIND_OPTIONS.find((k) => k.value === kind)!;

  return (
    <div style={{
      border: "1px solid var(--border)", borderRadius: 14, marginBottom: 24,
      background: "var(--bg-surface)", overflow: "hidden",
    }}>
      {/* Kind selector */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
        {KIND_OPTIONS.map((k) => {
          const Icon = k.icon;
          const active = kind === k.value;
          return (
            <button
              key={k.value}
              onClick={() => setKind(k.value)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 8px", border: "none", cursor: "pointer",
                background: active ? "var(--bg-surface)" : "transparent",
                color: active ? k.color : "var(--text-muted)",
                fontSize: 12, fontWeight: active ? 600 : 400,
                borderBottom: active ? `2px solid ${k.color}` : "2px solid transparent",
                transition: "all 120ms",
              }}
            >
              <Icon size={13} />
              {k.label}
            </button>
          );
        })}
        <button
          onClick={onClose}
          style={{ padding: "10px 14px", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
        >
          <X size={14} />
        </button>
      </div>

      <form onSubmit={handleSave} style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{selectedKind.desc}</p>

        {/* Hook */}
        {(kind === "hook" || kind === "creative") && (
          <QField label={kind === "hook" ? "Hook *" : "Nome do criativo *"}>
            {kind === "hook" ? (
              <QInput placeholder="Ex: Você ainda dirige o carro errado?" onChange={(v) => { formRef.current.hook = v; }} required />
            ) : (
              <QInput placeholder="Ex: Video POV cliente satisfeito" onChange={(v) => { formRef.current.name = v; }} required />
            )}
          </QField>
        )}

        {kind === "creative" && (
          <QField label="Hook *">
            <QInput placeholder="Ex: Você ainda dirige o carro errado?" onChange={(v) => { formRef.current.hook = v; }} required />
          </QField>
        )}

        {kind === "insight" && (
          <QField label="Aprendizado *">
            <textarea
              rows={3}
              required
              placeholder="SUVs performaram melhor com POV interno nas primeiras 3 semanas..."
              onChange={(e) => { formRef.current.content = e.target.value; }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).form?.requestSubmit(); }}
              style={textareaStyle}
            />
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>Ctrl+Enter para salvar</p>
          </QField>
        )}

        {kind === "playbook" && (
          <>
            <QField label="Nome do playbook *">
              <QInput placeholder="Ex: SUV Premium — Meta Ads" onChange={(v) => { formRef.current.name = v; }} required />
            </QField>
            <QField label="Resumo estratégico *">
              <textarea rows={3} required placeholder="Estratégia de topo de funil com criativos POV..." onChange={(e) => { formRef.current.summary = e.target.value; }} style={textareaStyle} />
            </QField>
          </>
        )}

        {/* Grid de contexto */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {(kind === "hook" || kind === "creative") && (
            <QField label="Formato *">
              <select required onChange={(e) => { formRef.current.format = e.target.value; }} style={selectStyle}>
                <option value="">Selecionar</option>
                {FORMATS.map((f) => <option key={f}>{f}</option>)}
              </select>
            </QField>
          )}
          {(kind === "hook" || kind === "creative") && (
            <QField label="Ângulo">
              <select onChange={(e) => { formRef.current.angle = e.target.value; }} style={selectStyle}>
                <option value="">Selecionar</option>
                {ANGLES.map((a) => <option key={a}>{a}</option>)}
              </select>
            </QField>
          )}
          {kind === "insight" && (
            <QField label="Tipo">
              <select onChange={(e) => { formRef.current.type = e.target.value; }} style={selectStyle}>
                {INSIGHT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </QField>
          )}
          <QField label="Nicho">
            <QInput placeholder="Ex: Automotivo" onChange={(v) => { formRef.current.niche = v; }} />
          </QField>
          <QField label="Veículo">
            <QInput placeholder="Ex: SUV, Sedan" onChange={(v) => { formRef.current.vehicleType = v; }} />
          </QField>
          <QField label="Plataforma">
            <select onChange={(e) => { formRef.current.platform = e.target.value; }} style={selectStyle}>
              <option value="">Selecionar</option>
              {["Meta Ads", "Google Ads", "TikTok Ads", "YouTube Ads"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </QField>
          {kind === "playbook" && (
            <QField label="Objetivo">
              <QInput placeholder="Ex: Leads, Vendas" onChange={(v) => { formRef.current.objective = v; }} />
            </QField>
          )}
        </div>

        {/* Métricas (opcional para hook/creative) */}
        {(kind === "hook" || kind === "creative") && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            <QField label="Retenção (%)">
              <QInput type="number" placeholder="Ex: 72" onChange={(v) => { formRef.current.retention = v; }} />
            </QField>
            <QField label="CTR (%)">
              <QInput type="number" placeholder="Ex: 2.4" onChange={(v) => { formRef.current.ctr = v; }} />
            </QField>
            {kind === "creative" && (
              <QField label="CPL (R$)">
                <QInput type="number" placeholder="Ex: 18.50" onChange={(v) => { formRef.current.cpl = v; }} />
              </QField>
            )}
          </div>
        )}

        {/* Observações e tags */}
        {(kind === "hook" || kind === "creative") && (
          <QField label="Observação">
            <QInput placeholder="O que funcionou, contexto da campanha..." onChange={(v) => { formRef.current.notes = v; }} />
          </QField>
        )}

        <QField label="Tags">
          <QInput placeholder="suv, meta, hook, premium..." onChange={(v) => { formRef.current.tags = v; }} />
        </QField>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: success ? "#10B981" : "var(--accent)",
              color: "#fff", border: "none", borderRadius: 8,
              padding: "9px 18px", fontSize: 13, fontWeight: 500, cursor: "pointer",
              transition: "background 200ms",
            }}
          >
            {success ? "Salvo!" : saving ? "Salvando..." : "Registrar padrão"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Result cards ───────────────────────────────────────────────────────────────

function ResultSection({
  title, icon: Icon, color, count, children,
}: {
  title: string; icon: React.ElementType; color: string; count: number; children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          {title}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 5, padding: "1px 6px" }}>
          {count}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function CreativeResult({ creative: cr }: { creative: SearchCreative }) {
  const metrics = [
    cr.retention != null ? `${cr.retention}% ret.` : null,
    cr.ctr != null ? `${cr.ctr}% CTR` : null,
  ].filter(Boolean);

  const meta = [cr.format, cr.angle, cr.niche, cr.vehicleType].filter(Boolean);

  return (
    <div style={{
      border: `1px solid ${cr.winner ? "#F59E0B44" : "var(--border)"}`,
      borderRadius: 10, padding: "12px 14px",
      background: cr.winner ? "linear-gradient(90deg, #F59E0B06, var(--bg-surface))" : "var(--bg-surface)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            {cr.winner && <Trophy size={12} color="#F59E0B" />}
            {cr.starred && !cr.winner && <Star size={12} color="#3B82F6" fill="#3B82F6" />}
            <p style={{ fontSize: 13, color: "var(--text-primary)", fontStyle: "italic", lineHeight: 1.4 }}>
              "{cr.hook}"
            </p>
          </div>
          {meta.length > 0 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
              {meta.map((m) => (
                <span key={m} style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 4, padding: "1px 6px" }}>
                  {m}
                </span>
              ))}
            </div>
          )}
          {metrics.length > 0 && (
            <div style={{ display: "flex", gap: 10 }}>
              {metrics.map((m) => (
                <span key={m} style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)" }}>{m}</span>
              ))}
            </div>
          )}
          {cr.notes && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.4 }}>{cr.notes}</p>
          )}
          {cr.campaign && (
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              {cr.campaign.client.name} · {cr.campaign.name}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function CampaignResult({ campaign: c }: { campaign: SearchCampaign }) {
  const m = c.metrics[0];
  return (
    <div style={{
      border: `1px solid ${c.winner ? "#7C3AED33" : "var(--border)"}`,
      borderRadius: 10, padding: "12px 14px",
      background: "var(--bg-surface)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      {c.winner && <Trophy size={13} color="#F59E0B" style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{c.name}</p>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.client.brand ?? c.client.name}</span>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.platform}</span>
          {c.vehicle && <><span style={{ fontSize: 10, color: "var(--text-muted)" }}>·</span><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.vehicle}</span></>}
        </div>
      </div>
      {m && (
        <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
          {m.cpl != null && <MiniStat label="CPL" value={`R$ ${m.cpl}`} />}
          {m.ctr != null && <MiniStat label="CTR" value={`${m.ctr}%`} />}
          {m.retention != null && <MiniStat label="Ret." value={`${m.retention}%`} />}
        </div>
      )}
    </div>
  );
}

function InsightResult({ insight: ins }: { insight: SearchInsight }) {
  const TYPE_COLOR: Record<string, string> = {
    PATTERN: "#3B82F6", WINNING_STRATEGY: "#10B981", WARNING: "#EF4444",
    OBSERVATION: "#6B7280", HYPOTHESIS: "#8B5CF6",
  };
  const color = TYPE_COLOR[ins.type] ?? "#6B7280";
  const meta = [ins.niche, ins.vehicleType].filter(Boolean).join(" · ");

  return (
    <div style={{
      borderLeft: `3px solid ${color}`, borderRadius: 8, padding: "10px 14px",
      background: ins.starred ? "linear-gradient(90deg, #F59E0B06, var(--bg-surface))" : "var(--bg-surface)",
      border: `1px solid ${ins.starred ? "#F59E0B33" : "var(--border)"}`,
      borderLeftColor: color,
    }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {ins.starred && <Star size={11} color="#F59E0B" fill="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />}
        <div>
          <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{ins.content}</p>
          {(meta || ins.campaign) && (
            <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
              {meta}{meta && ins.campaign ? " · " : ""}{ins.campaign ? `${ins.campaign.client.name} — ${ins.campaign.name}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PlaybookResult({ playbook: pb }: { playbook: SearchPlaybook }) {
  return (
    <div style={{
      border: `1px solid ${pb.starred ? "#8B5CF633" : "var(--border)"}`,
      borderRadius: 10, padding: "12px 14px",
      background: "var(--bg-surface)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {pb.starred && <Star size={11} color="#8B5CF6" fill="#8B5CF6" />}
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{pb.name}</p>
        {[pb.niche, pb.vehicleType, pb.platform].filter(Boolean).map((m) => (
          <span key={m} style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 4, padding: "1px 6px" }}>{m}</span>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{pb.summary}</p>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function QField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function QInput({ placeholder, onChange, required, type }: { placeholder?: string; onChange: (v: string) => void; required?: boolean; type?: string }) {
  return (
    <input
      type={type ?? "text"}
      placeholder={placeholder}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      style={inputStyle}
    />
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border)", borderRadius: 7,
  background: "var(--bg-base)", color: "var(--text-primary)",
  padding: "7px 10px", fontSize: 12, outline: "none", boxSizing: "border-box",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  resize: "none",
  lineHeight: 1.5,
};
