"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ExternalLink, Sparkles, Radar, Target } from "lucide-react";

interface Player { id: string; name: string; tier: string | null; adLibraryUrl: string | null; _count?: { winners: number } }
interface Winner { id: string; adLibraryUrl: string; format: string; angle: string; offer: string | null; note: string | null; liveSince: string | null; competitor: { id: string; name: string; tier: string | null } | null }
interface Synthesis { padrao: string; modelar: string[]; evitar: string; brecha: string }

const FORMATS = [["imagem", "Imagem"], ["carrossel", "Carrossel"], ["video", "Vídeo"], ["reels", "Reels"]] as const;
const ANGLES = [
  ["preco", "Preço/Oferta"], ["entrada", "Entrada facilitada"], ["urgencia", "Urgência/Escassez"], ["prova_social", "Prova social"],
  ["autoridade", "Autoridade/Bastidor"], ["novidade", "Novidade"], ["comparacao", "Comparação"], ["garantia", "Garantia"],
] as const;
const TIERS = [["serio", "Sério"], ["medio", "Médio"], ["amador", "Amador"]] as const;
const fmtLabel = (k: string) => FORMATS.find((f) => f[0] === k)?.[1] ?? k;
const angLabel = (k: string) => ANGLES.find((a) => a[0] === k)?.[1] ?? k;
const tierColor = (t: string | null) => (t === "serio" ? "#16A34A" : t === "amador" ? "#d6453d" : t === "medio" ? "#D97706" : "var(--text-muted)");
const adLibSearch = (q: string) => `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=BR&q=${encodeURIComponent(q)}&search_type=keyword_unordered`;

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, boxSizing: "border-box" };
const secTitle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" };
const ghost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const primary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const cap: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export function CompetitiveIntelTab({ clientId }: { clientId: string }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [winners, setWinners] = useState<Winner[] | null>(null);

  function loadPlayers() { fetch(`/api/clients/${clientId}/competitors`).then((r) => r.json()).then((d) => setPlayers(d.competitors ?? [])); }
  function loadWinners() { fetch(`/api/clients/${clientId}/winners`).then((r) => r.json()).then((d) => setWinners(d.winners ?? [])); }
  useEffect(() => { loadPlayers(); loadWinners(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 1000 }}>
      <div>
        <h2 style={{ ...secTitle, fontSize: 17 }}><Radar size={16} style={{ color: "var(--accent)" }} /> Inteligência Competitiva</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
          Uso interno da Veloce. Mapeia os players do nicho, guarda os criativos vencedores (com tags + longevidade) e a IA lê o padrão do mercado — pra estruturar o tráfego, não acumular link.
        </p>
      </div>

      <PlayersSection clientId={clientId} players={players} onChange={loadPlayers} />
      <WinnersSection clientId={clientId} players={players ?? []} winners={winners} onChange={loadWinners} />
      <SynthesisSection clientId={clientId} ready={(winners?.length ?? 0) >= 3} />
    </div>
  );
}

