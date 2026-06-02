"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Plus, X, Zap, Calendar,
  AlignLeft, ExternalLink, Loader2, Check,
  LayoutGrid, List, Clock, CheckSquare, Mic, Users,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Movement {
  id: string;
  clientId: string;
  title: string;
  category: string;
  status: "PLANNED" | "IN_PROGRESS" | "REVIEW" | "DONE" | "ARCHIVED";
  priority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW";
  date: string;
  endDate?: string | null;
  description?: string | null;
  links: string[];
  tags: string[];
  client: { id: string; name: string; brand?: string | null };
  assignee?: { id: string; name: string } | null;
}

interface Client {
  id: string;
  name: string;
  brand?: string | null;
}

interface CalTask {
  id: string;
  clientId: string;
  title: string;
  type: string | null;
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
  dueDate: string;
  client?: { id: string; name: string; brand?: string | null };
}

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTHS = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const WEEKDAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const WEEKDAYS_LONG  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

const CATEGORIES = [
  "Campanha","Conteúdo","Reunião","Estratégia","Entrega","Análise",
  "Gravação","Criativo","Aprovação","Ajuste","Captação","Outro",
];

const STATUS_CONFIG: Record<Movement["status"], { label: string; color: string; bg: string }> = {
  PLANNED:     { label: "Planejado",    color: "var(--text-muted)",    bg: "var(--bg-elevated)" },
  IN_PROGRESS: { label: "Em andamento", color: "#D97706",              bg: "#FEF3C7" },
  REVIEW:      { label: "Em revisão",   color: "#7C3AED",              bg: "#EDE9FE" },
  DONE:        { label: "Concluído",    color: "#16A34A",              bg: "#DCFCE7" },
  ARCHIVED:    { label: "Arquivado",    color: "var(--text-muted)",    bg: "var(--bg-surface)" },
};

const PRIORITY_DOT: Record<Movement["priority"], string> = {
  CRITICAL: "#DC2626",
  HIGH:     "#D97706",
  NORMAL:   "transparent",
  LOW:      "transparent",
};

// Client color palette — deterministic by clientId hash
const CLIENT_COLORS = [
  { bg: "#EDE9FE", border: "#7C3AED", text: "#5B21B6" },
  { bg: "#DBEAFE", border: "#2563EB", text: "#1D4ED8" },
  { bg: "#DCFCE7", border: "#16A34A", text: "#15803D" },
  { bg: "#FEF3C7", border: "#D97706", text: "#B45309" },
  { bg: "#FFE4E6", border: "#E11D48", text: "#BE123C" },
  { bg: "#E0F2FE", border: "#0284C7", text: "#0369A1" },
  { bg: "#F0FDF4", border: "#22C55E", text: "#15803D" },
  { bg: "#FDF4FF", border: "#A855F7", text: "#7E22CE" },
];

function clientColor(clientId: string) {
  let h = 0;
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) % CLIENT_COLORS.length;
  return CLIENT_COLORS[h];
}

