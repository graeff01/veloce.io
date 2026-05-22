"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, Lightbulb, Plus, Star, X } from "lucide-react";
import Link from "next/link";

type InsightType = "OBSERVATION" | "PATTERN" | "WARNING" | "WINNING_STRATEGY" | "HYPOTHESIS";

interface GlobalInsight {
  id: string;
  content: string;
  type: InsightType;
  niche?: string | null;
  vehicleType?: string | null;
  platform?: string | null;
  starred: boolean;
  tags: string[];
  source?: string | null;
  createdAt: string;
  _scope: "global";
}

interface CampaignInsight {
  id: string;
  content: string;
  type: InsightType;
  starred: boolean;
  tags: string[];
  createdAt: string;
  campaign: { id: string; name: string; client: { name: string } };
  _scope: "campaign";
}

type Insight = GlobalInsight | CampaignInsight;

const TYPE_LABELS: Record<InsightType, string> = {
  OBSERVATION: "Observação",
  PATTERN: "Padrão",
  WARNING: "Aviso",
  WINNING_STRATEGY: "Estratégia vencedora",
  HYPOTHESIS: "Hipótese",
};

const TYPE_COLORS: Record<InsightType, string> = {
  OBSERVATION: "#6B7280",
  PATTERN: "#3B82F6",
  WARNING: "#EF4444",
  WINNING_STRATEGY: "#10B981",
  HYPOTHESIS: "#8B5CF6",
};

