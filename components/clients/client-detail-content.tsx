"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Edit2, Activity, MessageSquarePlus,
  CalendarDays, Columns3, User, Mic, Upload, Trash2, Loader2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, ClientStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { KanbanBoard } from "@/components/clients/kanban-board";
import { MeetingsTab } from "@/components/clients/meetings-tab";
import { formatDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientDetail {
  id: string;
  name: string;
  brand?: string;
  logoUrl?: string | null;
  email?: string;
  phone?: string;
  primaryContact?: string;
  website?: string;
  instagram?: string;
  city?: string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED";
  activePlanId?: string;
  operationType?: string;
  operationalScope?: unknown;
  reviewDay?: string;
  expectedSla?: string;
  meetingFrequency?: string;
  approvalRoutine?: string;
  operationalUrgency?: string;
  importantLinks?: string;
  niche?: string;
  mainGoal?: string;
  contractStart?: string | null;
  operationalFrequency?: string;
  strategicNotes?: string;
  communicationTone?: string;
  restrictions?: string;
  preferences?: string;
  clientBehavior?: string;
  stats: {
    monthTasks: number;
    doneTasks: number;
    overdueTasks: number;
    openTasks: number;
    daysSinceActivity: number;
    health: "HEALTHY" | "ATTENTION" | "CRITICAL";
    completionRate: number;
  };
  progressByType?: Record<string, { planned: number; done: number; pct: number }>;
  // Plano/entregáveis removidos — mantido opcional só para compatibilidade de tipo.
  clientPlans?: Array<{
    id: string;
    month: number;
    year: number;
    active: boolean;
    autoRenew: boolean;
    plan: {
      id: string;
      name: string;
      items: Array<{ id: string; type: string; quantity: number; deadlineDayOfMonth?: number | null }>;
    };
  }>;
  operationalContext: {
    lastActivityAt: string | null;
    nextTask: { id: string; title: string; dueDate: string } | null;
    currentBlocker: { id: string; title: string; blocker: string | null } | null;
  };
  recentLogs: Array<{
    id: string;
    action: string;
    createdAt: string;
    user: { name: string };
    details?: Record<string, unknown>;
  }>;
  notes: Array<{
    id: string;
    action: string;
    createdAt: string;
    user: { name: string };
    details?: Record<string, unknown>;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  CREATE_TASK:   "criou uma entrega",
  UPDATE_STATUS: "atualizou uma entrega",
  DELETE_TASK:   "removeu uma entrega",
  APPLY_PLAN:    "aplicou um plano",
  UPDATE_CLIENT: "atualizou o cliente",
  CREATE_CLIENT: "criou o cliente",
  ADD_NOTE:      "adicionou uma observação",
  CREATE_PLAN:   "criou um plano",
};

const ACTION_COLORS: Record<string, string> = {
  CREATE_TASK:   "var(--blue)",
  UPDATE_STATUS: "var(--accent)",
  DELETE_TASK:   "var(--red)",
  APPLY_PLAN:    "var(--green)",
  UPDATE_CLIENT: "var(--amber)",
  CREATE_CLIENT: "var(--green)",
  ADD_NOTE:      "var(--text-secondary)",
  CREATE_PLAN:   "var(--accent)",
};

function timeAgo(date: string) {
  const diff    = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `há ${days}d`;
}

// ── Tab type ──────────────────────────────────────────────────────────────────

type Tab = "operacao" | "perfil" | "reunioes";

// ── Root component ────────────────────────────────────────────────────────────

export function ClientDetailContent({ clientId }: { clientId: string }) {
  const { data: session } = useSession();
  const [client,     setClient]     = useState<ClientDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>("operacao");
  const [editOpen,   setEditOpen]   = useState(false);
  const [note,       setNote]       = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) setClient(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  const isAdmin    = session?.user.role === "ADMIN";

  if (loading) return (
    <div style={{ flex: 1, padding: 32 }}>
      <div style={{ height: 88, borderRadius: 12, background: "var(--bg-surface)", marginBottom: 16, animation: "pulse 1.5s infinite" }} />
    </div>
  );

  if (!client) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
      Cliente não encontrado
    </div>
  );

  const healthConfig = {
    HEALTHY:   { label: "Saudável",   color: "var(--green)", bg: "var(--green-soft)" },
    ATTENTION: { label: "Atenção",    color: "var(--amber)", bg: "var(--amber-soft)" },
    CRITICAL:  { label: "Crítico",    color: "var(--red)",   bg: "var(--red-soft)"   },
  }[client.stats.health];

  async function saveNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    const res = await fetch(`/api/clients/${clientId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: note.trim() }),
    });
    setSavingNote(false);
    if (res.ok) { setNote(""); load(); }
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "operacao",  label: "Operação",  icon: <Columns3 size={13} /> },
    { key: "reunioes",  label: "Reuniões",  icon: <Mic size={13} /> },
    { key: "perfil",    label: "Perfil",    icon: <User size={13} /> },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border)",
        padding: "18px 28px 0",
        flexShrink: 0,
      }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Avatar name={client.name} src={client.logoUrl} size="md" />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <h1 style={{
                  fontSize: 17, fontWeight: 700,
                  color: "var(--text-primary)", lineHeight: "24px",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {client.name}
                </h1>
                <ClientStatusBadge status={client.status} />
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  padding: "2px 8px", borderRadius: 20,
                  background: healthConfig.bg, color: healthConfig.color,
                  fontSize: 10, fontWeight: 700,
                }}>
                  {healthConfig.label}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3, flexWrap: "wrap" }}>
                {client.niche && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{client.niche}</span>
                )}
                {client.email && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{client.email}</span>
                )}
                {client.primaryContact && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    Resp. {client.primaryContact}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Edit2 size={12} /> Editar
              </Button>
            )}
            <Link href={`/clients/${clientId}/calendar`} style={{ textDecoration: "none" }}>
              <Button variant="ghost" size="sm">
                <CalendarDays size={12} /> Calendário
              </Button>
            </Link>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2 }}>
          {tabs.map(({ key, label, icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 16px", border: "none", background: "none",
                  cursor: "pointer", fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                  marginBottom: -1,
                  transition: "color 120ms, border-color 120ms",
                }}
              >
                {icon} {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────── */}
      {tab === "operacao" && (
        <KanbanBoard clientId={clientId} clientName={client.name} />
      )}

      {tab === "reunioes" && (
        <MeetingsTab clientId={clientId} />
      )}

      {tab === "perfil" && (
        <PerfilTab
          client={client}
          clientId={clientId}
          isAdmin={isAdmin}
          note={note}
          setNote={setNote}
          savingNote={savingNote}
          saveNote={saveNote}
          onEditOpen={() => setEditOpen(true)}
          onSaved={load}
        />
      )}

      {/* ── Modal edição ─────────────────────────────────── */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar perfil operacional"
        size="2xl"
        variant="drawer"
      >
        <ClientForm
          clientId={clientId}
          initial={{
            name:                client.name,
            brand:               client.brand,
            email:               client.email,
            phone:               client.phone,
            primaryContact:      client.primaryContact,
            website:             client.website,
            instagram:           client.instagram,
            city:                client.city,
            operationType:       client.operationType,
            operationalScope:    client.operationalScope,
            reviewDay:           client.reviewDay,
            expectedSla:         client.expectedSla,
            meetingFrequency:    client.meetingFrequency,
            approvalRoutine:     client.approvalRoutine,
            operationalUrgency:  client.operationalUrgency,
            importantLinks:      client.importantLinks,
            niche:               client.niche,
            mainGoal:            client.mainGoal,
            contractStart:       client.contractStart,
            operationalFrequency: client.operationalFrequency,
            strategicNotes:      client.strategicNotes,
            communicationTone:   client.communicationTone,
            restrictions:        client.restrictions,
            preferences:         client.preferences,
            clientBehavior:      client.clientBehavior,
          }}
          onSuccess={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>
    </div>
  );
}

// ── Perfil Tab ────────────────────────────────────────────────────────────────

function PerfilTab({
  client,
  clientId,
  isAdmin,
  note,
  setNote,
  savingNote,
  saveNote,
  onEditOpen,
  onSaved,
}: {
  client: ClientDetail;
  clientId: string;
  isAdmin: boolean;
  note: string;
  setNote: (v: string) => void;
  savingNote: boolean;
  saveNote: () => void;
  onEditOpen: () => void;
  onSaved: () => void;
}) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [savingLogo, setSavingLogo] = useState(false);

  async function saveLogo(logoUrl: string | null) {
    setSavingLogo(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logoUrl: logoUrl ?? "" }),
    });
    setSavingLogo(false);
    onSaved();
  }

  // Resize/compress raster images in the browser so any upload size works and
  // the stored data stays small. SVGs are kept as-is (already tiny/vector).
  function resizeImage(dataUrl: string, maxDim = 512): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(dataUrl); return; }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png")); // PNG preserves transparency
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  async function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Selecione um arquivo de imagem."); return; }
    if (file.size > 20 * 1024 * 1024) { alert("Arquivo muito grande (máx. 20MB)."); return; }

    const dataUrl = await new Promise<string>((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result as string);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });

    // SVG: keep vector as-is. Raster: downscale to keep the stored size small.
    const finalUrl = file.type === "image/svg+xml" ? dataUrl : await resizeImage(dataUrl);
    await saveLogo(finalUrl);
  }
  const timelineLogs = client.recentLogs
    .filter(l => l.action !== "UPDATE_CLIENT")
    .slice(0, 8);

  const dataRows = [
    { label: "Nicho",             value: client.niche },
    { label: "Objetivo",          value: client.mainGoal },
    { label: "Frequência",        value: client.operationalFrequency },
    { label: "Tom de comunicação",value: client.communicationTone },
    { label: "Restrições",        value: client.restrictions },
    { label: "Preferências",      value: client.preferences },
    { label: "Comportamento",     value: client.clientBehavior },
    { label: "Notas estratégicas",value: client.strategicNotes },
    { label: "Links",             value: client.importantLinks },
    { label: "SLA esperado",      value: client.expectedSla },
    { label: "Reuniões",          value: client.meetingFrequency },
    { label: "Rotina aprovação",  value: client.approvalRoutine },
    { label: "Contato",           value: client.primaryContact },
    { label: "Email",             value: client.email },
    { label: "Telefone",          value: client.phone },
    { label: "Cidade",            value: client.city },
    { label: "Instagram",         value: client.instagram },
    { label: "Website",           value: client.website },
  ].filter(r => r.value);

  return (
    <div style={{
      flex: 1, padding: "24px 28px 48px",
      display: "grid", gridTemplateColumns: "1.6fr 1fr",
      gap: 28, alignItems: "start",
    }}>

      {/* ── Left ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

        {/* Logo do cliente */}
        <section>
          <Label>Logo do cliente</Label>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 14, overflow: "hidden",
              border: "1px solid var(--border)", background: "var(--bg-surface)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              {client.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={client.logoUrl} alt={client.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Avatar name={client.name} size="md" />
              )}
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleLogoFile}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={savingLogo}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 12px", borderRadius: 8,
                    background: "var(--bg-surface)", border: "1px solid var(--border)",
                    color: "var(--text-primary)", fontSize: 12, fontWeight: 600,
                    cursor: savingLogo ? "not-allowed" : "pointer", opacity: savingLogo ? 0.6 : 1,
                  }}
                >
                  {savingLogo ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={12} />}
                  {client.logoUrl ? "Trocar logo" : "Enviar logo"}
                </button>
                {client.logoUrl && !savingLogo && (
                  <button
                    onClick={() => saveLogo(null)}
                    title="Remover logo"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "7px 12px", borderRadius: 8,
                      background: "var(--bg-surface)", border: "1px solid var(--border)",
                      color: "var(--red)", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Trash2 size={12} /> Remover
                  </button>
                )}
              </div>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>PNG, JPG ou SVG — redimensionada automaticamente</span>
            </div>
          </div>
        </section>

        {/* Observações internas */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Label>Observações internas</Label>
            <MessageSquarePlus size={14} style={{ color: "var(--text-muted)" }} />
          </div>
          <div style={{
            background: "var(--bg-surface)", border: "1px solid var(--border)",
            borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Ex: prefere aprovar pelo WhatsApp, evitar domingo..."
                rows={3}
                style={{
                  width: "100%", resize: "none",
                  border: "1px solid var(--border)", borderRadius: 8,
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  padding: 10, fontSize: 13, outline: "none",
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <Button type="button" variant="secondary" size="sm" loading={savingNote} onClick={saveNote}>
                  Salvar
                </Button>
              </div>
            </div>
            {client.notes.length === 0 ? (
              <p style={{ padding: 14, fontSize: 12, color: "var(--text-muted)" }}>
                Nenhuma observação registrada.
              </p>
            ) : (
              client.notes.slice(0, 5).map(log => (
                <div key={log.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: "18px" }}>
                    {typeof log.details?.note === "string" ? log.details.note : "Observação registrada"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                    {log.user.name} · {formatDate(log.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Dados do cliente */}
        {dataRows.length > 0 && (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <Label>Dados do cliente</Label>
              {isAdmin && (
                <button
                  onClick={onEditOpen}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    border: "1px solid var(--border)", background: "transparent",
                    borderRadius: 7, padding: "3px 10px",
                    fontSize: 11, color: "var(--text-muted)", cursor: "pointer",
                  }}
                >
                  <Edit2 size={10} /> Editar
                </button>
              )}
            </div>
            <div style={{
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              borderRadius: 10, padding: "14px 18px",
              display: "flex", flexDirection: "column", gap: 9,
            }}>
              {dataRows.map(row => (
                <div key={row.label} style={{ display: "flex", gap: 10 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
                    minWidth: 140, flexShrink: 0,
                  }}>
                    {row.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: "18px" }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ── Right: Activity timeline ── */}
      <div>
        <Label style={{ marginBottom: 10 }}>Histórico de atividade</Label>
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 10, overflow: "hidden",
        }}>
          {timelineLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <Activity size={20} style={{ color: "var(--text-muted)", opacity: 0.25, margin: "0 auto 8px", display: "block" }} />
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma atividade</p>
            </div>
          ) : (
            timelineLogs.map((log, i) => {
              const dotColor = ACTION_COLORS[log.action] ?? "var(--blue)";
              const label = ACTION_LABELS[log.action] ?? log.action;
              return (
                <div
                  key={log.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 14px",
                    borderBottom: i < timelineLogs.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: dotColor, flexShrink: 0, marginTop: 5,
                    boxShadow: `0 0 0 3px ${dotColor}20`,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", lineHeight: "16px" }}>
                      {log.user.name.split(" ").slice(0,2).map(w=>w[0]).join("").toUpperCase()} {label}
                    </p>
                    <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                      {timeAgo(log.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{
      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
      textTransform: "uppercase", color: "var(--text-muted)",
      ...style,
    }}>
      {children}
    </h2>
  );
}