function fmtDay(iso: string) {
  return new Date(iso).getDate();
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function localDate(iso: string) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── Quick-create modal ─────────────────────────────────────────────────────────

function MovementModal({
  clients,
  initial,
  onClose,
  onSaved,
}: {
  clients: Client[];
  initial?: { date?: Date; movement?: Movement };
  onClose: () => void;
  onSaved: (m: Movement) => void;
}) {
  const isEdit = !!initial?.movement;
  const mv = initial?.movement;

  const [clientId,    setClientId]    = useState(mv?.clientId    ?? (clients[0]?.id ?? ""));
  const [title,       setTitle]       = useState(mv?.title       ?? "");
  const [category,    setCategory]    = useState(mv?.category    ?? "Conteúdo");
  const [status,      setStatus]      = useState<Movement["status"]>(mv?.status ?? "PLANNED");
  const [priority,    setPriority]    = useState<Movement["priority"]>(mv?.priority ?? "NORMAL");
  const [date,        setDate]        = useState(mv ? mv.date.slice(0,10) : initial?.date?.toISOString().slice(0,10) ?? new Date().toISOString().slice(0,10));
  const [description, setDescription] = useState(mv?.description ?? "");
  const [linkDraft,   setLinkDraft]   = useState("");
  const [links,       setLinks]       = useState<string[]>(mv?.links ?? []);
  const [saving,      setSaving]      = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  async function save() {
    if (!title.trim() || !clientId) return;
    setSaving(true);
    const url    = isEdit ? `/api/movements/${mv!.id}` : "/api/movements";
    const method = isEdit ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, title: title.trim(), category, status, priority, date, description: description || null, links }),
    });
    setSaving(false);
    if (res.ok) { const m = await res.json(); onSaved(m); }
  }

  function addLink() {
    const l = linkDraft.trim();
    if (l && !links.includes(l)) { setLinks(prev => [...prev, l]); setLinkDraft(""); }
  }

  const sel: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 13,
    outline: "none", width: "100%",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 520, background: "var(--bg-surface)", borderRadius: 16,
          border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            {isEdit ? "Editar movimentação" : "Nova movimentação"}
          </span>
          <button onClick={onClose} style={{ display: "flex", padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(); }}
            placeholder="O que está acontecendo?"
            style={{
              ...sel, fontSize: 15, fontWeight: 600, padding: "10px 12px",
              background: "var(--bg-elevated)",
            }}
          />

          {/* Row: client + category */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Cliente</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} style={sel}>
                {clients.map(c => <option key={c.id} value={c.id}>{c.brand || c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Categoria</label>
              <select value={category} onChange={e => setCategory(e.target.value)} style={sel}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Row: date + status + priority */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={sel} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as Movement["status"])} style={sel}>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Prioridade</label>
              <select value={priority} onChange={e => setPriority(e.target.value as Movement["priority"])} style={sel}>
                <option value="CRITICAL">Crítica</option>
                <option value="HIGH">Alta</option>
                <option value="NORMAL">Normal</option>
                <option value="LOW">Baixa</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
              <AlignLeft size={10} style={{ display: "inline", marginRight: 4 }} />Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Contexto, observações, detalhes..."
              style={{ ...sel, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {/* Links */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
              <ExternalLink size={10} style={{ display: "inline", marginRight: 4 }} />Links
            </label>
            <div style={{ display: "flex", gap: 6, marginBottom: links.length ? 6 : 0 }}>
              <input
                value={linkDraft}
                onChange={e => setLinkDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }}
                placeholder="https://..."
                style={{ ...sel, flex: 1 }}
              />
              <button onClick={addLink} style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Add
              </button>
            </div>
            {links.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {links.map((l, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", fontSize: 11, color: "var(--accent)" }}>
                    <ExternalLink size={9} />
                    <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.replace(/^https?:\/\//, "")}</span>
                    <button onClick={() => setLinks(prev => prev.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", padding: 0, display: "flex" }}>
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={!title.trim() || !clientId || saving}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 18px", borderRadius: 9, border: "none",
              background: title.trim() && clientId ? "var(--accent)" : "var(--bg-elevated)",
              color: title.trim() && clientId ? "#fff" : "var(--text-muted)",
              cursor: title.trim() && clientId ? "pointer" : "default",
              fontSize: 13, fontWeight: 600,
            }}
          >
            {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={13} />}
            {isEdit ? "Salvar" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Meeting Schedule Modal ────────────────────────────────────────────────────
// Creates: (1) a Meeting record for the Reuniões tab, (2) a kanban Task of
// type "Reunião" so it shows in the board, and (3) opens Google Calendar with
// all fields pre-filled so the user confirms the event there.

function buildGCalUrl({
  title, date, time, durationMins, participants, description,
}: {
  title: string; date: string; time: string; durationMins: number;
  participants: string[]; description: string;
}): string {
  const startDt = new Date(`${date}T${time || "09:00"}:00`);
  const endDt   = new Date(startDt.getTime() + durationMins * 60_000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}${String(d.getMinutes()).padStart(2,"0")}00`;
  const details = [
    participants.length ? `Participantes: ${participants.join(", ")}` : "",
    description,
    "Agendado via Veloce.io",
  ].filter(Boolean).join("\n\n");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text:   title,
    dates:  `${fmt(startDt)}/${fmt(endDt)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function MeetingScheduleModal({
  clients,
  initialDate,
  onClose,
}: {
  clients: Client[];
  initialDate?: Date;
  onClose: () => void;
}) {
  const defaultDate = (initialDate ?? new Date()).toISOString().slice(0, 10);
  const [clientId,      setClientId]      = useState(clients[0]?.id ?? "");
  const [title,         setTitle]         = useState("");
  const [date,          setDate]          = useState(defaultDate);
  const [time,          setTime]          = useState("09:00");
  const [durationMins,  setDurationMins]  = useState(60);
  const [participantDraft, setParticipantDraft] = useState("");
  const [participants,  setParticipants]  = useState<string[]>([]);
  const [description,   setDescription]  = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState("");
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { titleRef.current?.focus(); }, []);

  function addParticipant() {
    const v = participantDraft.trim();
    if (v && !participants.includes(v)) { setParticipants(p => [...p, v]); setParticipantDraft(""); }
  }

  async function handleSave() {
    if (!title.trim() || !clientId) return;
    setSaving(true);
    setError("");
    try {
      // 1 — create Meeting record (populates Reuniões tab)
      const meetingRes = await fetch(`/api/clients/${clientId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), date: `${date}T${time}:00`, participants, description: description || undefined }),
      });
      if (!meetingRes.ok) throw new Error("Erro ao criar reunião");

      // 2 — create kanban Task of type "Reunião" (populates kanban board)
      await fetch(`/api/clients/${clientId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          type: "Reunião",
          planMonth: new Date(date).getMonth() + 1,
          planYear:  new Date(date).getFullYear(),
          dueDate:   `${date}T${time}:00`,
          description: description || undefined,
        }),
      });

      // 3 — open Google Calendar (user confirms the event there)
      const gcUrl = buildGCalUrl({ title: title.trim(), date, time, durationMins, participants, description });
      window.open(gcUrl, "_blank", "noopener,noreferrer");

      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
      setSaving(false);
    }
  }

  const sel: React.CSSProperties = {
    padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--bg-base)", color: "var(--text-primary)", fontSize: 13,
    outline: "none", width: "100%",
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 540, background: "var(--bg-surface)", borderRadius: 16,
          border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(124,58,237,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Mic size={15} color="#7C3AED" />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "block" }}>Agendar Reunião</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Cria reunião no sistema, tarefa no kanban e abre o Google Agenda</span>
          </div>
          <button onClick={onClose} style={{ display: "flex", padding: 4, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)" }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            placeholder="Título da reunião"
            style={{ ...sel, fontSize: 15, fontWeight: 600, padding: "10px 12px", background: "var(--bg-elevated)" }}
          />

          {/* Client */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Cliente</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={sel}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.brand || c.name}</option>)}
            </select>
          </div>

          {/* Date + Time + Duration */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Data</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={sel} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Horário</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} style={sel} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>Duração</label>
              <select value={durationMins} onChange={e => setDurationMins(Number(e.target.value))} style={sel}>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>1 hora</option>
                <option value={90}>1h 30min</option>
                <option value={120}>2 horas</option>
                <option value={180}>3 horas</option>
              </select>
            </div>
          </div>

          {/* Participants */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
              <Users size={10} style={{ display: "inline", marginRight: 4 }} />Participantes
            </label>
            <div style={{ display: "flex", gap: 6, marginBottom: participants.length ? 6 : 0 }}>
              <input
                value={participantDraft}
                onChange={e => setParticipantDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addParticipant(); } }}
                placeholder="Nome ou e-mail"
                style={{ ...sel, flex: 1 }}
              />
              <button
                type="button"
                onClick={addParticipant}
                style={{ padding: "7px 14px", borderRadius: 8, background: "var(--accent)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
              >
                Add
              </button>
            </div>
            {participants.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {participants.map((p, i) => (
                  <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", fontSize: 11, color: "#7C3AED" }}>
                    {p}
                    <button onClick={() => setParticipants(prev => prev.filter((_, j) => j !== i))} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#7C3AED", padding: 0, display: "flex" }}>
                      <X size={9} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Agenda/description */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", display: "block", marginBottom: 5 }}>
              <AlignLeft size={10} style={{ display: "inline", marginRight: 4 }} />Pauta / Descrição (opcional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Tópicos a discutir, objetivos, contexto..."
              style={{ ...sel, resize: "none", lineHeight: 1.5 }}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#DC2626", background: "rgba(220,38,38,0.08)", padding: "8px 12px", borderRadius: 8, margin: 0 }}>{error}</p>
          )}

          {/* What will happen preview */}
          <div style={{ background: "var(--bg-elevated)", borderRadius: 9, padding: "10px 14px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 5 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", margin: 0 }}>Ao confirmar</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                { icon: <Mic size={10} color="#7C3AED" />, text: "Reunião registrada na aba Reuniões do cliente", color: "#7C3AED" },
                { icon: <Check size={10} color="#2563EB" />, text: "Tarefa \"Reunião\" criada no kanban do cliente", color: "#2563EB" },
                { icon: <ExternalLink size={10} color="#16A34A" />, text: "Google Agenda abre com os dados pré-preenchidos", color: "#16A34A" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {item.icon}
                  <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", cursor: "pointer", fontSize: 13 }}>
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !clientId || saving}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 20px", borderRadius: 9, border: "none",
              background: title.trim() && clientId ? "#7C3AED" : "var(--bg-elevated)",
              color: title.trim() && clientId ? "#fff" : "var(--text-muted)",
              cursor: title.trim() && clientId ? "pointer" : "default",
              fontSize: 13, fontWeight: 600,
            }}
          >
            {saving
              ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              : <ExternalLink size={13} />}
            Agendar e abrir Google Agenda
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Status cycle button ────────────────────────────────────────────────────────

const STATUS_CYCLE: Movement["status"][] = ["PLANNED","IN_PROGRESS","REVIEW","DONE"];

function StatusPill({ status, onChange }: { status: Movement["status"]; onChange: (s: Movement["status"]) => void }) {
  const cfg = STATUS_CONFIG[status];
  function next() {
    const idx = STATUS_CYCLE.indexOf(status);
    onChange(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
  }
  return (
    <button
      onClick={e => { e.stopPropagation(); next(); }}
      title="Clique para avançar status"
      style={{
        display: "inline-flex", alignItems: "center", gap: 4,
        padding: "2px 7px", borderRadius: 20, border: "none",
        background: cfg.bg, color: cfg.color,
        fontSize: 10, fontWeight: 700, cursor: "pointer",
        whiteSpace: "nowrap", flexShrink: 0,
        transition: "opacity 150ms",
      }}
    >
      {status === "DONE" && <Check size={9} />}
      {cfg.label}
    </button>
  );
}

// ── Movement card (calendar cell) ──────────────────────────────────────────────

function MovCard({
  mv,
  onEdit,
  onStatusChange,
}: {
  mv: Movement;
  onEdit: (m: Movement) => void;
  onStatusChange: (id: string, status: Movement["status"]) => void;
}) {
  const cc = clientColor(mv.clientId);
  const isDone = mv.status === "DONE";

  return (
    <div
      onClick={() => onEdit(mv)}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 7px", borderRadius: 7, marginBottom: 2,
        border: `1px solid ${cc.border}22`,
        background: isDone ? "var(--bg-base)" : cc.bg,
        cursor: "pointer",
        opacity: isDone ? 0.55 : 1,
        transition: "opacity 150ms",
      }}
    >
      {/* Priority dot */}
      {(mv.priority === "CRITICAL" || mv.priority === "HIGH") && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: PRIORITY_DOT[mv.priority], flexShrink: 0 }} />
      )}
      {/* Client dot */}
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cc.border, flexShrink: 0 }} />
      {/* Title */}
      <span style={{
        flex: 1, fontSize: 11, fontWeight: 500, color: cc.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        textDecoration: isDone ? "line-through" : "none",
      }}>
        {mv.title}
      </span>
      {/* Status pill */}
      <StatusPill status={mv.status} onChange={s => onStatusChange(mv.id, s)} />
    </div>
  );
}

// ── Agenda item ────────────────────────────────────────────────────────────────

function AgendaItem({
  mv,
  onEdit,
  onStatusChange,
}: {
  mv: Movement;
  onEdit: (m: Movement) => void;
  onStatusChange: (id: string, s: Movement["status"]) => void;
}) {
  const cc  = clientColor(mv.clientId);
  const cfg = STATUS_CONFIG[mv.status];
  const isDone = mv.status === "DONE";

  return (
    <div
      onClick={() => onEdit(mv)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 14,
        padding: "14px 18px", borderRadius: 12,
        border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        cursor: "pointer",
        opacity: isDone ? 0.6 : 1,
        transition: "box-shadow 150ms",
      }}
    >
      {/* Client color bar */}
      <div style={{ width: 4, borderRadius: 4, background: cc.border, flexShrink: 0, alignSelf: "stretch" }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 14, fontWeight: 600, color: "var(--text-primary)",
            textDecoration: isDone ? "line-through" : "none",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {mv.title}
          </span>
          {(mv.priority === "CRITICAL" || mv.priority === "HIGH") && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: PRIORITY_DOT[mv.priority], flexShrink: 0 }} />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: cc.bg, color: cc.text, fontWeight: 600 }}>
            {mv.client.brand || mv.client.name}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{mv.category}</span>
          {mv.description && (
            <span style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300 }}>
              {mv.description}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {mv.links.length > 0 && (
          <ExternalLink size={12} style={{ color: "var(--text-muted)" }} />
        )}
        <StatusPill status={mv.status} onChange={s => onStatusChange(mv.id, s)} />
      </div>
    </div>
  );
}

