"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Lightbulb, Plus, Search, X, Pin, ChevronDown, ChevronUp,
  Loader2, Filter, Zap, ExternalLink,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface BrainItem {
  id: string;
  clientId?: string | null;
  title: string;
  content?: string | null;
  category: string;
  links: string[];
  tags: string[];
  pinned: boolean;
  createdAt: string;
  client?: { id: string; name: string } | null;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const CATEGORIES = ["Estratégia","Campanha","Concorrência","Referência","Insight","Oportunidade"];

const CAT_CONFIG: Record<string, { color: string; bg: string }> = {
  Estratégia:   { color: "#4338CA", bg: "rgba(67,56,202,0.12)"  },
  Campanha:     { color: "#B45309", bg: "rgba(180,83,9,0.12)"   },
  Concorrência: { color: "#DC2626", bg: "rgba(220,38,38,0.12)"  },
  Referência:   { color: "#0F766E", bg: "rgba(15,118,110,0.12)" },
  Insight:      { color: "#7C3AED", bg: "rgba(124,58,237,0.12)" },
  Oportunidade: { color: "#15803D", bg: "rgba(21,128,61,0.12)"  },
};

function getCat(cat: string) {
  return CAT_CONFIG[cat] ?? { color: "#6366F1", bg: "rgba(99,102,241,0.12)" };
}

// ── Brain card ─────────────────────────────────────────────────────────────────

function Card({
  item,
  onPin,
  onDelete,
}: {
  item: BrainItem;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { color, bg } = getCat(item.category);

  return (
    <div style={{
      display: "flex", alignItems: "stretch",
      borderRadius: 12,
      border: `1px solid ${item.pinned ? color + "44" : "var(--border)"}`,
      background: "var(--bg-surface)",
      transition: "box-shadow 150ms",
      overflow: "hidden",
    }}
      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)")}
      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.boxShadow = "none")}
    >
      {/* Left color bar */}
      <div style={{ width: 3, background: item.pinned ? color : "var(--border)", flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "14px 16px", position: "relative" }}>
      {/* Pin indicator */}
      {item.pinned && (
        <div style={{ position: "absolute", top: 10, right: 10, width: 6, height: 6, borderRadius: "50%", background: color }} />
      )}

      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* Category dot */}
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 5 }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + category */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", margin: 0, lineHeight: 1.3 }}>
              {item.title}
            </h3>
            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: bg, color, fontWeight: 600 }}>
              {item.category}
            </span>
            {item.client && (
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, background: "var(--bg-elevated)", color: "var(--text-muted)", fontWeight: 500 }}>
                {item.client.name}
              </span>
            )}
          </div>

          {/* Preview / expanded content */}
          {item.content && (
            <>
              {expanded ? (
                <p style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 6, whiteSpace: "pre-wrap" }}>
                  {item.content}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {item.content}
                </p>
              )}
            </>
          )}

          {/* Links */}
          {item.links.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {item.links.map((l, i) => (
                <a key={i} href={l} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color, padding: "2px 7px", borderRadius: 6, background: `${color}18`, textDecoration: "none" }}>
                  <ExternalLink size={9} />{l.replace(/^https?:\/\//, "").slice(0, 30)}
                </a>
              ))}
            </div>
          )}

          {/* Tags */}
          {item.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {item.tags.map(t => (
                <span key={t} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 20, background: "var(--bg-elevated)", color: "var(--text-muted)" }}>#{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
          {item.content && (
            <button onClick={() => setExpanded(v => !v)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 3 }}>
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}
          <button
            onClick={() => onPin(item.id, !item.pinned)}
            style={{ border: "none", background: "transparent", cursor: "pointer", color: item.pinned ? color : "var(--text-muted)", display: "flex", padding: 3 }}
            title={item.pinned ? "Desafixar" : "Fixar"}
          >
            <Pin size={13} />
          </button>
          <button onClick={() => onDelete(item.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex", padding: 3, opacity: 0.5 }}>
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Date */}
      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, textAlign: "right" }}>
        {new Date(item.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
      </p>
      </div>
    </div>
  );
}

// ── Create modal ───────────────────────────────────────────────────────────────

function CreateModal({
  onClose,
  onSaved,
  clients,
}: {
  onClose: () => void;
  onSaved: (item: BrainItem) => void;
  clients: { id: string; name: string }[];
}) {
  const [title,    setTitle]    = useState("");
  const [content,  setContent]  = useState("");
  const [category, setCategory] = useState("Insight");
  const [clientId, setClientId] = useState<string>("global");
  const [linkDraft, setLinkDraft] = useState("");
  const [links,    setLinks]    = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [tags,     setTags]     = useState<string[]>([]);
  const [saving,   setSaving]   = useState(false);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(), content: content || null, category,
        clientId: clientId === "global" ? null : clientId,
        links, tags,
      }),
    });
    setSaving(false);
    if (res.ok) { onSaved(await res.json()); }
  }

  const sel: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 13, outline: "none", width: "100%" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ width: 540, background: "var(--bg-surface)", borderRadius: 16, border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lightbulb size={16} color="#A855F7" />
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>Nova ideia</span>
          </div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={16} /></button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="Qual é a ideia?" style={{ ...sel, fontSize: 15, fontWeight: 600 }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={sel}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Cliente (opcional)</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={sel}>
                <option value="global">Global (nenhum)</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Conteúdo</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4} placeholder="Detalhe, contexto, referências, análise..." style={{ ...sel, resize: "none", lineHeight: 1.6 }} />
          </div>

          {/* Links */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Links</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={linkDraft} onChange={e => setLinkDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (linkDraft.trim()) { setLinks(p => [...p, linkDraft.trim()]); setLinkDraft(""); } } }} placeholder="https://..." style={{ ...sel, flex: 1 }} />
              <button onClick={() => { if (linkDraft.trim()) { setLinks(p => [...p, linkDraft.trim()]); setLinkDraft(""); } }} style={{ padding: "8px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Add</button>
            </div>
            {links.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{links.map((l, i) => <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11 }}>{l.slice(0, 40)}<button onClick={() => setLinks(p => p.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex" }}><X size={9} /></button></span>)}</div>}
          </div>

          {/* Tags */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Tags</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={tagDraft} onChange={e => setTagDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (tagDraft.trim()) { setTags(p => [...p, tagDraft.trim()]); setTagDraft(""); } } }} placeholder="meta-ads, black-friday..." style={{ ...sel, flex: 1 }} />
            </div>
            {tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>{tags.map((t, i) => <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 20, background: "var(--bg-elevated)", fontSize: 11 }}>#{t}<button onClick={() => setTags(p => p.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex" }}><X size={9} /></button></span>)}</div>}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
          <button onClick={save} disabled={!title.trim() || saving} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, border: "none", background: title.trim() ? "#A855F7" : "var(--bg-elevated)", color: title.trim() ? "#fff" : "var(--text-muted)", cursor: title.trim() ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}>
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Lightbulb size={13} />} Salvar ideia
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main hub ───────────────────────────────────────────────────────────────────

export function BrainHub() {
  const [items,    setItems]    = useState<BrainItem[]>([]);
  const [clients,  setClients]  = useState<{ id: string; name: string }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(false);
  const [q,        setQ]        = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [scope,    setScope]    = useState<"all" | "global" | string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (scope === "global") params.set("clientId", "global");
    else if (scope !== "all") params.set("clientId", scope);
    if (q) params.set("q", q);
    if (catFilter !== "all") params.set("category", catFilter);
    const res = await fetch(`/api/brain?${params}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [scope, q, catFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/clients").then(r => r.ok ? r.json() : { clients: [] }).then((d: { clients?: { id: string; name: string }[] } | { id: string; name: string }[]) => {
      setClients(Array.isArray(d) ? d : (d.clients ?? []));
    });
  }, []);

  async function handlePin(id: string, pinned: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, pinned } : i));
    await fetch(`/api/brain/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned }) });
  }

  async function handleDelete(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(`/api/brain/${id}`, { method: "DELETE" });
  }

  const pinned   = items.filter(i => i.pinned);
  const unpinned = items.filter(i => !i.pinned);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>

      {/* Header */}
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: "16px 28px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(168,85,247,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Lightbulb size={18} color="#A855F7" />
            </div>
            <div>
              <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)", margin: 0 }}>Brain</h1>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>Central de ideias, insights e estratégia</p>
            </div>
          </div>
          <button
            onClick={() => setModal(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "none", background: "#A855F7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nova ideia
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 320 }}>
            <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar ideias..."
              style={{ width: "100%", padding: "7px 10px 7px 30px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 13, outline: "none" }}
            />
          </div>

          {/* Scope */}
          <select value={scope} onChange={e => setScope(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-secondary)", fontSize: 12, outline: "none" }}>
            <option value="all">Todos</option>
            <option value="global">Global</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Category filter */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {["all", ...CATEGORIES].map(c => {
              const active = catFilter === c;
              const cfg = c !== "all" ? getCat(c) : null;
              return (
                <button key={c} onClick={() => setCatFilter(c)} style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid", borderColor: active ? (cfg?.color ?? "var(--accent)") : "var(--border)", background: active ? (cfg?.bg ?? "var(--accent-soft)") : "transparent", color: active ? (cfg?.color ?? "var(--accent)") : "var(--text-muted)", fontSize: 11, fontWeight: active ? 600 : 400, cursor: "pointer" }}>
                  {c === "all" ? "Tudo" : c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
            <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} />
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: "center", paddingTop: 80, color: "var(--text-muted)" }}>
            <Lightbulb size={48} style={{ opacity: 0.2, margin: "0 auto 16px" }} />
            <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Nenhuma ideia ainda</p>
            <p style={{ fontSize: 13, marginBottom: 20 }}>Capture insights, estratégias e referências aqui.</p>
            <button onClick={() => setModal(true)} style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "#A855F7", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Capturar primeira ideia
            </button>
          </div>
        ) : (
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {pinned.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 12 }}>
                  <Pin size={10} style={{ display: "inline", marginRight: 5 }} />Fixadas
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {pinned.map(i => <Card key={i.id} item={i} onPin={handlePin} onDelete={handleDelete} />)}
                </div>
              </div>
            )}
            {unpinned.length > 0 && (
              <div>
                {pinned.length > 0 && <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 12 }}>Todas as ideias</p>}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                  {unpinned.map(i => <Card key={i.id} item={i} onPin={handlePin} onDelete={handleDelete} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {modal && <CreateModal onClose={() => setModal(false)} onSaved={item => { setItems(prev => [item, ...prev]); setModal(false); }} clients={clients} />}
    </div>
  );
}
