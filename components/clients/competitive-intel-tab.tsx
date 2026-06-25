"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, ExternalLink, Sparkles, Radar, Target, ImagePlus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { TabHeader } from "@/components/clients/tab-header";

interface Player { id: string; name: string; tier: string | null; adLibraryUrl: string | null; pageId: string | null; _count?: { winners: number } }
interface Winner { id: string; adLibraryUrl: string | null; adId: string | null; thumbnailUrl: string | null; adName: string | null; format: string; angle: string; offer: string | null; note: string | null; liveSince: string | null; competitor: { id: string; name: string; tier: string | null } | null }
interface Synthesis { padrao: string; modelar: string[]; evitar: string; brecha: string }
interface AdRow { adId: string; name: string; campaignName: string; leads: number; thumbnailUrl: string | null; startedAt: string | null }

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
const fbLogo = (pageId: string) => `https://graph.facebook.com/${pageId}/picture?type=square`;

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12 };
const field: React.CSSProperties = { height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, boxSizing: "border-box" };
const secTitle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 800, color: "var(--text-primary)" };
const ghost: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const primary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const cap: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };

const daysSince = (iso: string | null): number | null => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000)) : null);

export function CompetitiveIntelTab({ clientId }: { clientId: string }) {
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [winners, setWinners] = useState<Winner[] | null>(null);

  function loadPlayers() { fetch(`/api/clients/${clientId}/competitors`).then((r) => r.json()).then((d) => setPlayers(d.competitors ?? [])); }
  function loadWinners() { fetch(`/api/clients/${clientId}/winners`).then((r) => r.json()).then((d) => setWinners(d.winners ?? [])); }
  useEffect(() => { loadPlayers(); loadWinners(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg-base)" }}>
      <TabHeader
        icon={<Radar size={16} />}
        title="Inteligência Competitiva"
        subtitle="Uso interno · players do nicho, criativos vencedores e a leitura do mercado pela IA"
      />
      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* topo em 2 colunas no wide; embaixo os vencedores em largura cheia */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16, alignItems: "start" }}>
          <PlayersSection clientId={clientId} players={players} onChange={loadPlayers} />
          <SynthesisSection clientId={clientId} ready={(winners?.length ?? 0) >= 3} />
        </div>
        <WinnersSection clientId={clientId} players={players ?? []} winners={winners} onChange={loadWinners} />
      </div>
    </div>
  );
}

function PlayerAvatar({ player, size = 34 }: { player: Player; size?: number }) {
  const [err, setErr] = useState(false);
  if (player.pageId && !err) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fbLogo(player.pageId)} alt="" width={size} height={size} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: 9, objectFit: "cover", border: "1px solid var(--border)", flexShrink: 0 }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: 9, background: "var(--accent-soft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.42, flexShrink: 0 }}>{player.name[0]?.toUpperCase()}</div>;
}