// ── Agenda View (side-by-side day columns) ────────────────────────────────────

function AgendaView({
  movements, calTasks, showTasks, month, year, now,
  onEdit, onStatusChange, onNewMovement, onNewMeeting,
}: {
  movements: Movement[];
  calTasks: CalTask[];
  showTasks: boolean;
  month: number;
  year: number;
  now: Date;
  onEdit: (m: Movement) => void;
  onStatusChange: (id: string, s: Movement["status"]) => void;
  onNewMovement: () => void;
  onNewMeeting: () => void;
}) {
  // Build a map of all days that have items
  const byDay: Record<string, { mvs: Movement[]; tasks: CalTask[] }> = {};
  movements.forEach(m => {
    const key = m.date.slice(0, 10);
    if (!byDay[key]) byDay[key] = { mvs: [], tasks: [] };
    byDay[key].mvs.push(m);
  });
  if (showTasks) {
    calTasks.forEach(t => {
      const key = t.dueDate.slice(0, 10);
      if (!byDay[key]) byDay[key] = { mvs: [], tasks: [] };
      byDay[key].tasks.push(t);
    });
  }

  const days = Object.keys(byDay).sort();

  if (days.length === 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, padding: "60px 0", color: "var(--text-muted)" }}>
        <Calendar size={40} style={{ opacity: 0.3 }} />
        <p style={{ fontSize: 14 }}>Nenhum item em {MONTHS[month - 1]}</p>
        <button onClick={onNewMeeting} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, border: "none", background: "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Mic size={13} /> Agendar reunião
        </button>
      </div>
    );
  }

  // Group days into weeks (rows of up to 7 days)
  const COLS = 5; // show 5 day columns at a time feels like Google Calendar
  const chunks: string[][] = [];
  for (let i = 0; i < days.length; i += COLS) chunks.push(days.slice(i, i + COLS));

  return (
    <div style={{ overflowY: "auto", flex: 1, padding: "16px 20px" }}>
      {chunks.map((chunk, ci) => (
        <div key={ci} style={{ marginBottom: 20 }}>
          {/* Day header row */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${chunk.length}, 1fr)`, gap: 8, marginBottom: 0 }}>
            {chunk.map(day => {
              const d = new Date(day + "T12:00:00");
              const isToday = isSameDay(d, now);
              const total = byDay[day].mvs.length + byDay[day].tasks.length;
              return (
                <div key={day} style={{
                  padding: "10px 14px 8px",
                  background: isToday ? "var(--accent-soft)" : "var(--bg-surface)",
                  borderRadius: "10px 10px 0 0",
                  border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                  borderBottom: "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isToday ? "var(--accent)" : "transparent",
                      color: isToday ? "#fff" : "var(--text-secondary)",
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {d.getDate()}
                    </div>
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: isToday ? "var(--accent)" : "var(--text-primary)", margin: 0 }}>
                        {WEEKDAYS_SHORT[d.getDay()]}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>
                        {total} item{total !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Items row */}
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${chunk.length}, 1fr)`, gap: 8 }}>
            {chunk.map(day => {
              const { mvs, tasks } = byDay[day];
              const d = new Date(day + "T12:00:00");
              const isToday = isSameDay(d, now);
              return (
                <div key={day} style={{
                  minHeight: 100,
                  background: "var(--bg-base)",
                  border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "0 0 10px 10px",
                  borderTop: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`,
                  padding: "8px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}>
                  {mvs.map(mv => (
                    <AgendaColumnCard key={mv.id} mv={mv} onEdit={onEdit} onStatusChange={onStatusChange} />
                  ))}
                  {tasks.map(t => (
                    <AgendaColumnTask key={t.id} task={t} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function AgendaColumnCard({
  mv, onEdit, onStatusChange,
}: {
  mv: Movement;
  onEdit: (m: Movement) => void;
  onStatusChange: (id: string, s: Movement["status"]) => void;
}) {
  const cc = clientColor(mv.clientId);
  const isDone = mv.status === "DONE";
  return (
    <div
      onClick={() => onEdit(mv)}
      style={{
        padding: "7px 9px", borderRadius: 8, cursor: "pointer",
        background: isDone ? "var(--bg-surface)" : cc.bg,
        border: `1px solid ${cc.border}30`,
        opacity: isDone ? 0.55 : 1,
        transition: "box-shadow 120ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: cc.border, flexShrink: 0, marginTop: 4 }} />
        <span style={{
          fontSize: 11.5, fontWeight: 600, color: cc.text, flex: 1, lineHeight: "16px",
          textDecoration: isDone ? "line-through" : "none",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {mv.title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 12 }}>
        <span style={{ fontSize: 10, color: cc.text, opacity: 0.7 }}>{mv.category}</span>
        <StatusPill status={mv.status} onChange={s => onStatusChange(mv.id, s)} />
      </div>
    </div>
  );
}

function AgendaColumnTask({ task }: { task: CalTask }) {
  const color = TASK_STATUS_COLOR[task.status] ?? "#64748B";
  const statusLabel: Record<string, string> = {
    TODO: "A fazer", IN_PROGRESS: "Em execução", REVIEW: "Revisão", DONE: "Concluído",
  };
  return (
    <div style={{
      padding: "6px 8px", borderRadius: 7,
      background: color + "0c", border: `1px solid ${color}28`,
      borderLeft: `3px solid ${color}`,
      opacity: task.status === "DONE" ? 0.55 : 1,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
        <CheckSquare size={9} style={{ color, flexShrink: 0, marginTop: 3 }} />
        <span style={{
          fontSize: 11, fontWeight: 500, color: "var(--text-primary)", flex: 1, lineHeight: "15px",
          textDecoration: task.status === "DONE" ? "line-through" : "none",
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        }}>
          {task.title}
        </span>
      </div>
      {task.client && (
        <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "3px 0 0 14px" }}>
          {task.client.brand || task.client.name}
        </p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function GlobalCalendar() {
  const now   = new Date();
  const [month,     setMonth]     = useState(now.getMonth() + 1);
  const [year,      setYear]      = useState(now.getFullYear());
  const [view,      setView]      = useState<"month" | "agenda">("month");
  const [movements, setMovements] = useState<Movement[]>([]);
  const [calTasks,  setCalTasks]  = useState<CalTask[]>([]);
  const [clients,   setClients]   = useState<Client[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState<{ date?: Date; movement?: Movement } | null>(null);
  const [meetingModal, setMeetingModal] = useState<{ date?: Date } | null>(null);
  const [filterClient, setFilterClient] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showTasks, setShowTasks] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ month: String(month), year: String(year) });
    if (filterClient !== "all") params.set("clientId", filterClient);
    if (filterStatus !== "all") params.set("status", filterStatus);
    const [mvRes, taskRes] = await Promise.all([
      fetch(`/api/movements?${params}`),
      fetch(`/api/calendar/tasks?month=${month}&year=${year}${filterClient !== "all" ? `&clientId=${filterClient}` : ""}`),
    ]);
    if (mvRes.ok)   setMovements(await mvRes.json());
    if (taskRes.ok) setCalTasks(await taskRes.json());
    setLoading(false);
  }, [month, year, filterClient, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/clients").then(r => r.ok ? r.json() : []).then((d: { clients?: Client[] } | Client[]) => {
      setClients(Array.isArray(d) ? d : (d.clients ?? []));
    });
  }, []);

  function prevMonth() { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); }
  function goToday()   { setMonth(now.getMonth() + 1); setYear(now.getFullYear()); }

  async function handleStatusChange(id: string, status: Movement["status"]) {
    setMovements(prev => prev.map(m => m.id === id ? { ...m, status } : m));
    await fetch(`/api/movements/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  function handleSaved(saved: Movement) {
    setMovements(prev => {
      const existing = prev.findIndex(m => m.id === saved.id);
      if (existing >= 0) { const next = [...prev]; next[existing] = saved; return next; }
      return [...prev, saved].sort((a, b) => a.date.localeCompare(b.date));
    });
    setModal(null);
  }

  // Build calendar grid
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month - 1, d));
  while (cells.length % 7 !== 0) cells.push(null);

  function movementsForDay(day: Date) {
    return movements.filter(m => isSameDay(localDate(m.date), day));
  }

  function tasksForDay(day: Date) {
    return calTasks.filter(t => isSameDay(localDate(t.dueDate), day));
  }

  const isCurrentMonth = month === now.getMonth() + 1 && year === now.getFullYear();

  const btnStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    padding: "6px 12px", borderRadius: 8, border: "1px solid",
    borderColor: active ? "var(--accent)" : "var(--border)",
    background: active ? "var(--accent-soft)" : "var(--bg-surface)",
    color: active ? "var(--accent)" : "var(--text-secondary)",
    cursor: "pointer", fontSize: 12, fontWeight: active ? 600 : 400,
    transition: "all 150ms",
  });

  const selStyle: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)",
    background: "var(--bg-surface)", color: "var(--text-secondary)",
    fontSize: 12, outline: "none", cursor: "pointer",
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        padding: "14px 24px", background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)", flexShrink: 0,
      }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={prevMonth} style={{ ...btnStyle(false), padding: "6px 8px" }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", minWidth: 170, textAlign: "center" }}>
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={nextMonth} style={{ ...btnStyle(false), padding: "6px 8px" }}><ChevronRight size={14} /></button>
        </div>

        {!isCurrentMonth && (
          <button onClick={goToday} style={{ ...btnStyle(false), fontSize: 11 }}>
            <Clock size={11} /> Hoje
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Filters */}
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={selStyle}>
          <option value="all">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.brand || c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="all">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>

        {/* Tasks toggle */}
        <button onClick={() => setShowTasks(v => !v)} style={btnStyle(showTasks)}>
          <CheckSquare size={13} /> Tarefas
        </button>

        {/* View toggle */}
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setView("month")}  style={btnStyle(view === "month")}><LayoutGrid size={13} /> Mês</button>
          <button onClick={() => setView("agenda")} style={btnStyle(view === "agenda")}><List size={13} /> Agenda</button>
        </div>

        {/* Schedule meeting — primary CTA */}
        <button
          onClick={() => setMeetingModal({})}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "7px 16px", borderRadius: 9, border: "none",
            background: "#7C3AED", color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Mic size={14} /> Agendar reunião
        </button>
      </div>

      {/* ── Calendar body ── */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--text-muted)" }}>
            <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          </div>
        ) : view === "month" ? (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            {/* Weekday headers */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              {WEEKDAYS_SHORT.map(d => (
                <div key={d} style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center" }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flex: 1, gridAutoRows: "1fr" }}>
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-surface)", opacity: 0.4 }} />;
                const dayMvs   = movementsForDay(day);
                const dayTasks = showTasks ? tasksForDay(day) : [];
                const totalItems = dayMvs.length + dayTasks.length;
                const isToday = isSameDay(day, now);
                return (
                  <div
                    key={day.toISOString()}
                    style={{
                      borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                      padding: "8px 8px 6px",
                      background: isToday ? "var(--accent-soft)" : "var(--bg-base)",
                      minHeight: 100, display: "flex", flexDirection: "column",
                      cursor: "pointer",
                    }}
                    onClick={() => setMeetingModal({ date: day })}
                  >
                    {/* Day number */}
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", marginBottom: 4,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: isToday ? "var(--accent)" : "transparent",
                      color: isToday ? "#fff" : "var(--text-muted)",
                      fontSize: 12, fontWeight: isToday ? 700 : 500, flexShrink: 0, alignSelf: "flex-start",
                    }}>
                      {day.getDate()}
                    </div>

                    {/* Movements + tasks */}
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      {dayMvs.slice(0, 3).map(mv => (
                        <MovCard key={mv.id} mv={mv} onEdit={m => { setModal({ movement: m }); }} onStatusChange={handleStatusChange} />
                      ))}
                      {dayTasks.slice(0, 3).map(t => (
                        <TaskChip key={t.id} task={t} />
                      ))}
                      {totalItems > 6 && (
                        <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
                          +{totalItems - 6} mais
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Agenda view — side-by-side day columns */
          <AgendaView
            movements={movements}
            calTasks={calTasks}
            showTasks={showTasks}
            month={month}
            year={year}
            now={now}
            onEdit={m => setModal({ movement: m })}
            onStatusChange={handleStatusChange}
            onNewMovement={() => setModal({})}
            onNewMeeting={() => setMeetingModal({})}
          />
        )}
      </div>

      {/* ── Legend ── */}
      {clients.length > 0 && view === "month" && (
        <div style={{
          display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
          padding: "8px 24px", borderTop: "1px solid var(--border)",
          background: "var(--bg-surface)", flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)" }}>Clientes:</span>
          {clients.filter(c => filterClient === "all" || c.id === filterClient).slice(0, 10).map(c => {
            const cc = clientColor(c.id);
            return (
              <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cc.border }} />
                {c.brand || c.name}
              </span>
            );
          })}
        </div>
      )}

      {/* ── Movement modal ── */}
      {modal !== null && (
        <MovementModal
          clients={clients}
          initial={modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Meeting schedule modal ── */}
      {meetingModal !== null && (
        <MeetingScheduleModal
          clients={clients}
          initialDate={meetingModal.date}
          onClose={() => setMeetingModal(null)}
        />
      )}
    </div>
  );
}

// ── Task Chip (month grid) ─────────────────────────────────────────────────────

const TASK_STATUS_COLOR: Record<string, string> = {
  TODO:        "#64748B",
  IN_PROGRESS: "#2563EB",
  REVIEW:      "#D97706",
  DONE:        "#16A34A",
};

function TaskChip({ task }: { task: CalTask }) {
  const color = TASK_STATUS_COLOR[task.status] ?? "#64748B";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      padding: "2px 5px", borderRadius: 4, marginBottom: 2,
      background: color + "18", border: `1px solid ${color}30`,
    }}>
      <CheckSquare size={8} style={{ color, flexShrink: 0 }} />
      <span style={{
        fontSize: 10, fontWeight: 500, color: "var(--text-secondary)",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {task.title}
      </span>
    </div>
  );
}

// ── Agenda Task Item ───────────────────────────────────────────────────────────

function AgendaTaskItem({ task }: { task: CalTask }) {
  const color = TASK_STATUS_COLOR[task.status] ?? "#64748B";
  const statusLabel: Record<string, string> = {
    TODO: "A fazer", IN_PROGRESS: "Em execução", REVIEW: "Revisão", DONE: "Concluído",
  };
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 14px", borderRadius: 10,
      background: "var(--bg-surface)", border: "1px solid var(--border)",
      borderLeft: `3px solid ${color}`,
    }}>
      <CheckSquare size={14} style={{ color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </p>
        {(task.type || task.client) && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {task.client?.brand || task.client?.name}{task.type ? ` · ${task.type}` : ""}
          </p>
        )}
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, color, background: color + "18", padding: "2px 8px", borderRadius: 20, whiteSpace: "nowrap" }}>
        {statusLabel[task.status] ?? task.status}
      </span>
    </div>
  );
}
