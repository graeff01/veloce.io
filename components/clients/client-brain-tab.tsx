"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, X, Loader2, Lightbulb, Pin, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BrainItem {
  id: string;
  title: string;
  content?: string | null;
  category: string;
  links: string[];
  tags: string[];
  pinned: boolean;
  createdAt: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Insight","Estratégia","Campanha","Concorrência",
  "Referência","Oportunidade","Ideia","Observação",
];

const CAT_COLOR: Record<string, string> = {
  Insight:       "#7C3AED",
  Estratégia:    "#4338CA",
  Campanha:      "#B45309",
  Concorrência:  "#DC2626",
  Referência:    "#0F766E",
  Oportunidade:  "#15803D",
  Ideia:         "#D97706",
  Observação:    "#6366F1",
};

function getCatColor(cat: string) { return CAT_COLOR[cat] ?? "#6366F1"; }

// ── Brain Card ─────────────────────────────────────────────────────────────────

function BrainCard({
  item,
  onPin,
  onDelete,
}: {
  item: BrainItem;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = getCatColor(item.category);

  return (
    <div
      style={{
        display: "flex", alignItems: "stretch",
        borderRadius: 10,
        border: `1px solid ${item.pinned ? `${color}44` : "var(--border)"}`,
        background: "var(--bg-surface)",
        overflow: "hidden",
        transition: "box-shadow 150ms",
      }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.07)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = "none")}
    >
      {/* Left color bar */}
      <div style={{ width: 3, background: color, flexShrink: 0 }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 14px" }}>
        {/* Title row */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: "var(--text-primary)", lineHeight: "18px",
            }}>
              {item.title}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color,
                padding: "1px 7px", borderRadius: 20,
                background: `${color}18`,
              }}>
                {item.category}
              </span>
              {item.pinned && (
                <span style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  fixado
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {item.content && (
              <button
                onClick={() => setExpanded(v => !v)}
                style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 2 }}
              >
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
            <button
              onClick={() => onPin(item.id, !item.pinned)}
              title={item.pinned ? "Desafixar" : "Fixar"}
              style={{
                border: "none", background: "transparent", cursor: "pointer",
                color: item.pinned ? color : "var(--text-muted)",
                display: "flex", padding: 2, opacity: item.pinned ? 1 : 0.45,
                transition: "opacity 150ms, color 150ms",
              }}
            >
              <Pin size={12} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 2, opacity: 0.35 }}
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {expanded && item.content && (
          <p style={{
            fontSize: 12, color: "var(--text-secondary)",
            lineHeight: 1.6, marginTop: 10,
            padding: "10px 12px",
            background: "var(--bg-base)",
            borderRadius: 8,
            border: "1px solid var(--border)",
          }}>
            {item.content}
          </p>
        )}

        {/* Links */}
        {item.links.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {item.links.map((link, i) => (
              <a
                key={i}
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 10, color, textDecoration: "none",
                  padding: "2px 8px", borderRadius: 20,
                  background: `${color}14`, border: `1px solid ${color}33`,
                  fontWeight: 500,
                }}
              >
                link {i + 1}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick Capture ──────────────────────────────────────────────────────────────

function QuickCapture({ clientId, onAdded }: { clientId: string; onAdded: (b: BrainItem) => void }) {
  const [title,    setTitle]    = useState("");
  const [content,  setContent]  = useState("");
  const [category, setCategory] = useState("Insight");
  const [saving,   setSaving]   = useState(false);
  const [focused,  setFocused]  = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId, title: title.trim(),
        content: content.trim() || null,
        category, links: [], tags: [],
      }),
    });
    setSaving(false);
    if (res.ok) {
      const b = await res.json();
      onAdded(b);
      setTitle("");
      setContent("");
      setFocused(false);
    }
  }

  const color = getCatColor(category);

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${focused ? color : "var(--border)"}`,
      background: "var(--bg-surface)",
      overflow: "hidden",
      transition: "border-color 150ms",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
        <Lightbulb size={14} color={focused ? color : "var(--text-muted)"} style={{ flexShrink: 0 }} />
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) submit();
            if (e.key === "Escape") { setFocused(false); setTitle(""); setContent(""); }
          }}
          placeholder="Capturar ideia, insight ou estratégia..."
          style={{
            flex: 1, border: "none", background: "transparent",
            fontSize: 13, color: "var(--text-primary)", outline: "none",
          }}
        />
        {saving && <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color, flexShrink: 0 }} />}
      </div>

      {focused && (
        <>
          <div style={{ padding: "0 14px 8px" }}>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Detalhes, contexto, referências... (opcional)"
              rows={3}
              style={{
                width: "100%", resize: "none",
                border: "1px solid var(--border)", borderRadius: 8,
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: 12, padding: "8px 10px", outline: "none",
                lineHeight: 1.5,
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderTop: "1px solid var(--border)" }}>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              style={{
                padding: "4px 8px", borderRadius: 7,
                border: "1px solid var(--border)",
                background: "var(--bg-base)",
                fontSize: 12, color: "var(--text-secondary)", outline: "none",
              }}
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ flex: 1 }} />
            <button
              onClick={() => { setFocused(false); setTitle(""); setContent(""); }}
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}
            >
              <X size={13} />
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || saving}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "6px 14px", borderRadius: 8, border: "none",
                background: title.trim() ? color : "var(--bg-elevated)",
                color: title.trim() ? "#fff" : "var(--text-muted)",
                fontSize: 12, fontWeight: 600,
                cursor: title.trim() ? "pointer" : "default",
                transition: "background 150ms",
              }}
            >
              <Lightbulb size={11} /> Salvar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ClientBrainTab({ clientId }: { clientId: string }) {
  const [items,       setItems]       = useState<BrainItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [catFilter,   setCatFilter]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/brain?clientId=${clientId}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [clientId]);

  useEffect(() => { load(); }, [load]);

  async function handlePin(id: string, pinned: boolean) {
    setItems(prev => prev.map(b => b.id === id ? { ...b, pinned } : b));
    await fetch(`/api/brain/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });
  }

  async function handleDelete(id: string) {
    setItems(prev => prev.filter(b => b.id !== id));
    await fetch(`/api/brain/${id}`, { method: "DELETE" });
  }

  const filtered = catFilter ? items.filter(b => b.category === catFilter) : items;
  const pinned   = filtered.filter(b => b.pinned);
  const rest     = filtered.filter(b => !b.pinned);

  const usedCats = [...new Set(items.map(b => b.category))];

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px 48px" }}>

      {/* Quick capture */}
      <QuickCapture clientId={clientId} onAdded={b => setItems(prev => [b, ...prev])} />

      {/* Category filter chips */}
      {usedCats.length > 1 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
          <button
            onClick={() => setCatFilter(null)}
            style={{
              padding: "4px 10px", borderRadius: 20, border: "1px solid",
              borderColor: !catFilter ? "var(--accent)" : "var(--border)",
              background: !catFilter ? "var(--accent-soft)" : "transparent",
              color: !catFilter ? "var(--accent)" : "var(--text-muted)",
              fontSize: 11, fontWeight: 500, cursor: "pointer",
            }}
          >
            Tudo
          </button>
          {usedCats.map(cat => {
            const color = getCatColor(cat);
            const active = catFilter === cat;
            return (
              <button
                key={cat}
                onClick={() => setCatFilter(active ? null : cat)}
                style={{
                  padding: "4px 10px", borderRadius: 20, border: "1px solid",
                  borderColor: active ? color : "var(--border)",
                  background: active ? `${color}18` : "transparent",
                  color: active ? color : "var(--text-muted)",
                  fontSize: 11, fontWeight: active ? 700 : 500, cursor: "pointer",
                  transition: "all 120ms",
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
        </div>
      )}

      {!loading && items.length === 0 && (
        <div style={{ textAlign: "center", padding: "52px 0", color: "var(--text-muted)" }}>
          <Lightbulb size={36} style={{ opacity: 0.12, margin: "0 auto 14px", display: "block" }} />
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
            Nenhuma ideia capturada
          </p>
          <p style={{ fontSize: 12, opacity: 0.65, maxWidth: 300, margin: "0 auto" }}>
            Salve insights, estratégias, referências e oportunidades sobre este cliente.
          </p>
        </div>
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Pin size={11} color="var(--text-muted)" />
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
              Fixados
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20 }}>
            {pinned.map(b => (
              <BrainCard key={b.id} item={b} onPin={handlePin} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}

      {/* All */}
      {rest.length > 0 && (
        <>
          {pinned.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
                Todos
              </span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rest.map(b => (
              <BrainCard key={b.id} item={b} onPin={handlePin} onDelete={handleDelete} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
