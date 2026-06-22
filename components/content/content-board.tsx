"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Trash2, Check, Upload, ImageIcon, LayoutGrid, CalendarDays, RefreshCw, ChevronLeft, ChevronRight, Repeat } from "lucide-react";

interface Post {
  id: string; title: string; type: string; copy: string | null; references: string | null;
  status: string; publishDate: string | null; artUrl: string | null; feedback: string | null; approvedAt: string | null;
}
interface Recurrence { id: string; label: string; type: string; weekday: number }
interface Version { id: string; artUrl: string; createdAt: string }

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

  function load() {
    fetch("/api/content").then((r) => (r.ok ? r.json() : [])).then((d) => setPosts(Array.isArray(d) ? d : []));
  }
  useEffect(() => { load(); }, []);

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

        {canBrief && (
          <>
            {seedMsg && <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{seedMsg}</span>}
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
            return (
              <div key={st.key} style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 230, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 14 }}>
                <div style={{ padding: "11px 14px 9px", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid var(--border)" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-primary)", flex: 1 }}>{st.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: items.length ? st.color : "var(--text-muted)", background: items.length ? `${st.color}1A` : "transparent", padding: "1px 7px", borderRadius: 20, minWidth: 22, textAlign: "center" }}>{items.length}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.length === 0 && <p style={{ fontSize: 11.5, color: "var(--text-muted)", textAlign: "center", padding: "20px 8px", opacity: 0.6 }}>—</p>}
                  {items.map((p) => (
                    <button key={p.id} onClick={() => setOpen(p)} style={{ ...card, textAlign: "left", cursor: "pointer", padding: 0, overflow: "hidden", borderLeft: `3px solid ${st.color}` }}>
                      {p.artUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.artUrl} alt="" style={{ width: "100%", height: 96, objectFit: "cover", display: "block" }} />
                      )}
                      <div style={{ padding: "9px 11px" }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.3 }}>{p.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                          <span style={typePill(p.type)}>{p.type === "carrossel" ? "Carrossel" : "Feed"}</span>
                          {p.publishDate && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>📅 {ddmm(p.publishDate)}</span>}
                          {!p.artUrl && <ImageIcon size={11} style={{ color: "var(--text-muted)", opacity: 0.6 }} />}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <CalendarView posts={posts} month={month} year={year} onPrev={prevMonth} onNext={nextMonth} onOpen={setOpen} />
      )}

      {creating && <PostModal mode="create" canBrief={canBrief} isAdmin={isAdmin} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {open && <PostModal mode="edit" post={open} canBrief={canBrief} isAdmin={isAdmin} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
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

function PostModal({ mode, post, canBrief, isAdmin, onClose, onSaved }: { mode: "create" | "edit"; post?: Post; canBrief: boolean; isAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [type, setType] = useState(post?.type ?? "feed");
  const [copy, setCopy] = useState(post?.copy ?? "");
  const [refs, setRefs] = useState(post?.references ?? "");
  const [publishDate, setPublishDate] = useState(post?.publishDate ? post.publishDate.slice(0, 10) : "");
  const [artUrl, setArtUrl] = useState(post?.artUrl ?? "");
  const [feedback, setFeedback] = useState(post?.feedback ?? "");
  const [status, setStatus] = useState(post?.status ?? "pauta");
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (mode === "edit" && post) fetch(`/api/content/${post.id}/versions`).then((r) => (r.ok ? r.json() : [])).then((d) => setVersions(Array.isArray(d) ? d : []));
  }, [mode, post]);

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
  async function saveBriefing() { if (await patch({ title, type, copy, references: refs, publishDate: publishDate || null, feedback })) onSaved(); }
  async function uploadArt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file && e.target) e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Selecione uma imagem."); return; }
    if (file.size > 3 * 1024 * 1024) { setErr("Arte muito grande (máx. 3MB)."); return; }
    const reader = new FileReader();
    reader.onload = async () => { const url = reader.result as string; setArtUrl(url); if (await patch({ artUrl: url })) onSaved(); };
    reader.readAsDataURL(file);
  }
  async function move(to: string) { if (await patch({ status: to })) onSaved(); }
  async function del() { if (!post || !confirm("Excluir esta pauta?")) return; await fetch(`/api/content/${post.id}`, { method: "DELETE" }); onSaved(); }

  const readOnlyBrief = !canBrief;

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Nova pauta" : (post?.title || "Post")} size="md"
      footer={mode === "create"
        ? <button onClick={create} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Criando…" : "Criar pauta"}</button>
        : <>
            {isAdmin && <button onClick={del} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--red)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginRight: "auto" }}><Trash2 size={13} /></button>}
            {canBrief && <button onClick={saveBriefing} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Salvar</button>}
          </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={label}>Tema do post</label>
          <input style={field} value={title} onChange={(e) => setTitle(e.target.value)} readOnly={readOnlyBrief} placeholder="Ex: Lei da atração — carrossel educativo" />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Formato</label>
            <select style={field} value={type} onChange={(e) => setType(e.target.value)} disabled={readOnlyBrief}>
              <option value="feed">Feed</option>
              <option value="carrossel">Carrossel</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>Data de publicação</label>
            <input type="date" style={field} value={publishDate} onChange={(e) => setPublishDate(e.target.value)} readOnly={readOnlyBrief} />
          </div>
        </div>
        <div>
          <label style={label}>Copy / legenda</label>
          <textarea style={{ ...field, height: "auto", minHeight: 64, padding: "8px 10px", resize: "vertical" }} value={copy ?? ""} onChange={(e) => setCopy(e.target.value)} readOnly={readOnlyBrief} placeholder="Texto da legenda…" />
        </div>
        <div>
          <label style={label}>Referências</label>
          <textarea style={{ ...field, height: "auto", minHeight: 44, padding: "8px 10px", resize: "vertical" }} value={refs ?? ""} onChange={(e) => setRefs(e.target.value)} readOnly={readOnlyBrief} placeholder="Links / ideias de referência…" />
        </div>

        {mode === "edit" && (
          <>
            <div>
              <label style={label}>Arte {versions.length > 0 ? `· V${versions.length}` : ""}</label>
              {artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artUrl} alt="arte" style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-base)" }} />
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "16px", textAlign: "center", border: "1px dashed var(--border-strong)", borderRadius: 10 }}>Sem arte ainda.</div>
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <Upload size={13} /> {artUrl ? "Subir nova versão" : "Subir arte"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={uploadArt} />
              </label>

              {/* Histórico de versões */}
              {versions.length > 1 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Versões</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {versions.map((v, i) => (
                      <a key={v.id} href={v.artUrl} target="_blank" rel="noopener noreferrer" title={`V${i + 1} · ${new Date(v.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`} style={{ display: "block", position: "relative" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.artUrl} alt={`V${i + 1}`} style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, border: `2px solid ${v.artUrl === artUrl ? "var(--accent)" : "var(--border)"}` }} />
                        <span style={{ position: "absolute", bottom: 2, left: 2, fontSize: 9, fontWeight: 700, color: "#fff", background: "rgba(0,0,0,.6)", padding: "0 4px", borderRadius: 4 }}>V{i + 1}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(canBrief || feedback) && (
              <div>
                <label style={label}>Feedback do gestor</label>
                <textarea style={{ ...field, height: "auto", minHeight: 48, padding: "8px 10px", resize: "vertical" }} value={feedback ?? ""} onChange={(e) => setFeedback(e.target.value)} readOnly={!canBrief} placeholder="Ajustes pedidos…" />
              </div>
            )}

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
