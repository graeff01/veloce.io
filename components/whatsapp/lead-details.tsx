"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2, Phone, Megaphone, Hash, Tag, MessageSquare, Pencil, Check, X,
  ShieldCheck, ShieldAlert, Plus, Clock, ExternalLink,
} from "lucide-react";
import { FUNNEL_LABELS } from "@/lib/wa-format";
import type { LeadBadge } from "@/lib/wa-leads";
import { StatusBadge, TagChip } from "@/components/whatsapp/primitives/lead-badges";
import { MediaContent } from "@/components/whatsapp/wa-media";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TagT { id: string; name: string; color: string }
interface Msg { id: string; text: string | null; direction: string; type: string; timestamp: string; filename?: string | null }
interface LeadFull {
  contact: { id: string; waId: string; name: string | null; displayName: string | null; notes: string | null; reportValid: boolean; reportInvalidReason: string | null; createdAt: string };
  tags: TagT[];
  lead: { adTitle: string | null; adId: string | null; adModel: string | null; sourceType: string | null; sourceUrl: string | null; ctwaClid: string | null; enteredAt: string | null; imported: boolean } | null;
  funnelStage: string | null;
  items: Msg[];
}

const STAGES = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "convertido"];
const STAGE_COLORS: Record<string, string> = { recebido: "#3B82F6", respondido: "#8B5CF6", qualificado: "#F59E0B", negociacao: "#10B981", convertido: "#16A34A", perdido: "#EF4444" };
const TAG_COLORS = ["#7C3AED", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4"];
const MEDIA_TYPES = new Set(["image", "sticker", "audio", "video", "document"]);

function leadName(c: LeadFull["contact"]) { return c.displayName || c.name || `+${c.waId}`; }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function dayLabel(iso: string) { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }); }
function fmtDateTime(iso: string | null) { return iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"; }

// ─── Main ─────────────────────────────────────────────────────────────────────
export function LeadDetails({ clientId, contactId, badge, campaignName, onChanged, showTimeline = true }: {
  clientId: string; contactId: string; badge?: LeadBadge | null; campaignName?: string | null; onChanged?: () => void; showTimeline?: boolean;
}) {
  const [data, setData] = useState<LeadFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState<TagT[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/clients/${clientId}/whatsapp/conversations/${contactId}`);
    if (r.ok) setData(await r.json());
    setLoading(false);
  }, [clientId, contactId]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { fetch(`/api/clients/${clientId}/whatsapp/tags`).then((r) => (r.ok ? r.json() : [])).then(setAllTags).catch(() => {}); }, [clientId]);

  const patch = useCallback(async (body: Record<string, unknown>) => {
    setSaving(true);
    await fetch(`/api/clients/${clientId}/whatsapp/conversations/${contactId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => {});
    setSaving(false);
    onChanged?.();
  }, [clientId, contactId, onChanged]);

  if (loading || !data) {
    return <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><Loader2 size={20} style={{ animation: "spin 1s linear infinite", color: "var(--text-muted)" }} /></div>;
  }

  const c = data.contact;
  const inbound = data.items.filter((m) => m.direction !== "out").length;
  const outbound = data.items.filter((m) => m.direction === "out").length;
  const lastMsg = data.items[data.items.length - 1];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "18px 18px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, background: "var(--bg-surface)" }}>
        <Avatar name={leadName(c)} wa={c.waId} size={60} />
        <EditableName value={c.displayName} fallback={c.name || `+${c.waId}`}
          onSave={(v) => { setData({ ...data, contact: { ...c, displayName: v } }); patch({ displayName: v || null }); }} />
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, display: "flex", alignItems: "center", gap: 4 }}><Phone size={10} /> +{c.waId}</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {badge && <StatusBadge badge={badge} />}
          {data.lead && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "2px 8px", borderRadius: 99, display: "inline-flex", alignItems: "center", gap: 3 }}><Megaphone size={10} /> Anúncio</span>}
          {data.lead?.imported && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8B5CF6", background: "color-mix(in srgb, #8B5CF6 12%, transparent)", padding: "2px 8px", borderRadius: 99 }}>Importado</span>}
          {!c.reportValid && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#DC2626", background: "rgba(220,38,38,0.1)", padding: "2px 8px", borderRadius: 99 }}>Inválido p/ relatório</span>}
        </div>
      </div>

      {/* Funil */}
      <Card icon={<Hash size={13} />} title="Funil">
        <select value={data.funnelStage ?? ""} onChange={(e) => { const v = e.target.value || null; setData({ ...data, funnelStage: v }); patch({ funnelStage: v }); }}
          style={selectStyle}>
          <option value="">Sem etapa</option>
          {STAGES.map((s) => <option key={s} value={s}>{FUNNEL_LABELS[s]}</option>)}
        </select>
        {data.funnelStage && (
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: STAGE_COLORS[data.funnelStage] ?? "var(--text-muted)" }} />
            <span style={{ fontSize: 12, color: STAGE_COLORS[data.funnelStage] ?? "var(--text-muted)", fontWeight: 600 }}>{FUNNEL_LABELS[data.funnelStage]}</span>
          </div>
        )}
      </Card>

      {/* Tags */}
      <Card icon={<Tag size={13} />} title="Tags">
        <TagsEditor clientId={clientId} current={data.tags} all={allTags}
          onChange={(tags) => { setData({ ...data, tags }); patch({ tagIds: tags.map((t) => t.id) }); }}
          onNewTag={(t) => setAllTags((prev) => prev.some((x) => x.id === t.id) ? prev : [...prev, t])} />
      </Card>

      {/* Origem */}
      {data.lead && (
        <Card icon={<Megaphone size={13} color="var(--accent)" />} title="Origem · Meta Ads">
          <Row label="Anúncio" value={data.lead.adModel ?? data.lead.adTitle ?? "—"} accent />
          <Row label="Campanha" value={campaignName ?? "Não identificada"} />
          {data.lead.sourceType && <Row label="Tipo" value={data.lead.sourceType} />}
          {data.lead.adId && <Row label="ID do anúncio" value={data.lead.adId} />}
          <Row label="Entrada" value={fmtDateTime(data.lead.enteredAt)} />
          {data.lead.sourceUrl && <a href={data.lead.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--accent)", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4 }}>Ver origem do clique <ExternalLink size={11} /></a>}
        </Card>
      )}

      {/* Atendimento */}
      <Card icon={<MessageSquare size={13} />} title="Atendimento">
        <Row label="Mensagens do lead" value={String(inbound)} />
        {outbound > 0 && <Row label="Respostas da loja" value={String(outbound)} />}
        {lastMsg && <Row label="Última mensagem" value={fmtDateTime(lastMsg.timestamp)} />}
        <Row label="1º contato" value={fmtDateTime(c.createdAt)} />
      </Card>

      {/* Notas */}
      <Card icon={<Pencil size={13} />} title="Notas internas">
        <NotesEditor value={c.notes} onSave={(v) => { setData({ ...data, contact: { ...c, notes: v } }); patch({ notes: v || null }); }} />
      </Card>

      {/* Validação para relatório */}
      <Card icon={c.reportValid ? <ShieldCheck size={13} color="#16A34A" /> : <ShieldAlert size={13} color="#DC2626" />} title="Validação para relatório">
        <ValidityEditor valid={c.reportValid} reason={c.reportInvalidReason}
          onSave={(valid, reason) => { setData({ ...data, contact: { ...c, reportValid: valid, reportInvalidReason: reason } }); patch({ reportValid: valid, reportInvalidReason: reason }); }} />
      </Card>

      {/* Timeline */}
      {showTimeline && (
        <Card icon={<Clock size={13} />} title={`Conversa${inbound ? ` · ${inbound} do lead` : ""}`}>
          {data.items.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center", padding: 12 }}>Sem mensagens registradas.</p>
          ) : <Timeline items={data.items} clientId={clientId} />}
        </Card>
      )}

      {saving && <div style={{ position: "sticky", bottom: 0, padding: "6px 16px", fontSize: 11, color: "var(--text-muted)", textAlign: "center", background: "var(--bg-surface)" }}>Salvando…</div>}
    </div>
  );
}

