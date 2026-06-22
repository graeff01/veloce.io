"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Modal } from "@/components/ui/modal";
import { Plus, Loader2, Trash2, Check, Upload, ImageIcon } from "lucide-react";

interface Post {
  id: string; title: string; type: string; copy: string | null; references: string | null;
  status: string; publishDate: string | null; artUrl: string | null; feedback: string | null; approvedAt: string | null;
}

const STAGES: { key: string; label: string; color: string }[] = [
  { key: "pauta",     label: "Pauta",       color: "#64748B" },
  { key: "criacao",   label: "Em criação",  color: "#2563EB" },
  { key: "revisao",   label: "Revisão",     color: "#D97706" },
  { key: "aprovado",  label: "Aprovado",    color: "#16A34A" },
  { key: "agendado",  label: "Agendado",    color: "#7C3AED" },
  { key: "publicado", label: "Publicado",   color: "#0F766E" },
];
const APPROVAL = ["aprovado", "agendado", "publicado"];

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--shadow-card)" };
const field: React.CSSProperties = { width: "100%", height: 36, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, boxSizing: "border-box" };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.4, display: "block", marginBottom: 6 };

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function ContentBoard() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const isAdmin = role === "ADMIN";
  const canBrief = role === "ADMIN" || role === "OPERATIONAL";

  const [posts, setPosts] = useState<Post[] | null>(null);
  const [open, setOpen] = useState<Post | null>(null);
  const [creating, setCreating] = useState(false);

  function load() {
    fetch("/api/content").then((r) => (r.ok ? r.json() : [])).then((d) => setPosts(Array.isArray(d) ? d : []));
  }
  useEffect(() => { load(); }, []);

  if (!posts) return <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Loader2 size={22} className="animate-spin" style={{ color: "var(--text-muted)" }} /></div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 24px 14px" }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.02em" }}>Conteúdo · Veloce</h1>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 }}>Produção das artes do Instagram da Veloce — da pauta à publicação.</p>
        </div>
        {canBrief && (
          <button onClick={() => setCreating(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 9, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={15} /> Nova pauta
          </button>
        )}
      </div>

      {/* Board */}
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
                        <span style={{ fontSize: 10, fontWeight: 600, color: p.type === "carrossel" ? "#7C3AED" : "#2563EB", background: p.type === "carrossel" ? "#7C3AED1A" : "#2563EB1A", padding: "1px 7px", borderRadius: 20 }}>{p.type === "carrossel" ? "Carrossel" : "Feed"}</span>
                        {p.publishDate && <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>📅 {fmtDate(p.publishDate)}</span>}
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

      {creating && <PostModal mode="create" canBrief={canBrief} isAdmin={isAdmin} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {open && <PostModal mode="edit" post={open} canBrief={canBrief} isAdmin={isAdmin} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />}
    </div>
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function patch(body: Record<string, unknown>) {
    if (!post) return;
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

  async function saveBriefing() {
    if (await patch({ title, type, copy, references: refs, publishDate: publishDate || null, feedback })) onSaved();
  }
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

  const readOnlyBrief = !canBrief; // designer não edita a pauta

  return (
    <Modal open onClose={onClose} title={mode === "create" ? "Nova pauta" : (post?.title || "Post")} size="md"
      footer={mode === "create"
        ? <button onClick={create} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>{busy ? "Criando…" : "Criar pauta"}</button>
        : <>
            {isAdmin && <button onClick={del} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--red)", fontSize: 13, fontWeight: 600, cursor: "pointer", marginRight: "auto" }}><Trash2 size={13} /></button>}
            {canBrief && <button onClick={saveBriefing} disabled={busy} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>Salvar</button>}
          </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Briefing */}
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
            {/* Arte */}
            <div>
              <label style={label}>Arte</label>
              {artUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artUrl} alt="arte" style={{ width: "100%", maxHeight: 280, objectFit: "contain", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg-base)" }} />
              ) : (
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "16px", textAlign: "center", border: "1px dashed var(--border-strong)", borderRadius: 10 }}>Sem arte ainda.</div>
              )}
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <Upload size={13} /> {artUrl ? "Trocar arte" : "Subir arte"}
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={uploadArt} />
              </label>
            </div>

            {/* Feedback do gestor */}
            {(canBrief || feedback) && (
              <div>
                <label style={label}>Feedback do gestor</label>
                <textarea style={{ ...field, height: "auto", minHeight: 48, padding: "8px 10px", resize: "vertical" }} value={feedback ?? ""} onChange={(e) => setFeedback(e.target.value)} readOnly={!canBrief} placeholder="Ajustes pedidos…" />
              </div>
            )}

            {/* Mover etapa */}
            <div>
              <label style={label}>Etapa</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STAGES.map((s) => {
                  const locked = APPROVAL.includes(s.key) && !isAdmin; // só admin aprova/agenda/publica
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

            {/* Aprovar rápido (admin) */}
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
