"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ExternalLink, Loader2, Info } from "lucide-react";

interface Competitor {
  id: string;
  name: string;
  pageId: string | null;
  region: string;
  notes: string | null;
}

// Deep-link para a Ad Library PÚBLICA da Meta, já filtrada no concorrente.
function adLibraryUrl(c: Competitor): string {
  const base = "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&media_type=all";
  const country = c.region || "BR";
  if (c.pageId) return `${base}&country=${country}&view_all_page_id=${encodeURIComponent(c.pageId)}`;
  return `${base}&country=${country}&q=${encodeURIComponent(c.name)}&search_type=keyword_unordered`;
}

export function CompetitorsTab({ clientId }: { clientId: string }) {
  const [list, setList] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/competitors`);
    if (res.ok) setList((await res.json()).competitors ?? []);
    setLoading(false);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/competitors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), pageId: pageId.trim() || undefined }),
    });
    setSaving(false);
    if (res.ok) { setName(""); setPageId(""); load(); }
  }

  async function remove(id: string) {
    if (!confirm("Remover este concorrente?")) return;
    setList((l) => l.filter((c) => c.id !== id));
    await fetch(`/api/clients/${clientId}/competitors/${id}`, { method: "DELETE" }).catch(() => load());
  }

  async function saveNotes(id: string, notes: string) {
    await fetch(`/api/clients/${clientId}/competitors/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }),
    }).catch(() => {});
  }

  const inp: React.CSSProperties = { height: 38, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Guia honesto */}
      <div style={{ display: "flex", gap: 10, padding: "13px 15px", borderRadius: 12, background: "color-mix(in srgb, var(--accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)" }}>
        <Info size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <div>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Como usar o radar de concorrência</p>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0", lineHeight: 1.5 }}>
            A Meta não expõe as métricas de ninguém — mas a Biblioteca de Anúncios é pública. Dica de ouro: anúncio que está
            <b> no ar há muito tempo é vencedor</b> (senão já teriam pausado). Veja os criativos do concorrente, identifique o
            <b> ângulo/oferta</b> que ele martela e <b>modele</b> (não copie) nos seus anúncios. Anote o que funciona abaixo.
          </p>
        </div>
      </div>

      {/* Adicionar concorrente */}
      <form onSubmit={add} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do concorrente (ex: Revenda X)" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="ID da página (opcional)" style={{ ...inp, width: 180 }} />
        <button type="submit" disabled={saving || !name.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving || !name.trim() ? "default" : "pointer", opacity: saving || !name.trim() ? 0.6 : 1 }}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />} Adicionar
        </button>
      </form>

      {/* Lista */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "32px 0" }}>Nenhum concorrente cadastrado ainda. Adicione acima para começar a monitorar.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {list.map((c) => (
            <div key={c.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 15px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 20 }}>{c.region}</span>
                <button onClick={() => remove(c.id)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}><Trash2 size={14} /></button>
              </div>
              <a href={adLibraryUrl(c)} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                <ExternalLink size={13} /> Ver anúncios na Ad Library
              </a>
              <textarea
                defaultValue={c.notes ?? ""}
                onBlur={(e) => saveNotes(c.id, e.target.value)}
                rows={3}
                placeholder="Anote o ângulo/oferta que vimos funcionando…"
                style={{ resize: "vertical", padding: "8px 10px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: "var(--text-primary)", outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
