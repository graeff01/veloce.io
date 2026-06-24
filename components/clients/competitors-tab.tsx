"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, ExternalLink, Loader2, Info, Sparkles, Trophy } from "lucide-react";

interface Competitor {
  id: string;
  name: string;
  pageId: string | null;
  region: string;
  notes: string | null;
}
interface Suggestions { players: string[]; termos: string[]; source?: string; error?: string }

// Extrai o page_id de um link colado (Ad Library com view_all_page_id, ou o id
// puro). Permite mira EXATA na página do concorrente em vez de busca por nome.
function extractPageId(input: string): string | null {
  const s = (input ?? "").trim();
  if (!s) return null;
  const m = s.match(/view_all_page_id=(\d{5,})/) || s.match(/\/(\d{8,})(?:[/?]|$)/);
  if (m) return m[1];
  if (/^\d{5,}$/.test(s)) return s;
  return null;
}

// Anúncios "no ar há +30 dias" = vencedores (ninguém queima verba em anúncio ruim).
function winnersDateMax(): string {
  const d = new Date(Date.now() - 30 * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Deep-link para a Ad Library PÚBLICA, já filtrada. onlyWinners prioriza anúncios
// que começaram há +30 dias e seguem ativos (proxy de vencedor).
function adLibraryBase(region: string, onlyWinners: boolean): string {
  let u = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&media_type=all&country=${region || "BR"}`;
  if (onlyWinners) u += `&start_date%5Bmax%5D=${winnersDateMax()}`;
  return u;
}
function competitorUrl(c: Competitor, onlyWinners: boolean): string {
  const base = adLibraryBase(c.region, onlyWinners);
  return c.pageId
    ? `${base}&view_all_page_id=${encodeURIComponent(c.pageId)}`
    : `${base}&q=${encodeURIComponent(c.name)}&search_type=keyword_unordered`;
}
function termUrl(term: string, region: string, onlyWinners: boolean): string {
  return `${adLibraryBase(region, onlyWinners)}&q=${encodeURIComponent(term)}&search_type=keyword_unordered`;
}

export function CompetitorsTab({ clientId }: { clientId: string }) {
  const [list, setList] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [pageId, setPageId] = useState("");
  const [saving, setSaving] = useState(false);
  const [onlyWinners, setOnlyWinners] = useState(true);
  const [suggesting, setSuggesting] = useState(false);
  const [sugg, setSugg] = useState<Suggestions | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/clients/${clientId}/competitors`);
    if (res.ok) setList((await res.json()).competitors ?? []);
    setLoading(false);
  }, [clientId]);
  useEffect(() => { load(); }, [load]);

  async function add(name_: string, pageInput?: string) {
    if (!name_.trim()) return;
    setSaving(true);
    const res = await fetch(`/api/clients/${clientId}/competitors`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name_.trim(), pageId: extractPageId(pageInput ?? "") || undefined }),
    });
    setSaving(false);
    if (res.ok) { setName(""); setPageId(""); load(); }
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/competitors/suggest`);
      setSugg(await res.json().catch(() => null));
    } finally { setSuggesting(false); }
  }

  async function remove(id: string) {
    if (!confirm("Remover este concorrente?")) return;
    setList((l) => l.filter((c) => c.id !== id));
    await fetch(`/api/clients/${clientId}/competitors/${id}`, { method: "DELETE" }).catch(() => load());
  }
  async function saveNotes(id: string, notes: string) {
    await fetch(`/api/clients/${clientId}/competitors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes }) }).catch(() => {});
  }

  const inp: React.CSSProperties = { height: 38, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const linkBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 8, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, textDecoration: "none" };
  const already = new Set(list.map((c) => c.name.trim().toLowerCase()));

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Guia honesto */}
      <div style={{ display: "flex", gap: 10, padding: "13px 15px", borderRadius: 12, background: "color-mix(in srgb, var(--accent) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)" }}>
        <Info size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
          A Meta não expõe métrica de ninguém — mas a Biblioteca de Anúncios é pública. Dica de ouro: anúncio <b>no ar há muito tempo é vencedor</b> (senão já teriam pausado). Veja os criativos dos players, identifique o <b>ângulo/oferta</b> que mais roda e <b>modele</b> (não copie). Use o filtro de vencedores abaixo pra ir direto neles.
        </p>
      </div>

      {/* Filtro de vencedores */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", cursor: "pointer", alignSelf: "flex-start" }}>
        <input type="checkbox" checked={onlyWinners} onChange={(e) => setOnlyWinners(e.target.checked)} />
        <Trophy size={14} style={{ color: "#D97706" }} /> Só vencedores (no ar há +30 dias)
      </label>

      {/* Descobrir no nicho (IA) */}
      <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)" }}>Descobrir players do nicho</span>
          <button onClick={suggest} disabled={suggesting} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: suggesting ? "default" : "pointer" }}>
            {suggesting ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} />} Sugerir com IA
          </button>
        </div>

        {sugg?.error && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{sugg.error}</p>}
        {sugg && !sugg.error && (
          <>
            {sugg.players.length > 0 && (
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Players sugeridos (verifique)</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sugg.players.map((p) => (
                    <div key={p} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-primary)", fontWeight: 600 }}>{p}</span>
                      <a href={termUrl(p, "BR", onlyWinners)} target="_blank" rel="noopener noreferrer" style={linkBtn}><ExternalLink size={12} /> Ver</a>
                      <button onClick={() => add(p)} disabled={saving || already.has(p.trim().toLowerCase())} title={already.has(p.trim().toLowerCase()) ? "Já salvo" : "Salvar como concorrente"}
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: already.has(p.trim().toLowerCase()) ? "var(--text-muted)" : "var(--accent)", fontSize: 12, fontWeight: 600, cursor: already.has(p.trim().toLowerCase()) ? "default" : "pointer" }}>
                        <Plus size={12} /> {already.has(p.trim().toLowerCase()) ? "Salvo" : "Salvar"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sugg.termos.length > 0 && (
              <div>
                <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>Termos de busca do nicho</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {sugg.termos.map((t) => (
                    <a key={t} href={termUrl(t, "BR", onlyWinners)} target="_blank" rel="noopener noreferrer"
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "5px 10px", borderRadius: 20, textDecoration: "none" }}>
                      <ExternalLink size={11} /> {t}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Adicionar manual */}
      <form onSubmit={(e) => { e.preventDefault(); add(name, pageId); }} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Adicionar concorrente (nome)" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="Cole o link da Ad Library dele (mira exata)" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <button type="submit" disabled={saving || !name.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 38, padding: "0 16px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving || !name.trim() ? "default" : "pointer", opacity: saving || !name.trim() ? 0.6 : 1 }}>
          {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={14} />} Adicionar
        </button>
      </form>

      {/* Lista salva */}
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>Nenhum concorrente salvo ainda. Use a IA acima ou adicione manualmente.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
          {list.map((c) => (
            <div key={c.id} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 15px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", padding: "1px 6px", borderRadius: 20 }}>{c.region}</span>
                {c.pageId
                  ? <span title="Atalho cai na página exata do concorrente" style={{ fontSize: 9.5, fontWeight: 700, color: "#16A34A", background: "rgba(22,163,74,0.1)", padding: "1px 6px", borderRadius: 20 }}>página exata</span>
                  : <span title="Busca por nome — pode trazer páginas parecidas. Cole o link da Ad Library dele para mira exata." style={{ fontSize: 9.5, fontWeight: 700, color: "#D97706", background: "rgba(217,119,6,0.1)", padding: "1px 6px", borderRadius: 20 }}>por nome</span>}
                <button onClick={() => remove(c.id)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}><Trash2 size={14} /></button>
              </div>
              <a href={competitorUrl(c, onlyWinners)} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                <ExternalLink size={13} /> Ver anúncios na Ad Library
              </a>
              <textarea defaultValue={c.notes ?? ""} onBlur={(e) => saveNotes(c.id, e.target.value)} rows={3} placeholder="Anote o ângulo/oferta que vimos funcionando…"
                style={{ resize: "vertical", padding: "8px 10px", background: "var(--bg-base)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, lineHeight: 1.5, color: "var(--text-primary)", outline: "none", width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