// ─── Editable name ────────────────────────────────────────────────────────────
function EditableName({ value, fallback, onSave }: { value: string | null; fallback: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={fallback}
          onKeyDown={(e) => { if (e.key === "Enter") { onSave(draft.trim()); setEditing(false); } if (e.key === "Escape") setEditing(false); }}
          style={{ fontSize: 15, fontWeight: 700, textAlign: "center", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", background: "var(--bg-base)", color: "var(--text-primary)", outline: "none", maxWidth: 200 }} />
        <button onClick={() => { onSave(draft.trim()); setEditing(false); }} style={iconBtn}><Check size={14} color="#16A34A" /></button>
        <button onClick={() => setEditing(false)} style={iconBtn}><X size={14} color="var(--text-muted)" /></button>
      </div>
    );
  }
  return (
    <button onClick={() => { setDraft(value ?? ""); setEditing(true); }} title="Editar nome interno"
      style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer" }}>
      <span style={{ fontSize: 15.5, fontWeight: 700, color: "var(--text-primary)" }}>{value || fallback}</span>
      <Pencil size={12} color="var(--text-muted)" />
    </button>
  );
}

// ─── Tags editor ──────────────────────────────────────────────────────────────
function TagsEditor({ clientId, current, all, onChange, onNewTag }: { clientId: string; current: TagT[]; all: TagT[]; onChange: (tags: TagT[]) => void; onNewTag: (t: TagT) => void }) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const currentIds = new Set(current.map((t) => t.id));
  const suggestions = useMemo(() => all.filter((t) => !currentIds.has(t.id) && t.name.toLowerCase().includes(input.toLowerCase())), [all, current, input]);

  async function createAndAdd(name: string) {
    const n = name.trim();
    if (!n) return;
    const existing = all.find((t) => t.name.toLowerCase() === n.toLowerCase());
    if (existing) { onChange([...current, existing]); setInput(""); setAdding(false); return; }
    const color = TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
    const r = await fetch(`/api/clients/${clientId}/whatsapp/tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, color }) });
    if (r.ok) { const t = await r.json(); onNewTag(t); onChange([...current, t]); }
    setInput(""); setAdding(false);
  }

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: adding ? 8 : 0 }}>
        {current.map((t) => <TagChip key={t.id} name={t.name} color={t.color} onRemove={() => onChange(current.filter((x) => x.id !== t.id))} />)}
        {!adding && (
          <button onClick={() => setAdding(true)} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px dashed var(--border)", borderRadius: 99, padding: "2px 9px", cursor: "pointer" }}><Plus size={11} /> Tag</button>
        )}
      </div>
      {adding && (
        <div>
          <input autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder="Nome da tag + Enter"
            onKeyDown={(e) => { if (e.key === "Enter") createAndAdd(input); if (e.key === "Escape") { setAdding(false); setInput(""); } }}
            style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 12.5, outline: "none" }} />
          {suggestions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
              {suggestions.slice(0, 8).map((t) => (
                <button key={t.id} onClick={() => { onChange([...current, t]); setInput(""); setAdding(false); }} style={{ cursor: "pointer", background: "none", border: "none", padding: 0 }}>
                  <TagChip name={t.name} color={t.color} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Notes editor ─────────────────────────────────────────────────────────────
function NotesEditor({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const dirty = draft !== (value ?? "");
  return (
    <div>
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Anotações internas sobre o lead…" rows={3}
        style={{ width: "100%", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "8px 10px", fontSize: 12.5, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
      {dirty && (
        <button onClick={() => onSave(draft.trim())} style={{ marginTop: 6, height: 30, padding: "0 14px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Salvar nota</button>
      )}
    </div>
  );
}

// ─── Validity editor ──────────────────────────────────────────────────────────
function ValidityEditor({ valid, reason, onSave }: { valid: boolean; reason: string | null; onSave: (valid: boolean, reason: string | null) => void }) {
  const [draftReason, setDraftReason] = useState(reason ?? "");
  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSave(true, null)} style={{ flex: 1, height: 34, borderRadius: 8, border: `1px solid ${valid ? "#16A34A" : "var(--border)"}`, background: valid ? "color-mix(in srgb, #16A34A 10%, transparent)" : "var(--bg-base)", color: valid ? "#16A34A" : "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <ShieldCheck size={14} /> Válido
        </button>
        <button onClick={() => onSave(false, draftReason.trim() || null)} style={{ flex: 1, height: 34, borderRadius: 8, border: `1px solid ${!valid ? "#DC2626" : "var(--border)"}`, background: !valid ? "rgba(220,38,38,0.08)" : "var(--bg-base)", color: !valid ? "#DC2626" : "var(--text-secondary)", fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
          <ShieldAlert size={14} /> Inválido
        </button>
      </div>
      {!valid && (
        <div style={{ marginTop: 8 }}>
          <input value={draftReason} onChange={(e) => setDraftReason(e.target.value)} onBlur={() => onSave(false, draftReason.trim() || null)} placeholder="Motivo (spam, engano, teste…)"
            style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
        </div>
      )}
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>Leads inválidos saem do CSV e dos filtros (não alteram os totais do painel).</p>
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────
function Timeline({ items, clientId }: { items: Msg[]; clientId: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflowY: "auto" }}>
      {items.map((m, i) => {
        const incoming = m.direction !== "out";
        const prev = i > 0 ? items[i - 1] : null;
        const showDay = !prev || dayLabel(prev.timestamp) !== dayLabel(m.timestamp);
        return (
          <div key={m.id}>
            {showDay && <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 6px" }}><span style={{ fontSize: 10.5, color: "var(--text-secondary)", background: "var(--bg-elevated)", padding: "3px 10px", borderRadius: 99 }}>{dayLabel(m.timestamp)}</span></div>}
            <div style={{ display: "flex", justifyContent: incoming ? "flex-start" : "flex-end", marginBottom: 3 }}>
              <div style={{ maxWidth: "85%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, justifyContent: incoming ? "flex-start" : "flex-end" }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: incoming ? "var(--accent)" : "#16A34A" }}>{incoming ? "Lead" : "Loja"}</span>
                  <span style={{ fontSize: 9.5, color: "var(--text-muted)" }}>{fmtTime(m.timestamp)}</span>
                </div>
                <div style={{ padding: "7px 10px", borderRadius: 10, background: incoming ? "var(--bg-surface)" : "color-mix(in srgb, #16A34A 10%, var(--bg-surface))", border: `1px solid ${incoming ? "var(--border)" : "color-mix(in srgb, #16A34A 20%, var(--border))"}`, fontSize: 12.5, lineHeight: 1.4, color: "var(--text-primary)" }}>
                  {MEDIA_TYPES.has(m.type)
                    ? <MediaContent clientId={clientId} msgId={m.id} type={m.type} caption={m.text && !m.text.startsWith("[") ? m.text : null} filename={m.filename} />
                    : <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.text}</span>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

// ─── Small bits ───────────────────────────────────────────────────────────────
function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ borderBottom: "1px solid var(--border)", padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 11 }}>
        <span style={{ color: "var(--text-muted)" }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}
function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
      <span style={{ fontSize: 11.5, color: "var(--text-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, color: accent ? "var(--accent)" : "var(--text-primary)", fontWeight: accent ? 600 : 400, textAlign: "right", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}
function Avatar({ name, wa, size = 60 }: { name: string | null; wa: string; size?: number }) {
  const palette = ["#7C3AED", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899", "#06B6D4", "#8B5CF6"];
  let h = 0; const seed = wa || "x";
  for (const ch of seed) h = (h + ch.charCodeAt(0)) % palette.length;
  const initials = (name ?? wa).trim().split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return <div style={{ width: size, height: size, borderRadius: "50%", background: palette[h], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: Math.round(size * 0.34), fontWeight: 700, flexShrink: 0 }}>{initials}</div>;
}

const selectStyle: React.CSSProperties = { width: "100%", height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 10px", fontSize: 13, outline: "none", cursor: "pointer" };
const iconBtn: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", display: "flex", padding: 2 };