export function InsightsPage() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<InsightType | "">("");
  const [filterStarred, setFilterStarred] = useState(false);

  // Quick-insert state
  const [quickText, setQuickText] = useState("");
  const [quickType, setQuickType] = useState<InsightType>("OBSERVATION");
  const [quickTags, setQuickTags] = useState("");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/insights")
      .then((r) => r.ok ? r.json() : { global: [], campaign: [] })
      .then(({ global, campaign }) => {
        const g: Insight[] = (global ?? []).map((i: GlobalInsight) => ({ ...i, _scope: "global" as const }));
        const c: Insight[] = (campaign ?? []).map((i: CampaignInsight) => ({ ...i, _scope: "campaign" as const }));
        const all = [...g, ...c].sort((a, b) => {
          if (a.starred !== b.starred) return a.starred ? -1 : 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setInsights(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleQuickSave() {
    if (!quickText.trim()) return;
    setSaving(true);
    const res = await fetch("/api/insights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: quickText.trim(),
        type: quickType,
        tags: quickTags ? quickTags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      }),
    });
    if (res.ok) {
      setQuickText("");
      setQuickTags("");
      setQuickType("OBSERVATION");
      load();
    }
    setSaving(false);
  }

  async function handleStar(ins: Insight) {
    const scope = ins._scope;
    await fetch(`/api/insights/${ins.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, starred: !ins.starred }),
    });
    setInsights((prev) => prev.map((i) => i.id === ins.id ? { ...i, starred: !i.starred } : i));
  }

  async function handleDelete(ins: Insight) {
    await fetch(`/api/insights/${ins.id}?scope=${ins._scope}`, { method: "DELETE" });
    setInsights((prev) => prev.filter((i) => i.id !== ins.id));
  }

  const filtered = insights.filter((i) => {
    if (filterStarred && !i.starred) return false;
    if (filterType && i.type !== filterType) return false;
    return true;
  });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px", background: "var(--bg-base)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <Link href="/intelligence" style={{ color: "var(--text-muted)", display: "flex" }}>
          <ChevronLeft size={18} />
        </Link>
        <Lightbulb size={18} color="#F59E0B" />
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
          Insights
        </h1>
        <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 6, padding: "2px 8px" }}>
          {insights.length}
        </span>
      </div>

      {/* Quick-insert */}
      <div
        style={{
          border: "1px solid var(--border)", borderRadius: 12,
          background: "var(--bg-surface)", padding: "16px 18px", marginBottom: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Plus size={14} color="#F59E0B" />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Novo insight</span>
        </div>
        <textarea
          value={quickText}
          onChange={(e) => setQuickText(e.target.value)}
          placeholder="SUVs performaram melhor com POV interno nas primeiras 3 semanas..."
          rows={2}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleQuickSave(); }}
          style={{
            width: "100%", border: "1px solid var(--border)", borderRadius: 8,
            background: "var(--bg-base)", color: "var(--text-primary)",
            padding: "8px 10px", fontSize: 13, outline: "none",
            resize: "none", boxSizing: "border-box", lineHeight: 1.5,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
          <select
            value={quickType}
            onChange={(e) => setQuickType(e.target.value as InsightType)}
            style={{
              border: "1px solid var(--border)", borderRadius: 7, background: "var(--bg-base)",
              color: "var(--text-primary)", padding: "6px 8px", fontSize: 12, outline: "none",
            }}
          >
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <input
            placeholder="tags: suv, meta, hook..."
            value={quickTags}
            onChange={(e) => setQuickTags(e.target.value)}
            style={{
              flex: 1, border: "1px solid var(--border)", borderRadius: 7,
              background: "var(--bg-base)", color: "var(--text-primary)",
              padding: "6px 10px", fontSize: 12, outline: "none",
            }}
          />
          <button
            onClick={handleQuickSave}
            disabled={saving || !quickText.trim()}
            style={{
              background: "var(--accent)", color: "#fff", border: "none",
              borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 500,
              cursor: "pointer", opacity: !quickText.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
          Ctrl+Enter para salvar rapidamente
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <FilterChip active={filterStarred} onClick={() => setFilterStarred((v) => !v)}>
          <Star size={11} /> Estrelados
        </FilterChip>
        {Object.entries(TYPE_LABELS).map(([v, l]) => (
          <FilterChip
            key={v}
            active={filterType === v}
            color={TYPE_COLORS[v as InsightType]}
            onClick={() => setFilterType(filterType === v ? "" : v as InsightType)}
          >
            {l}
          </FilterChip>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Carregando...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
          Nenhum insight encontrado. Use o campo acima para registrar o primeiro.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((ins) => (
            <InsightRow key={ins.id} insight={ins} onStar={() => handleStar(ins)} onDelete={() => handleDelete(ins)} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightRow({
  insight: ins,
  onStar,
  onDelete,
}: {
  insight: Insight;
  onStar: () => void;
  onDelete: () => void;
}) {
  const color = TYPE_COLORS[ins.type];
  const label = TYPE_LABELS[ins.type];

  return (
    <div
      style={{
        border: `1px solid ${ins.starred ? "#F59E0B44" : "var(--border)"}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 8,
        padding: "12px 14px",
        background: ins.starred ? "linear-gradient(90deg, #F59E0B08, var(--bg-surface))" : "var(--bg-surface)",
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
          <span
            style={{
              fontSize: 10, fontWeight: 600,
              color,
              background: `${color}18`,
              borderRadius: 5, padding: "2px 7px",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {label}
          </span>
          {ins._scope === "campaign" && (
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {ins.campaign.client.name} · {ins.campaign.name}
            </span>
          )}
          {ins.tags.length > 0 && ins.tags.map((t) => (
            <span key={t} style={{ fontSize: 10, color: "var(--text-muted)", background: "var(--bg-elevated)", borderRadius: 4, padding: "1px 5px" }}>
              {t}
            </span>
          ))}
        </div>
        <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{ins.content}</p>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          onClick={onStar}
          style={{ background: "none", border: "none", cursor: "pointer", color: ins.starred ? "#F59E0B" : "var(--text-muted)", padding: 4 }}
        >
          <Star size={13} fill={ins.starred ? "#F59E0B" : "none"} />
        </button>
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4 }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function FilterChip({ children, active, color, onClick }: { children: React.ReactNode; active: boolean; color?: string; onClick: () => void }) {
  const c = color ?? "var(--accent)";
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        border: `1px solid ${active ? c : "var(--border)"}`,
        background: active ? `${c}18` : "var(--bg-surface)",
        color: active ? c : "var(--text-secondary)",
        borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
