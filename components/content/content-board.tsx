"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Trash2, Check, ExternalLink, Link2, ImageIcon, LayoutGrid, CalendarDays, RefreshCw, ChevronLeft, ChevronRight, Repeat, Send } from "lucide-react";

interface Post {
  id: string; title: string; type: string; copy: string | null; references: string | null;
  status: string; publishDate: string | null; artUrl: string | null; previewUrl: string | null; feedback: string | null; notes: string | null; approvedAt: string | null;
}
interface Recurrence { id: string; label: string; type: string; weekday: number }
interface Activity { id: string; authorId: string | null; authorName: string | null; kind: string; body: string | null; createdAt: string }

const STAGES: { key: string; label: string; color: string }[] = [
  { key: "pauta",     label: "Pauta",       color: "#64748B" },
  { key: "criacao",   label: "Em criação",  color: "#2563EB" },
  { key: "revisao",   label: "Revisão",     color: "#D97706" },
  { key: "aprovado",  label: "Aprovado",    color: "#16A34A" },
  { key: "agendado",  label: "Agendado",    color: "#7C3AED" },
  { key: "publicado", label: "Publicado",   color: "#0F766E" },
];
const APPROVAL = ["aprovado", "agendado", "publicado"];
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-card)" };
const field: React.CSSProperties = { width: "100%", height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, boxSizing: "border-box" };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 6 };
const ghostBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };

function ddmm(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const typePill = (type: string): React.CSSProperties => ({ fontSize: 10, fontWeight: 600, color: type === "carrossel" ? "#7C3AED" : "#2563EB", background: type === "carrossel" ? "#7C3AED1A" : "#2563EB1A", padding: "1px 7px", borderRadius: 20 });

export function ContentBoard() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const canBrief = role === "ADMIN" || role === "OPERATIONAL";

  const now = new Date();
  const [view, setView] = useState<"board" | "calendar">("board");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);
  const [showRec, setShowRec] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  function load() {
    fetch("/api/content").then((r) => (r.ok ? r.json() : [])).then((d) => setPosts(Array.isArray(d) ? d : []));
  }
  useEffect(() => { load(); }, []);

  async function movePost(id: string, to: string) {
    const p = posts?.find((x) => x.id === id);
    if (!p || p.status === to) return;
    setPosts((xs) => (xs ?? []).map((x) => (x.id === id ? { ...x, status: to } : x))); // otimista
    const r = await fetch(`/api/content/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: to }) });
    if (!r.ok) setSeedMsg("Sem permissão para essa etapa.");
    load();
  }

  async function seedMonth() {
    if (seeding) return;
    setSeeding(true); setSeedMsg(null);
    const r = await fetch("/api/content/seed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, year }) });
    const d = await r.json().catch(() => ({}));
    setSeeding(false);
    setSeedMsg(r.ok ? `${d.created} pauta(s) gerada(s).` : (d.error ?? "Erro"));
    if (r.ok) load();
  }

  function prevMonth() { if (month === 1) { setMonth(12); setYear((y) => y - 1); } else setMonth((m) => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear((y) => y + 1); } else setMonth((m) => m + 1); }

  if (!posts) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px 12px", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 240px" }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Conteúdo · Veloce</h1>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>Produção das artes do Instagram da Veloce — da pauta à publicação.</p>
        </div>

        {/* Toggle Board/Calendário */}
        <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 9, overflow: "hidden" }}>
          {([["board", "Board", <LayoutGrid key="g" size={13} />], ["calendar", "Calendário", <CalendarDays key="c" size={13} />]] as const).map(([k, lbl, ic]) => (
            <button key={k} onClick={() => setView(k as "board" | "calendar")} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, background: view === k ? "var(--accent-soft)" : "var(--bg-surface)", color: view === k ? "var(--accent)" : "var(--text-secondary)" }}>{ic} {lbl}</button>
          ))}
        </div>

        {seedMsg && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{seedMsg}</span>}
        {canBrief && (
          <>
            <button onClick={() => setShowRec(true)} style={ghostBtn}><Repeat size={13} /> Recorrência</button>
            <button onClick={seedMonth} disabled={seeding} style={ghostBtn} title="Gera as pautas do mês a partir dos slots recorrentes">
              {seeding ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Gerar mês
            </button>
            <button onClick={() => setCreating(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <Plus size={15} /> Nova pauta
            </button>
          </>
        )}
      </div>

      {view === "board" ? (
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", gap: 12, padding: "8px 24px 24px" }}>
          {STAGES.map((st) => {
            const items = posts.filter((p) => p.status === st.key);
            const canDrop = !(APPROVAL.includes(st.key) && !isAdmin); // designer não solta em aprovado/agendado/publicado
            const isOver = overStage === st.key && canDrop;
            return (
              <div key={st.key}
                onDragOver={(e) => { if (dragId && canDrop) { e.preventDefault(); setOverStage(st.key); } }}
                onDragLeave={() => setOverStage((s) => (s === st.key ? null : s))}
                onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id && canDrop) movePost(id, st.key); setOverStage(null); setDragId(null); }}
                style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 230, background: isOver ? "var(--accent-soft)" : "var(--bg-elevated)", border: `1px solid ${isOver ? "var(--accent)" : "var(--border)"}`, borderRadius: 14, transition: "background .12s, border-color .12s" }}>
                <div style={{ padding: "11px 14px 9px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>{st.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: items.length ? st.color : "var(--text-muted)", background: items.length ? `${st.color}1A` : "transparent", padding: "1px 7px", borderRadius: 20, minWidth: 22, textAlign: "center" }}>{items.length}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.length === 0 && <p style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "center", padding: "20px 8px", opacity: 0.6 }}>—</p>}
                  {items.map((p) => (
                    <div key={p.id} draggable
                      onDragStart={(e) => { setDragId(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }}
                      onDragEnd={() => { setDragId(null); setOverStage(null); }}
                      onClick={() => setOpen(p)}
                      style={{ ...card, textAlign: "left", cursor: "grab", padding: 0, overflow: "hidden", borderLeft: `3px solid ${st.color}`, opacity: dragId === p.id ? 0.5 : 1 }}>
                      {p.previewUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.previewUrl} alt="" style={{ width: "100%", height: 96, objectFit: "cover", display: "block", pointerEvents: "none" }} />
                      )}
                      <div style={{ padding: "9px 11px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>{p.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          <span style={typePill(p.type)}>{p.type === "carrossel" ? "Carrossel" : "Feed"}</span>
                          {p.publishDate && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>📅 {ddmm(p.publishDate)}</span>}
                          {p.artUrl && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600, color: "var(--green)", background: "var(--green-soft, #16A34A1A)", padding: "1px 6px", borderRadius: 20 }}><Link2 size={10} /> Final</span>}
                          {!p.previewUrl && !p.artUrl && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, color: "var(--text-muted)", opacity: 0.7 }}><ImageIcon size={10} /> sem arte</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CalendarView posts={posts} month={month} year={year} onPrev={prevMonth} onNext={nextMonth} onOpen={setOpen} />
      )}

      {creating && <PostModal mode="create" canBrief={canBrief} isAdmin={isAdmin} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} onRefresh={load} />}
      {open && <PostModal mode="edit" post={open} canBrief={canBrief} isAdmin={isAdmin} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} onRefresh={load} />}
      {showRec && <RecurrenceModal onClose={() => setShowRec(false)} />}
    </div>
  );
}

function CalendarView({ posts, month, year, onPrev, onNext, onOpen }: { posts: Post[]; month: number; year: number; onPrev: () => void; onNext: () => void; onOpen: (p: Post) => void }) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const byDay = new Map<number, Post[]>();
  for (const p of posts) {
    if (!p.publishDate) continue;
    const d = new Date(p.publishDate);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month - 1) {
      const day = d.getUTCDate();
      const arr = byDay.get(day) ?? []; arr.push(p); byDay.set(day, arr);
    }
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const navBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-surface)", color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "8px 24px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <button onClick={onPrev} style={navBtn}><ChevronLeft size={15} /></button>
        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", minWidth: 140 }}>{MONTHS[month - 1]} {year}</span>
        <button onClick={onNext} style={navBtn}><ChevronRight size={15} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        {WEEKDAYS.map((w) => (
          <div key={w} style={{ background: "var(--bg-elevated)", padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{w}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} style={{ background: "var(--bg-surface)", minHeight: 92, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            {day && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 2 }}>{day}</div>}
            {day && (byDay.get(day) ?? []).map((p) => {
              const st = STAGES.find((s) => s.key === p.status);
              return (
                <button key={p.id} onClick={() => onOpen(p)} style={{ display: "block", textAlign: "left", padding: "4px 6px", borderRadius: 6, border: "none", borderLeft: `3px solid ${st?.color ?? "#64748B"}`, background: "var(--bg-elevated)", cursor: "pointer", fontSize: 10.5, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.title}>
                  {p.type === "carrossel" ? "🎠" : "🖼️"} {p.title}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecurrenceModal({ onClose }: { onClose: () => void }) {
  const [recs, setRecs] = useState<Recurrence[] | null>(null);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("feed");
  const [weekday, setWeekday] = useState(2);
  const [busy, setBusy] = useState(false);

  function load() { fetch("/api/content/recurrences").then((r) => (r.ok ? r.json() : [])).then((d) => setRecs(Array.isArray(d) ? d : [])); }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!label.trim() || busy) return;
    setBusy(true);
    await fetch("/api/content/recurrences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), type, weekday }) });
    setBusy(false); setLabel(""); load();
  }
  async function del(id: string) { setRecs((xs) => (xs ?? []).filter((r) => r.id !== id)); await fetch(`/api/content/recurrences/${id}`, { method: "DELETE" }); }

  return (
    <Modal open onClose={onClose} title="Recorrência de pautas" size="md">
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.5 }}>
        Defina os posts que se repetem toda semana (ex.: 1 feed + 1 carrossel). Depois é só clicar em <b>Gerar mês</b> que as pautas entram automaticamente, na data certa.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {recs === null ? <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-muted)" }} />
          : recs.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhum slot ainda.</p>
          : recs.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-base)" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", flex: 1 }}>{r.label}</span>
              <span style={typePill(r.type)}>{r.type === "carrossel" ? "Carrossel" : "Feed"}</span>
              <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{WEEKDAYS[r.weekday]}</span>
              <button onClick={() => del(r.id)} style={{ ...ghostBtn, padding: 6, color: "var(--red)" }}><Trash2 size={12} /></button>
            </div>
          ))}
      </div>
      <div style={{ padding: 12, border: "1px dashed var(--border-strong)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <input style={field} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex: Post feed da semana" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <div style={{ display: "flex", gap: 8 }}>
          <select style={{ ...field, flex: 1 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="feed">Feed</option>
            <option value="carrossel">Carrossel</option>
          </select>
          <select style={{ ...field, flex: 1 }} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}
          </select>
          <button onClick={add} disabled={busy || !label.trim()} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 14px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy || !label.trim() ? 0.6 : 1 }}><Plus size={14} /></button>
        </div>
      </div>
    </Modal>
  );
}

// Comprime a imagem no navegador (redimensiona + JPEG) — a prévia é só pra avaliar,
// fica leve no banco. O arquivo final em alta vai pelo link do Drive.
function fileToPreviewDataUrl(file: File, maxDim = 1280, quality = 0.72): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > maxDim) { const r = maxDim / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("no ctx")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("img error")); };
    img.src = url;
  });
}

function PostModal({ mode, post, canBrief, isAdmin, onClose, onSaved, onRefresh }: { mode: "create" | "edit"; post?: Post; canBrief: boolean; isAdmin: boolean; onClose: () => void; onSaved: () => void; onRefresh: () => void }) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [type, setType] = useState(post?.type ?? "feed");
  const [copy, setCopy] = useState(post?.copy ?? "");
  const [refs, setRefs] = useState(post?.references ?? "");
  const [publishDate, setPublishDate] = useState(post?.publishDate ? post.publishDate.slice(0, 10) : "");
  const [artUrl, setArtUrl] = useState(post?.artUrl ?? "");
  const [previewUrl, setPreviewUrl] = useState(post?.previewUrl ?? "");
  const [status, setStatus] = useState(post?.status ?? "pauta");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { data: session } = useSession();
  const meId = session?.user?.id;
  const [activity, setActivity] = useState<Activity[] | null>(null);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);

  async function patch(body: Record<string, unknown>) {
    if (!post) return false;
    setBusy(true); setErr("");
    const r = await fetch(`/api/content/${post.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error ?? "Erro ao salvar"); return false; }
    return true;
  }
  async function create() {
    if (!title.trim()) { setErr("Título é obrigatório"); return; }
    setBusy(true); setErr("");
    const r = await fetch("/api/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, type, copy, references: refs, publishDate: publishDate || null }) });
    setBusy(false);
    if (!r.ok) { setErr("Erro ao criar"); return; }
    onSaved();
  }
  // Salva só o que o papel pode mexer. Designer: só o link. Gestor: o briefing inteiro.
  async function save() {
    const body: Record<string, unknown> = { artUrl: artUrl || null };
    if (canBrief) {
      body.title = title; body.type = type; body.copy = copy || null; body.references = refs || null;
      body.publishDate = publishDate || null;
    }
    if (await patch(body)) onSaved();
  }
  async function move(to: string) { if (await patch({ status: to })) onSaved(); }
  async function del() { if (!post || !confirm("Excluir esta pauta?")) return; await fetch(`/api/content/${post.id}`, { method: "DELETE" }); onSaved(); }

  function loadActivity() {
    if (mode !== "edit" || !post) return;
    fetch(`/api/content/${post.id}/activity`).then((r) => (r.ok ? r.json() : [])).then((d) => setActivity(Array.isArray(d) ? d : []));
  }
  useEffect(() => { loadActivity(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendComment() {
    if (!comment.trim() || !post || posting) return;
    setPosting(true);
    const r = await fetch(`/api/content/${post.id}/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment.trim() }) });
    setPosting(false);
    if (r.ok) { setComment(""); loadActivity(); }
  }

  // Prévia pra avaliação — comprime no navegador e salva (sem fechar o modal).
  async function uploadPreview(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (e.target) e.target.value = "";
    if (!file || !post) return;
    if (!file.type.startsWith("image/")) { setErr("Selecione uma imagem."); return; }
    setBusy(true); setErr("");
    try {
      const dataUrl = await fileToPreviewDataUrl(file);
      if (await patch({ previewUrl: dataUrl })) { setPreviewUrl(dataUrl); onRefresh(); loadActivity(); }
    } catch { setErr("Falha ao processar a imagem."); } finally { setBusy(false); }
  }
  async function removePreview() {
    if (await patch({ previewUrl: null })) { setPreviewUrl(""); onRefresh(); }
  }

  const ro = !canBrief; // designer: briefing é só leitura
  const isUrl = /^https?:\/\//i.test(artUrl);

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Nova pauta" : (post?.title || "Post")} size="md"
      footer={mode === "create"
        ? <button onClick={create} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Criando…" : "Criar pauta"}</button>
        : <>
            {isAdmin && <button onClick={del} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--red)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginRight: "auto" }}><Trash2 size={13} /></button>}
            <button onClick={save} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Salvar</button>
          </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {ro && mode === "edit" && (
          <div style={{ fontSize: 11.5, color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", lineHeight: 1.5 }}>
            👀 Você está vendo a pauta do gestor (só leitura). Edite só o <b>link da arte</b>, fale pela <b>atividade</b> e arraste o card pra mudar de etapa.
          </div>
        )}
        <div>
          <label style={label}>Tema do post</label>
          <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} readOnly={ro} placeholder="Ex: Lei da atração — carrossel educativo" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Formato</label>
            <select style={field} value={type} onChange={(e) => setType(e.target.value)} disabled={ro}>
              <option value="feed">Feed</option>
              <option value="carrossel">Carrossel</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Data de publicação</label>
            <input type="date" style={field} value={publishDate} onChange={(e) => setPublishDate(e.target.value)} readOnly={ro} />
          </div>
        </div>
        <div>
          <label style={label}>Copy / legenda</label>
          <textarea style={{ ...field, height: "auto", minHeight: 64, padding: "8px 10px", resize: "vertical" }} value={copy ?? ""} onChange={(e) => setCopy(e.target.value)} readOnly={ro} placeholder="Texto da legenda…" />
        </div>
        <div>
          <label style={label}>Referências</label>
          <textarea style={{ ...field, height: "auto", minHeight: 44, padding: "8px 10px", resize: "vertical" }} value={refs ?? ""} onChange={(e) => setRefs(e.target.value)} readOnly={ro} placeholder="Links / ideias de referência…" />
        </div>

        {mode === "edit" && (
          <>
            {/* Prévia da arte — imagem leve só pra avaliar dentro do sistema */}
            <div>
              <label style={label}>Prévia da arte · para avaliação</label>
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="prévia" style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-base)" }} />
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: 16, textAlign: "center", border: "1px dashed var(--border-strong)", borderRadius: 10 }}>Sem prévia ainda.</div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>
                  <ImageIcon size={13} /> {busy ? "Processando…" : previewUrl ? "Trocar prévia" : "Subir prévia"}
                  <input type="file" accept="image/*" disabled={busy} style={{ display: "none" }} onChange={uploadPreview} />
                </label>
                {previewUrl && <button onClick={removePreview} disabled={busy} style={{ ...ghostBtn, padding: "7px 12px", color: "var(--red)" }}><Trash2 size={12} /> Remover</button>}
              </div>
              <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Imagem leve só pra visualizar aqui. O arquivo final em 100% vai no link do Drive abaixo.</p>
            </div>

            {/* Link da arte (Drive) — editável pelo designer e pelo gestor */}
            <div>
              <label style={label}>Link da arte final (Drive) · 100%</label>
              <input style={field} value={artUrl} onChange={(e) => setArtUrl(e.target.value)} placeholder="Cole o link do Google Drive com a arte…" />
              {isUrl && (
                <a href={artUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>
                  <ExternalLink size={13} /> Abrir arte
                </a>
              )}
            </div>

            {/* Atividade — conversa (comentários) + linha do tempo (eventos) num feed só */}
            <div>
              <label style={label}>Atividade</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto", padding: 10, border: "1px solid var(--border)", borderRadius: 10, background: "var(--bg-base)" }}>
                {activity === null ? (
                  <Loader2 size={15} className="animate-spin" style={{ color: "var(--text-muted)", margin: "8px auto" }} />
                ) : activity.length === 0 ? (
                  <p style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "center", padding: "8px 0" }}>Sem atividade ainda. Comece a conversa abaixo.</p>
                ) : activity.map((a) => {
                  const time = new Date(a.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
                  if (a.kind === "comment") {
                    const mine = !!a.authorId && a.authorId === meId;
                    return (
                      <div key={a.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "84%", background: mine ? "var(--accent-soft)" : "var(--bg-elevated)", border: `1px solid ${mine ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, padding: "7px 10px" }}>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: mine ? "var(--accent)" : "var(--text-secondary)", marginBottom: 2 }}>{a.authorName ?? "—"} <span style={{ fontWeight: 500, color: "var(--text-muted)" }}>· {time}</span></div>
                          <div style={{ fontSize: 12.5, color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{a.body}</div>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center", fontSize: 10.5, color: "var(--text-muted)" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-muted)", opacity: 0.5, flexShrink: 0 }} />
                      <span style={{ textAlign: "center" }}><b style={{ fontWeight: 600 }}>{a.authorName ?? "Sistema"}</b> {a.body} · {time}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input style={field} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Escreva um comentário…" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendComment(); } }} />
                <button onClick={sendComment} disabled={posting || !comment.trim()} title="Comentar" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 40, borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", opacity: posting || !comment.trim() ? 0.5 : 1 }}>
                  {posting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label style={label}>Etapa</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STAGES.map((s) => {
                  const locked = APPROVAL.includes(s.key) && !isAdmin;
                  const active = status === s.key;
                  return (
                    <button key={s.key} disabled={locked || busy} onClick={() => { setStatus(s.key); move(s.key); }}
                      style={{ padding: "6px 11px", borderRadius: 8, border: `1px solid ${active ? s.color : "var(--border)"}`, background: active ? `${s.color}1A` : "var(--bg-surface)", color: active ? s.color : locked ? "var(--text-muted)" : "var(--text-secondary)", fontSize: 12, fontWeight: 600, cursor: locked ? "not-allowed" : "pointer", opacity: locked ? 0.5 : 1 }}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {!isAdmin && <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 6 }}>Aprovar / agendar / publicar é só com o gestor.</p>}
            </div>

            {isAdmin && status === "revisao" && (
              <button onClick={() => move("aprovado")} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px", borderRadius: 9, border: "none", background: "var(--green)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                <Check size={15} /> Aprovar arte
              </button>
            )}
          </>
        )}

        {err && <p style={{ fontSize: 12, color: "var(--red)", background: "var(--red-soft)", padding: "8px 10px", borderRadius: 8 }}>{err}</p>}
      </div>
    </Modal>
  );
}