// ── 1. Players ────────────────────────────────────────────────────────────────
function PlayersSection({ clientId, players, onChange }: { clientId: string; players: Player[] | null; onChange: () => void }) {
  const [name, setName] = useState("");
  const [tier, setTier] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState<{ players: string[]; termos: string[]; error?: string } | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  async function add(n: string) {
    const nm = n.trim(); if (!nm) return;
    setBusy(true);
    await fetch(`/api/clients/${clientId}/competitors`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nm, tier: tier || undefined }) });
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
        <button onClick={runSuggest} disabled={suggesting} style={ghost}>{suggesting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} IA sugerir</button>
      </div>

      {suggest && (
        <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-base)" }}>
          {suggest.error && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{suggest.error}</p>}
          {suggest.players.length > 0 && (<>
            <div style={cap}>Players sugeridos (investigue)</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {suggest.players.map((p) => <button key={p} onClick={() => add(p)} style={{ ...ghost, padding: "5px 10px" }}><Plus size={12} /> {p}</button>)}
            </div>
          </>)}
          {suggest.termos.length > 0 && (<>
            <div style={{ ...cap, marginTop: 10 }}>Termos pra buscar na Ad Library</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {suggest.termos.map((t) => <a key={t} href={adLibSearch(t)} target="_blank" rel="noopener noreferrer" style={{ ...ghost, padding: "5px 10px", textDecoration: "none" }}><ExternalLink size={11} /> {t}</a>)}
            </div>
          </>)}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {players === null ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          : players.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum player ainda. Use a IA ou adicione abaixo.</p>
          : players.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-elevated)", flexWrap: "wrap" }}>
              <PlayerAvatar player={p} />
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div>
                {p._count != null && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{p._count.winners} vencedor(es)</div>}
              </div>
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
        <input style={{ ...field, flex: 1, minWidth: 140 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do concorrente" onKeyDown={(e) => { if (e.key === "Enter") add(name); }} />
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
const emptyForm = { adLibraryUrl: "", adId: "", thumbnailUrl: "", adName: "", format: "video", angle: "preco", offer: "", liveSince: "", competitorId: "", note: "" };

function WinnersSection({ clientId, players, winners, onChange }: { clientId: string; players: Player[]; winners: Winner[] | null; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [filter, setFilter] = useState<{ angle?: string }>({});
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function pickAd(ad: AdRow) {
    setForm((f) => ({ ...f, adId: ad.adId, thumbnailUrl: ad.thumbnailUrl ?? "", adName: ad.name, adLibraryUrl: "", liveSince: ad.startedAt ? ad.startedAt.slice(0, 10) : f.liveSince }));
    setPicker(false); setOpen(true);
    // o sistema já sabe o formato pelo criativo → preenche automático
    fetch(`/api/clients/${clientId}/meta/ad-format?adId=${encodeURIComponent(ad.adId)}`)
      .then((r) => r.json()).then((d) => { if (d?.format) setForm((f) => (f.adId === ad.adId ? { ...f, format: d.format } : f)); })
      .catch(() => {});
  }
  async function save() {
    if (!form.adId && !form.adLibraryUrl.trim()) { setErr("Escolha um anúncio ou cole o link da Ad Library."); return; }
    setBusy(true); setErr("");
    const r = await fetch(`/api/clients/${clientId}/winners`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Erro ao salvar"); return; }
    setForm({ ...emptyForm }); setOpen(false); onChange();
  }
  async function del(id: string) { await fetch(`/api/clients/${clientId}/winners/${id}`, { method: "DELETE" }); onChange(); }

  const list = (winners ?? []).filter((w) => !filter.angle || w.angle === filter.angle);

  return (
    <section style={{ ...card, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <span style={secTitle}>🏆 Vencedores do nicho <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>(swipe)</span></span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPicker(true)} style={ghost}><ImagePlus size={14} /> Escolher dos meus anúncios</button>
          <button onClick={() => { setForm({ ...emptyForm }); setOpen((v) => !v); }} style={primary}><Plus size={14} /> Link de concorrente</button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 12, padding: 12, border: "1px dashed var(--border-strong)", borderRadius: 10, background: "var(--bg-base)", display: "flex", flexDirection: "column", gap: 8 }}>
          {form.adId ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {form.thumbnailUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={form.thumbnailUrl} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: "cover" }} />}
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{form.adName || "Anúncio selecionado"}</span>
              <button onClick={() => setForm((f) => ({ ...f, adId: "", thumbnailUrl: "", adName: "" }))} style={{ ...ghost, padding: 6 }}><X size={13} /></button>
            </div>
          ) : (
            <input style={field} value={form.adLibraryUrl} onChange={(e) => setForm({ ...form, adLibraryUrl: e.target.value })} placeholder="Link do anúncio na Ad Library (concorrente)" />
          )}
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

      {(winners?.length ?? 0) > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {ANGLES.filter(([k]) => (winners ?? []).some((w) => w.angle === k)).map(([k, l]) => (
            <button key={k} onClick={() => setFilter((f) => ({ angle: f.angle === k ? undefined : k }))} style={{ padding: "4px 10px", borderRadius: 20, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${filter.angle === k ? "var(--accent)" : "var(--border)"}`, background: filter.angle === k ? "var(--accent-soft)" : "var(--bg-surface)", color: filter.angle === k ? "var(--accent)" : "var(--text-secondary)" }}>{l}</button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
        {winners === null ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          : list.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum vencedor salvo {winners.length > 0 ? "nesse filtro" : "ainda"}.</p>
          : list.map((w) => {
            const d = daysSince(w.liveSince);
            return (
              <div key={w.id} style={{ ...card, background: "var(--bg-elevated)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
                {w.thumbnailUrl && (
                  <div style={{ position: "relative", height: 130, background: "#0a0a0a" }}>
                    <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${w.thumbnailUrl}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(16px)", transform: "scale(1.2)", opacity: 0.5 }} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.thumbnailUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                )}
                <div style={{ padding: 11, display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#2563EB", background: "#2563EB1a", padding: "1px 7px", borderRadius: 20 }}>{fmtLabel(w.format)}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#7C3AED1a", padding: "1px 7px", borderRadius: 20 }}>{angLabel(w.angle)}</span>
                  </div>
                  {(w.offer || w.adName) && <div style={{ fontSize: 12.5, color: "var(--text-primary)", fontWeight: 600 }}>{w.offer || w.adName}</div>}
                  {w.note && <div style={{ fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.35 }}>{w.note}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                    {d != null && <span style={{ fontSize: 10.5, fontWeight: 700, color: d >= 30 ? "#16A34A" : "var(--text-muted)", background: d >= 30 ? "#16A34A1a" : "transparent", padding: "1px 7px", borderRadius: 20 }}>🔥 {d} dias no ar</span>}
                    {w.competitor && <span style={{ fontSize: 10.5, color: tierColor(w.competitor.tier) }}>{w.competitor.name}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {w.adLibraryUrl && <a href={w.adLibraryUrl} target="_blank" rel="noopener noreferrer" style={{ ...ghost, padding: "5px 9px", flex: 1, justifyContent: "center", textDecoration: "none" }}><ExternalLink size={12} /> Ver</a>}
                    <button onClick={() => del(w.id)} style={{ ...ghost, padding: "5px 9px", color: "var(--red)", marginLeft: w.adLibraryUrl ? 0 : "auto" }}><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {picker && <AdPickerModal clientId={clientId} onPick={pickAd} onClose={() => setPicker(false)} />}
    </section>
  );
}

function AdPickerModal({ clientId, onPick, onClose }: { clientId: string; onPick: (ad: AdRow) => void; onClose: () => void }) {
  const [ads, setAds] = useState<AdRow[] | null>(null);
  useEffect(() => {
    const now = new Date();
    fetch(`/api/clients/${clientId}/meta/ads?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then((r) => r.json()).then((d) => setAds(Array.isArray(d?.ads) ? [...d.ads].sort((a: AdRow, b: AdRow) => b.leads - a.leads) : []))
      .catch(() => setAds([]));
  }, [clientId]);

  return (
    <Modal open onClose={onClose} title="Escolher anúncio (mês atual)" size="lg">
      {ads === null ? <div style={{ padding: 24, textAlign: "center" }}><Loader2 size={18} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>
        : ads.length === 0 ? <p style={{ fontSize: 13, color: "var(--text-muted)", padding: 12 }}>Nenhum anúncio com dados neste mês.</p>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
            {ads.map((ad) => {
              const d = daysSince(ad.startedAt);
              return (
                <button key={ad.adId} onClick={() => onPick(ad)} style={{ ...card, background: "var(--bg-elevated)", padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column" }}>
                  <div style={{ height: 110, background: "#0a0a0a", position: "relative" }}>
                    {ad.thumbnailUrl
                      ? <>
                          <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${ad.thumbnailUrl}")`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(14px)", transform: "scale(1.2)", opacity: 0.5 }} />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={ad.thumbnailUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
                        </>
                      : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 12 }}>sem imagem</div>}
                  </div>
                  <div style={{ padding: 9 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ad.name}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 4, fontSize: 10.5, color: "var(--text-muted)" }}>
                      <span style={{ fontWeight: 700, color: "var(--text-secondary)" }}>{ad.leads} leads</span>
                      {d != null && <span>{d} dias</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
    </Modal>
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
