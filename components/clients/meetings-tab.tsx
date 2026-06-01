"use client";

import { useEffect, useRef, useState } from "react";
import {
  Mic,
  Plus,
  Upload,
  ChevronDown,
  ChevronUp,
  Trash2,
  CheckSquare,
  ArrowRight,
  Clock,
  Calendar,
  Loader2,
  FileAudio,
  X,
} from "lucide-react";

interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: number | null;
  transcript: string | null;
  summary: string | null;
  decisions: string[];
  nextSteps: string[];
  participants: string[];
  createdAt: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function MeetingsTab({ clientId }: { clientId: string }) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  // new meeting form
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newParticipants, setNewParticipants] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribing, setTranscribing] = useState<string | null>(null); // meeting id being transcribed
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/clients/${clientId}/meetings`)
      .then((r) => r.ok ? r.json() : [])
      .then(setMeetings)
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    const res = await fetch(`/api/clients/${clientId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        date: new Date(newDate).toISOString(),
        participants: newParticipants.split(",").map((p) => p.trim()).filter(Boolean),
      }),
    });
    if (res.ok) {
      const meeting: Meeting = await res.json();
      setMeetings((prev) => [meeting, ...prev]);

      if (audioFile) {
        await handleTranscribe(meeting.id, audioFile);
      }

      setNewTitle("");
      setNewDate(new Date().toISOString().slice(0, 10));
      setNewParticipants("");
      setAudioFile(null);
      setShowNew(false);
      setExpanded(meeting.id);
    }
    setCreating(false);
  }

  async function handleTranscribe(meetingId: string, file: File) {
    setTranscribing(meetingId);
    const form = new FormData();
    form.append("audio", file);
    const res = await fetch(`/api/meetings/${meetingId}/transcribe`, {
      method: "POST",
      body: form,
    });
    if (res.ok) {
      const updated: Meeting = await res.json();
      setMeetings((prev) => prev.map((m) => (m.id === meetingId ? updated : m)));
    }
    setTranscribing(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    if (expanded === id) setExpanded(null);
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 64 }}>
        <Loader2 size={20} style={{ color: "var(--text-muted)", animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ padding: "28px 40px", maxWidth: 860 }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Reuniões</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 0" }}>
            {meetings.length} reunião{meetings.length !== 1 ? "s" : ""} registrada{meetings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowNew((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(124,58,237,0.25)",
          }}
        >
          <Plus size={14} />
          Nova reunião
        </button>
      </div>

      {/* New meeting form */}
      {showNew && (
        <div
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 20,
            marginBottom: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Nova reunião</p>
            <button
              onClick={() => setShowNew(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Título *
              </label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="ex: Revisão mensal de campanhas"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
                Data *
              </label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
              Participantes (separados por vírgula)
            </label>
            <input
              value={newParticipants}
              onChange={(e) => setNewParticipants(e.target.value)}
              placeholder="ex: João Silva, Maria Souza"
              style={inputStyle}
            />
          </div>

          {/* Audio upload */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>
              Áudio para transcrição (opcional)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="audio/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
              style={{ display: "none" }}
              onChange={(e) => setAudioFile(e.target.files?.[0] ?? null)}
            />
            {audioFile ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  background: "var(--accent-soft)",
                  borderRadius: 8,
                  border: "1px solid var(--accent)",
                }}
              >
                <FileAudio size={14} style={{ color: "var(--accent)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {audioFile.name}
                </span>
                <button
                  onClick={() => { setAudioFile(null); if (fileRef.current) fileRef.current.value = ""; }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 14px",
                  background: "var(--bg-base)",
                  border: "1px dashed var(--border)",
                  borderRadius: 8,
                  color: "var(--text-muted)",
                  fontSize: 13,
                  cursor: "pointer",
                  width: "100%",
                  justifyContent: "center",
                }}
              >
                <Upload size={13} />
                Selecionar arquivo de áudio
              </button>
            )}
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              Suporta MP3, M4A, WAV, WebM — máx. 25MB. A transcrição acontece ao salvar.
            </p>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => setShowNew(false)} style={cancelBtnStyle}>Cancelar</button>
            <button
              onClick={handleCreate}
              disabled={creating || !newTitle.trim()}
              style={{
                ...saveBtnStyle,
                opacity: creating || !newTitle.trim() ? 0.6 : 1,
                cursor: creating || !newTitle.trim() ? "not-allowed" : "pointer",
              }}
            >
              {creating ? (
                <><Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> {audioFile ? "Salvando e transcrevendo..." : "Salvando..."}</>
              ) : (
                "Salvar reunião"
              )}
            </button>
          </div>
        </div>
      )}

      {/* Meetings list */}
      {meetings.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "60px 20px",
            background: "var(--bg-surface)",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}
        >
          <Mic size={32} style={{ color: "var(--text-muted)", opacity: 0.4, marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0 }}>Nenhuma reunião registrada</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4, opacity: 0.7 }}>
            Adicione uma reunião para começar a registrar transcrições
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {meetings.map((meeting) => (
            <MeetingCard
              key={meeting.id}
              meeting={meeting}
              expanded={expanded === meeting.id}
              transcribing={transcribing === meeting.id}
              onToggle={() => setExpanded((v) => (v === meeting.id ? null : meeting.id))}
              onDelete={() => handleDelete(meeting.id)}
              onTranscribe={(file) => handleTranscribe(meeting.id, file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingCard({
  meeting,
  expanded,
  transcribing,
  onToggle,
  onDelete,
  onTranscribe,
}: {
  meeting: Meeting;
  expanded: boolean;
  transcribing: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onTranscribe: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const hasTranscript = !!meeting.transcript;

  return (
    <div
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
        transition: "box-shadow 150ms ease",
      }}
    >
      {/* Card header */}
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: hasTranscript ? "var(--accent-soft)" : "var(--bg-elevated)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Mic size={15} style={{ color: hasTranscript ? "var(--accent)" : "var(--text-muted)" }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "var(--text-primary)",
              margin: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {meeting.title}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 2 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-muted)" }}>
              <Calendar size={10} />
              {fmtDate(meeting.date)}
            </span>
            {meeting.duration && (
              <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--text-muted)" }}>
                <Clock size={10} />
                {fmtDuration(meeting.duration)}
              </span>
            )}
            {meeting.participants.length > 0 && (
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {meeting.participants.slice(0, 2).join(", ")}
                {meeting.participants.length > 2 && ` +${meeting.participants.length - 2}`}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!hasTranscript && !transcribing && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,.mp3,.mp4,.m4a,.wav,.webm,.ogg,.flac"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onTranscribe(f);
                }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                title="Transcrever áudio"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "5px 10px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <Upload size={11} />
                Transcrever
              </button>
            </>
          )}
          {transcribing && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--accent)" }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              Transcrevendo...
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Excluir"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 6 }}
          >
            <Trash2 size={13} />
          </button>
          {expanded ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />}
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "16px 16px 20px" }}>
          {meeting.summary && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
                Resumo
              </p>
              <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6, margin: 0 }}>
                {meeting.summary}
              </p>
            </div>
          )}

          {meeting.decisions.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
                Decisões
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {meeting.decisions.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <CheckSquare size={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, lineHeight: 1.5 }}>{d}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meeting.nextSteps.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
                Próximos passos
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {meeting.nextSteps.map((s, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                    <ArrowRight size={13} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 13, color: "var(--text-primary)", margin: 0, lineHeight: 1.5 }}>{s}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {meeting.transcript && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 6 }}>
                Transcrição completa
              </p>
              <div
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 14px",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                  lineHeight: 1.7,
                  maxHeight: 240,
                  overflowY: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {meeting.transcript}
              </div>
            </div>
          )}

          {!meeting.transcript && !transcribing && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              Nenhuma transcrição disponível. Use o botão "Transcrever" para enviar um áudio.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: 7,
  fontSize: 13,
  color: "var(--text-primary)",
  outline: "none",
  boxSizing: "border-box",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "var(--bg-base)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--text-muted)",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 16px",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};