// ── 1. Players ────────────────────────────────────────────────────────────────
function PlayersSection({ clientId, players, onChange }: { clientId: string; players: Player[] | null; onChange: () => void }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<{ players: string[]; termos: string[]; error?: string } | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  async function add(n: string, t?: string) {
    const nm = n.trim(); if (!nm) return;
    setBusy(true);
    await fetch(`/api/clients/${clientId}/competitors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm, tier: t || tier || undefined }) });
    setBusy(false); setName(""); setTier(""); onChange();
  }
  async function setPlayerTier(id: string, t: string) {
    await fetch(`/api/clients/${clientId}/competitors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tier: t }) });
    onChange();
  }
  async function del(id: string) { await fetch(`/api/clients/${clientId}/competitors/${id}`, { method: "DELETE" }); onChange(); }
  async function runSuggest() {
    setSuggesting(true);
    const d = await fetch(`/api/clients/${clientId}/competitors/suggest`).then((r) => r.json()).catch(() => null);
    setSuggesting(false);
    setSuggest(d ? { players: d.players ?? [], termos: d.termos ?? [], error: d.error } : null);
  }

  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={secTitle}><Target size={15} /> Players do nicho</span>
        <button onClick={runSuggest} disabled={suggesting} style={ghost}>{suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} IA sugerir players</button>
      </div>

      {suggest && (
        <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-base)" }}>
          {suggest.error && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{suggest.error}</p>}
          {suggest.players.length > 0 && (
            <>
              <div style={cap}>Players sugeridos (investigue)</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {suggest.players.map((p) => (
                  <button key={p} onClick={() => add(p)} style={{ ...ghost, padding: "5px 10px" }} title="Adicionar"><Plus size={12} /> {p}</button>
                ))}
              </div>
            </>
          )}
          {suggest.termos.length > 0 && (
            <>
              <div style={{ ...cap, marginTop: 10 }}>Termos pra buscar na Ad Library</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {suggest.termos.map((t) => (
                  <a key={t} href={adLibSearch(t)} target="_blank" rel="noopener noreferrer" style={{ ...ghost, padding: "5px 10px", textDecoration: "none" }}><ExternalLink size={11} /> {t}</a>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {players === null ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          : players.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum player ainda. Use a IA ou adicione abaixo.</p>
          : players.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1, minWidth: 120 }}>{p.name}</span>
              {p._count != null && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p._count.winners} vencedor(es)</span>}
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                {TIERS.map(([k, lbl]) => (
                  <button key={k} onClick={() => setPlayerTier(p.id, k)} style={{ padding: "4px 9px", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: p.tier === k ? `${tierColor(k)}1f` : "transparent", color: p.tier === k ? tierColor(k) : "var(--text-muted)" }}>{lbl}</button>
                ))}
              </div>
              <a href={p.adLibraryUrl || adLibSearch(p.name)} target="_blank" rel="noopener noreferrer" style={{ ...ghost, padding: 7 }} title="Abrir na Ad Library"><ExternalLink size={13} /></a>
              <button onClick={() => del(p.id)} style={{ ...ghost, padding: 7, color: "var(--red)" }}><Trash2 size={13} /></button>
            </div>
          ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <input style={{ ...field, flex: 1, minWidth: 160 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do concorrente" onKeyDown={(e) => { if (e.key === "Enter") add(name); }} />
        <select style={field} value={tier} onChange={(e) => setTier(e.target.value)}>
          <option value="">Tier…</option>
          {TIERS.map(([k, lbl]) => <option key={k} value={k}>{lbl}</option>)}
        </select>
        <button onClick={() => add(name)} disabled={busy || !name.trim()} style={{ ...primary, opacity: busy || !name.trim() ? 0.6 : 1 }}><Plus size={14} /> Adicionar</button>
      </div>
    </section>
  );
}

// ── 2. Vencedores (swipe) ─────────────────────────────────────────────────────
function WinnersSection({ clientId, players, winners, onChange }: { clientId: string; players: Player[]; winners: Winner[] | null; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<{ format?: string; angle?: string }>({});
  const [form, setForm] = useState({ adLibraryUrl: "", format: "video", angle: "preco", offer: "", liveSince: "", competitorId: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!form.adLibraryUrl.trim()) { setErr("Cole o link da Ad Library."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/clients/${clientId}/winners`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Erro ao salvar"); return; }
    setForm({ adLibraryUrl: "", format: "video", angle: "preco", offer: "", liveSince: "", competitorId: "", note: "" });
    setOpen(false); onChange();
  }
  async function del(id: string) { await fetch(`/api/clients/${clientId}/winners/${id}`, { method: "DELETE" }); onChange(); }

  const list = (winners ?? []).filter((w) => (!filter.format || w.format === filter.format) && (!filter.angle || w.angle === filter.angle));

  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={secTitle}>🏆 Vencedores do nicho <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>(swipe)</span></span>
        <button onClick={() => setOpen((v) => !v)} style={primary}><Plus size={14} /> Salvar vencedor</button>
      </div>

      {open && (
        <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-base)", display: "flex", flexDirection: "column", gap: 8 }}>
          <input style={field} value={form.adLibraryUrl} onChange={(e) => setForm({ ...form, adLibraryUrl: e.target.value })} placeholder="Link do anúncio na Ad Library" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select style={{ ...field, flex: 1, minWidth: 110 }} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>{FORMATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select style={{ ...field, flex: 1, minWidth: 140 }} value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })}>{ANGLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select style={{ ...field, flex: 1, minWidth: 130 }} value={form.competitorId} onChange={(e) => setForm({ ...form, competitorId: e.target.value })}>
              <option value="">Player (opcional)</option>
              {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input style={{ ...field, flex: 1, minWidth: 140 }} value={form.offer} onChange={(e) => setForm({ ...form, offer: e.target.value })} placeholder="Oferta (ex: entrada R$5mil)" />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>No ar desde <input type="date" style={field} value={form.liveSince} onChange={(e) => setForm({ ...form, liveSince: e.target.value })} /></label>
          </div>
          <input style={field} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Nota (por que ganha) — opcional" />
          {err && <p style={{ fontSize: 12, color: "var(--red)" }}>{err}</p>}
          <div><button onClick={save} disabled={busy} style={{ ...primary, opacity: busy ? 0.6 : 1 }}>{busy ? "Salvando…" : "Salvar no swipe"}</button></div>
        </div>
      )}

      {/* filtros */}
      {(winners?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {ANGLES.filter(([k]) => (winners ?? []).some((w) => w.angle === k)).map(([k, l]) => (
            <button key={k} onClick={() => setFilter((f) => ({ ...f, angle: f.angle === k ? undefined : k }))} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter.angle === k ? "var(--accent)" : "var(--border)"}`, background: filter.angle === k ? "var(--accent-soft)" : "var(--bg-surface)", color: filter.angle === k ? "var(--accent)" : "var(--text-secondary)" }}>{l}</button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginTop: 12 }}>
        {winners === null ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          : list.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum vencedor salvo {winners.length > 0 ? "nesse filtro" : "ainda"}.</p>
          : list.map((w) => {
            const d = daysSince(w.liveSince);
            return (
              <div key={w.id} style={{ ...card, background: "var(--bg-elevated)", padding: 11, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#2563EB", background: "#2563EB1a", padding: "1px 7px", borderRadius: 20 }}>{fmtLabel(w.format)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#7C3AED1a", padding: "1px 7px", borderRadius: 20 }}>{angLabel(w.angle)}</span>
                </div>
                {w.offer && <div style={{ fontSize: 12.5, color: "var(--text-primary)", fontWeight: 600 }}>{w.offer}</div>}
                {w.note && <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.35 }}>{w.note}</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  {d != null && <span style={{ fontSize: 10.5, fontWeight: 700, color: d >= 30 ? "#16A34A" : "var(--text-muted)", background: d >= 30 ? "#16A34A1a" : "transparent", padding: "1px 7px", borderRadius: 20 }}>🔥 {d} dias no ar</span>}
                  {w.competitor && <span style={{ fontSize: 10.5, color: tierColor(w.competitor.tier) }}>{w.competitor.name}</span>}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={w.adLibraryUrl} target="_blank" rel="noopener noreferrer" style={{ ...ghost, padding: "5px 9px", flex: 1, justifyContent: "center", textDecoration: "none" }}><ExternalLink size={12} /> Ver</a>
                  <button onClick={() => del(w.id)} style={{ ...ghost, padding: "5px 9px", color: "var(--red)" }}><Trash2 size={12} /></button>
                </div>
              </div>
            );
          })}
      </div>
    </section>
  );
}

// ── 3. Leitura do nicho (IA) ──────────────────────────────────────────────────
function SynthesisSection({ clientId, ready }: { clientId: string; ready: boolean }) {
  const [data, setData] = useState<Synthesis | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true); setErr("");
    const d = await fetch(`/api/clients/${clientId}/competitors/synthesis`).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.synthesis) setData(d.synthesis); else setErr(d?.error ?? "Falha ao sintetizar.");
  }

  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={secTitle}><Sparkles size={15} style={{ color: "var(--accent)" }} /> Leitura do nicho (IA)</span>
        <button onClick={run} disabled={busy || !ready} style={{ ...primary, opacity: busy || !ready ? 0.6 : 1 }}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Sintetizar</button>
      </div>
      {!ready && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>Salve pelo menos 3 vencedores (com formato e ângulo) pra IA achar o padrão.</p>}
      {err && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>{err}</p>}
      {data && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
          <div style={{ padding: 12, borderRadius: 10, background: "var(--bg-base)", border: "1px solid var(--border)" }}>
            <div style={cap}>Padrão dos vencedores</div>
            <div style={{ fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5, marginTop: 4 }}>{data.padrao}</div>
          </div>
          {data.modelar.length > 0 && (
            <div style={{ padding: 12, borderRadius: 10, background: "#16A34A0d", border: "1px solid #16A34A33" }}>
              <div style={{ ...cap, color: "#16A34A" }}>✅ O que modelar</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{data.modelar.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}
          {data.evitar && (
            <div style={{ padding: 12, borderRadius: 10, background: "#d6453d0d", border: "1px solid #d6453d33" }}>
              <div style={{ ...cap, color: "#d6453d" }}>⛔ O que evitar</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, marginTop: 4 }}>{data.evitar}</div>
            </div>
          )}
          {data.brecha && (
            <div style={{ padding: 12, borderRadius: 10, background: "var(--accent-soft)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)" }}>
              <div style={{ ...cap, color: "var(--accent)" }}>💡 A brecha (ninguém explora)</div>
              <div style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, marginTop: 4 }}>{data.brecha}</div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
