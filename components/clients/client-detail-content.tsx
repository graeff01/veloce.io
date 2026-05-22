"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Edit2, Activity, AlertTriangle, CheckCircle2, Clock,
  RefreshCw, Zap, MessageSquarePlus, HeartPulse,
  CalendarDays, Brain, BarChart3,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, ClientStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { ApplyPlanWizard } from "@/components/plans/apply-plan-wizard";
import { OperacaoTab } from "@/components/clients/operacao-tab";
import { formatDate } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientDetail {
  id: string;
  name: string;
  brand?: string;
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
  progressByType: Record<string, { planned: number; done: number; pct: number }>;
  clientPlans: Array<{
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

const actionLabels: Record<string, string> = {
  CREATE_TASK: "criou uma tarefa",
  UPDATE_STATUS: "moveu uma tarefa",
  DELETE_TASK: "removeu uma tarefa",
  APPLY_PLAN: "aplicou um plano",
  UPDATE_CLIENT: "atualizou o cliente",
  CREATE_CLIENT: "criou o cliente",
  ADD_NOTE: "adicionou uma observacao",
  CREATE_PLAN: "criou um plano",
};

const actionColors: Record<string, string> = {
  CREATE_TASK: "var(--blue)",
  UPDATE_STATUS: "var(--accent)",
  DELETE_TASK: "var(--red)",
  APPLY_PLAN: "var(--green)",
  UPDATE_CLIENT: "var(--amber)",
  CREATE_CLIENT: "var(--green)",
  ADD_NOTE: "var(--text-secondary)",
  CREATE_PLAN: "var(--accent)",
};

const typeColors: Record<string, { bg: string; color: string }> = {
  "Post Feed": { bg: "var(--blue-soft)",   color: "var(--blue)" },
  "Story":     { bg: "var(--accent-soft)", color: "var(--accent)" },
  "Campanha":  { bg: "var(--amber-soft)",  color: "var(--amber)" },
  "Criativo":  { bg: "var(--green-soft)",  color: "var(--green)" },
  "Reels":     { bg: "#FFF3E0",            color: "#F97316" },
  "Copy":      { bg: "var(--blue-soft)",   color: "var(--blue)" },
  "Relatório": { bg: "var(--bg-elevated)", color: "var(--text-secondary)" },
};

function getTypeStyle(type: string) {
  return typeColors[type] ?? { bg: "var(--bg-elevated)", color: "var(--text-secondary)" };
}

function getLogTitle(log: ClientDetail["recentLogs"][0]) {
  const details = log.details ?? {};
  const title = typeof details.title === "string" ? details.title : undefined;
  const note = typeof details.note === "string" ? details.note : undefined;
  const planName = typeof details.planName === "string" ? details.planName : undefined;
  const to = typeof details.to === "string" ? details.to : undefined;

  if (log.action === "CREATE_TASK" && title) return `${title} entrou na operacao.`;
  if (log.action === "ADD_NOTE" && note) return "Nova decisao registrada.";
  if (log.action === "UPDATE_STATUS" && title && to) return `${title} avancou para ${formatStatus(to)}.`;
  if (log.action === "UPDATE_STATUS" && to) return `Entrega avancou para ${formatStatus(to)}.`;
  if (log.action === "APPLY_PLAN") return planName ? `${planName} virou o ritmo ativo.` : "Plano operacional aplicado.";
  if (log.action === "DELETE_TASK") return title ? `${title} saiu da operacao.` : "Entrega removida da operacao.";
  return actionLabels[log.action] ?? "Atividade registrada";
}

function getLogMeta(log: ClientDetail["recentLogs"][0]) {
  const details = log.details ?? {};
  const note = typeof details.note === "string" ? details.note : undefined;
  const to = typeof details.to === "string" ? details.to : undefined;
  const dueDate = typeof details.dueDate === "string" ? details.dueDate : undefined;

  if (note) return note;
  if (to) return `Movimento registrado por ${log.user.name}.`;
  if (dueDate) return `Prazo ${formatDate(dueDate)}`;
  return actionLabels[log.action] ?? log.action;
}

function formatStatus(status: string) {
  const labels: Record<string, string> = {
    TODO: "fila", IN_PROGRESS: "execucao", REVIEW: "revisao", DONE: "concluido",
  };
  return labels[status] ?? status.toLowerCase();
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `ha ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ha ${hours}h`;
  const days = Math.floor(hours / 24);
  return `ha ${days}d`;
}

// ── Tab type ──────────────────────────────────────────────────────────────────

type Tab = "overview" | "operacao" | "inteligencia";

// ── Root component ────────────────────────────────────────────────────────────

export function ClientDetailContent({ clientId }: { clientId: string }) {
  const { data: session } = useSession();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("operacao");
  const [editOpen, setEditOpen] = useState(false);
  const [planWizardOpen, setPlanWizardOpen] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [operacaoKey, setOperacaoKey] = useState(0);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) setClient(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [clientId]);

  const isAdmin = session?.user.role === "ADMIN";
  const currentPlan = client?.clientPlans?.[0];

  if (loading) return (
    <div style={{ flex: 1, padding: 32 }}>
      <div style={{ height: 88, borderRadius: 12, background: "var(--bg-surface)", marginBottom: 16, animation: "pulse 1.5s infinite" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ height: 80, borderRadius: 10, background: "var(--bg-surface)", animation: "pulse 1.5s infinite" }} />
        ))}
      </div>
    </div>
  );

  if (!client) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
      Cliente não encontrado
    </div>
  );

  const healthConfig = {
    HEALTHY: { label: "Operacao saudavel", color: "var(--green)", bg: "var(--green-soft)" },
    ATTENTION: { label: "Atencao", color: "var(--amber)", bg: "var(--amber-soft)" },
    CRITICAL: { label: "Critico", color: "var(--red)", bg: "var(--red-soft)" },
  }[client.stats.health];

  const nextAction = client.operationalContext.currentBlocker?.blocker
    ? `Destravar ${client.operationalContext.currentBlocker.blocker}`
    : client.operationalContext.nextTask?.title ?? "Planejar proxima entrega";
  const lastActivity = client.operationalContext.lastActivityAt ? timeAgo(client.operationalContext.lastActivityAt) : "sem registro";
  const currentPending = client.operationalContext.currentBlocker?.title
    ?? (client.stats.overdueTasks > 0 ? `${client.stats.overdueTasks} entrega${client.stats.overdueTasks === 1 ? "" : "s"} em atraso` : "sem pendencia critica");

  async function handleRenewNow() {
    setRenewing(true);
    const res = await fetch(`/api/clients/${clientId}/renew-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setRenewing(false);
    if (res.ok) load();
    else {
      const d = await res.json();
      if (d.error) alert(d.error);
    }
  }

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

  const timelineLogs = client.recentLogs
    .filter((log) => log.action !== "UPDATE_CLIENT")
    .slice(0, 5);

  const rhythm =
    client.stats.overdueTasks > 0 ? "Operacao atrasada"
    : client.stats.openTasks === 0 ? "Operacao tranquila"
    : client.stats.doneTasks > 0 ? "Ritmo saudavel"
    : "Ritmo em formacao";

  const rhythmTone =
    client.stats.overdueTasks > 0 ? "var(--red)"
    : client.stats.openTasks === 0 ? "var(--green)"
    : client.stats.doneTasks > 0 ? "var(--green)"
    : "var(--amber)";

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "overview",     label: "Overview",      icon: <BarChart3 size={13} /> },
    { key: "operacao",     label: "Operação",       icon: <CheckCircle2 size={13} /> },
    { key: "inteligencia", label: "Inteligência",   icon: <Brain size={13} /> },
  ];

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)", display: "flex", flexDirection: "column" }}>

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)", padding: "18px 28px 0", flexShrink: 0 }}>
        {/* Top row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <Avatar name={client.name} size="md" />
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", lineHeight: "24px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {client.name}
                </h1>
                <ClientStatusBadge status={client.status} />
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "2px 8px", borderRadius: 7,
                  background: healthConfig.bg, color: healthConfig.color,
                  fontSize: 11, fontWeight: 650,
                }}>
                  <HeartPulse size={11} /> {healthConfig.label}
                </span>
                {currentPlan && <Badge variant="purple">{currentPlan.plan.name}</Badge>}
                {currentPlan?.autoRenew && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 8px", borderRadius: 20,
                    background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.3)",
                    fontSize: 10, fontWeight: 600, color: "var(--green)",
                  }}>
                    <RefreshCw size={9} /> Auto-renovação
                  </span>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3 }}>
                {client.email && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{client.email}</span>}
                {client.phone && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{client.phone}</span>}
                {client.primaryContact && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Resp. {client.primaryContact}</span>}
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

        {/* Summary strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "1.3fr 0.75fr 1fr 0.8fr",
          gap: 18, paddingBottom: 14, borderBottom: "1px solid var(--border)",
        }}>
          <SummaryLine label="Proxima acao" value={nextAction} tone={client.operationalContext.currentBlocker ? "var(--amber)" : "var(--accent)"} primary />
          <SummaryLine label="Ultima atividade" value={lastActivity} tone={client.stats.daysSinceActivity >= 4 ? "var(--amber)" : "var(--green)"} />
          <SummaryLine label="Pendencia" value={currentPending} tone={client.operationalContext.currentBlocker || client.stats.overdueTasks > 0 ? "var(--red)" : "var(--green)"} />
          <SummaryLine label="Plano" value={currentPlan?.plan.name ?? "sem plano ativo"} tone="var(--blue)" />
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, paddingTop: 2 }}>
          {tabs.map(({ key, label, icon }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", border: "none", background: "none",
                  cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 500,
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

      {/* ── Tab content ─────────────────────────────────── */}
      {tab === "operacao" && (
        <OperacaoTab key={operacaoKey} clientId={clientId} clientName={client.name} />
      )}

      {tab === "overview" && (
        <OverviewTab
          client={client}
          currentPlan={currentPlan}
          rhythm={rhythm}
          rhythmTone={rhythmTone}
          timelineLogs={timelineLogs}
          note={note}
          setNote={setNote}
          savingNote={savingNote}
          saveNote={saveNote}
          renewing={renewing}
          handleRenewNow={handleRenewNow}
          setPlanWizardOpen={setPlanWizardOpen}
        />
      )}

      {tab === "inteligencia" && (
        <InteligenciaTab clientId={clientId} clientName={client.name} niche={client.niche} />
      )}

      {/* ── Modals ──────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Editar perfil operacional" size="2xl" variant="drawer">
        <ClientForm
          clientId={clientId}
          initial={{
            name: client.name,
            brand: client.brand,
            email: client.email,
            phone: client.phone,
            primaryContact: client.primaryContact,
            website: client.website,
            instagram: client.instagram,
            city: client.city,
            operationType: client.operationType,
            operationalScope: client.operationalScope,
            reviewDay: client.reviewDay,
            expectedSla: client.expectedSla,
            meetingFrequency: client.meetingFrequency,
            approvalRoutine: client.approvalRoutine,
            operationalUrgency: client.operationalUrgency,
            importantLinks: client.importantLinks,
            niche: client.niche,
            mainGoal: client.mainGoal,
            contractStart: client.contractStart,
            operationalFrequency: client.operationalFrequency,
            strategicNotes: client.strategicNotes,
            communicationTone: client.communicationTone,
            restrictions: client.restrictions,
            preferences: client.preferences,
            clientBehavior: client.clientBehavior,
            deliverables: currentPlan?.plan.items.map((item) => ({
              type: item.type,
              quantity: item.quantity,
              deadlineDayOfMonth: item.deadlineDayOfMonth ?? null,
            })) ?? [],
          }}
          onSuccess={() => { setEditOpen(false); load(); setOperacaoKey(k => k + 1); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <ApplyPlanWizard
        open={planWizardOpen}
        onClose={() => setPlanWizardOpen(false)}
        clientId={clientId}
        clientName={client.name}
        onSuccess={() => { setPlanWizardOpen(false); load(); setOperacaoKey(k => k + 1); }}
      />
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({
  client,
  currentPlan,
  rhythm,
  rhythmTone,
  timelineLogs,
  note,
  setNote,
  savingNote,
  saveNote,
  renewing,
  handleRenewNow,
  setPlanWizardOpen,
}: {
  client: ClientDetail;
  currentPlan: ClientDetail["clientPlans"][0] | undefined;
  rhythm: string;
  rhythmTone: string;
  timelineLogs: ClientDetail["recentLogs"];
  note: string;
  setNote: (v: string) => void;
  savingNote: boolean;
  saveNote: () => void;
  renewing: boolean;
  handleRenewNow: () => void;
  setPlanWizardOpen: (v: boolean) => void;
}) {
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

  return (
    <div style={{ flex: 1, padding: "24px 28px", display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>

      {/* LEFT */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Ritmo operacional */}
        {currentPlan ? (
          <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionLabel>Ritmo Operacional</SectionLabel>
              <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", background: "var(--bg-elevated)", padding: "2px 8px", borderRadius: 20 }}>
                {months[currentPlan.month - 1]}/{currentPlan.year}
              </span>
            </div>
            <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, boxShadow: "var(--shadow-card)" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: rhythmTone, lineHeight: "20px" }}>{rhythm}</p>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {client.stats.doneTasks} entregas concluídas / {client.stats.openTasks} em aberto
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRenewNow}
                  disabled={renewing}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    background: "none", border: "1px solid var(--border)",
                    borderRadius: 7, padding: "4px 10px",
                    fontSize: 11, color: "var(--text-muted)",
                    cursor: "pointer", opacity: renewing ? 0.6 : 1,
                  }}
                >
                  <Zap size={11} /> {renewing ? "Gerando..." : "Renovar agora"}
                </button>
              </div>
              {currentPlan.plan.items.map((item) => {
                const prog = client.progressByType?.[item.type];
                const done = prog?.done ?? 0;
                const pct = prog?.pct ?? 0;
                const barColor = pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--amber)" : "var(--red)";
                const typeSty = getTypeStyle(item.type);
                return (
                  <div key={item.id}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 500, background: typeSty.bg, color: typeSty.color, padding: "2px 8px", borderRadius: 20 }}>
                        {item.type}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{done}/{item.quantity}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: barColor, minWidth: 32, textAlign: "right" }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elevated)", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 2, transition: "width 400ms ease-out" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section>
            <SectionLabel>Plano</SectionLabel>
            <div style={{
              border: "1px dashed var(--border)", borderRadius: 10,
              padding: "28px 20px", textAlign: "center",
            }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 14 }}>
                Nenhum plano aplicado a este cliente.
              </p>
              <button
                type="button"
                onClick={() => setPlanWizardOpen(true)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "var(--accent)", color: "#fff", border: "none",
                  borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
                Aplicar plano
              </button>
            </div>
          </section>
        )}

        {/* Observações internas */}
        <section>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <SectionLabel>Observacoes Internas</SectionLabel>
            <MessageSquarePlus size={14} style={{ color: "var(--text-muted)" }} />
          </div>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "var(--shadow-card)", overflow: "hidden" }}>
            <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: prefere aprovar pelo WhatsApp, evitar domingo..."
                rows={3}
                style={{ width: "100%", resize: "none", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-base)", color: "var(--text-primary)", padding: 10, fontSize: 13, outline: "none" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <Button type="button" variant="secondary" size="sm" loading={savingNote} onClick={saveNote}>
                  Salvar observacao
                </Button>
              </div>
            </div>
            {client.notes.length === 0 ? (
              <p style={{ padding: 14, fontSize: 12, color: "var(--text-muted)" }}>Nenhuma observacao interna ainda.</p>
            ) : (
              client.notes.slice(0, 5).map((log) => (
                <div key={log.id} style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)" }}>
                  <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: "18px" }}>
                    {typeof log.details?.note === "string" ? log.details.note : "Observacao registrada"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                    {log.user.name} / {formatDate(log.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Dados do cliente */}
        <section>
          <SectionLabel style={{ marginBottom: 12 }}>Dados do Cliente</SectionLabel>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", boxShadow: "var(--shadow-card)", display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { label: "Nicho", value: client.niche },
              { label: "Objetivo", value: client.mainGoal },
              { label: "Frequencia", value: client.operationalFrequency },
              { label: "Tom de comunicacao", value: client.communicationTone },
              { label: "Restricoes", value: client.restrictions },
              { label: "Preferencias", value: client.preferences },
              { label: "Notas estrategicas", value: client.strategicNotes },
            ].filter((r) => r.value).map((row) => (
              <div key={row.label} style={{ display: "flex", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", minWidth: 140, flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: "18px" }}>{row.value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* RIGHT - Timeline */}
      <div>
        <SectionLabel style={{ marginBottom: 12 }}>Timeline do Cliente</SectionLabel>
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 0", boxShadow: "var(--shadow-card)" }}>
          {timelineLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <Activity size={24} style={{ color: "var(--text-muted)", opacity: 0.3, margin: "0 auto 8px" }} />
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Nenhuma atividade registrada</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {timelineLogs.map((log, i) => {
                const dotColor = actionColors[log.action] ?? "var(--blue)";
                return (
                  <div
                    key={log.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 9,
                      padding: "9px 13px",
                      borderBottom: i < timelineLogs.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, boxShadow: `0 0 0 4px ${dotColor}16`, marginTop: 6, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 650, color: "var(--text-primary)", lineHeight: "16px" }}>
                        {log.user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()} / {getLogTitle(log)}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 3, lineHeight: "16px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {getLogMeta(log)}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                        {timeAgo(log.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Contexto rápido */}
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
          <SectionLabel style={{ marginBottom: 4 }}>Contexto Rapido</SectionLabel>
          {[
            {
              label: "Ultima atividade",
              value: client.operationalContext.lastActivityAt ? timeAgo(client.operationalContext.lastActivityAt) : "Sem registro",
              tone: client.stats.daysSinceActivity >= 4 ? "var(--amber)" : "var(--green)",
            },
            {
              label: "Proxima entrega",
              value: client.operationalContext.nextTask ? formatDate(client.operationalContext.nextTask.dueDate) : "Nada programado",
              sub: client.operationalContext.nextTask?.title,
              tone: client.operationalContext.nextTask ? "var(--blue)" : "var(--red)",
            },
            {
              label: "Pendencia",
              value: client.operationalContext.currentBlocker?.blocker ?? "Sem bloqueio",
              sub: client.operationalContext.currentBlocker?.title,
              tone: client.operationalContext.currentBlocker ? "var(--amber)" : "var(--green)",
            },
          ].map((item) => (
            <div key={item.label} style={{ padding: "10px 14px", background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: item.tone, flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{item.label}</span>
              </div>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.value}</p>
              {item.sub && <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.sub}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Inteligência Tab ───────────────────────────────────────────────────────────

function InteligenciaTab({ clientId, clientName, niche }: { clientId: string; clientName: string; niche?: string }) {
  return (
    <div style={{ padding: "32px 28px", maxWidth: 680 }}>
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 20 }}>
          Acesse a base de inteligência do cliente <strong>{clientName}</strong> — campanhas, criativos, insights e exportações para IA.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <IntelCard
          href={`/intelligence/creatives?clientId=${clientId}`}
          title="Criativos e Hooks"
          description="Criativos registrados para este cliente"
          color="var(--accent)"
          bg="var(--accent-soft)"
        />
        <IntelCard
          href={`/intelligence?clientId=${clientId}`}
          title="Busca de Padrões"
          description="Busca contextual por campanhas e criativos"
          color="var(--blue)"
          bg="var(--blue-soft)"
        />
        <IntelCard
          href={`/intelligence/export?clientId=${clientId}${niche ? `&niche=${encodeURIComponent(niche)}` : ""}`}
          title="Exportar Contexto IA"
          description="Gerar briefing estruturado para Claude"
          color="var(--green)"
          bg="var(--green-soft)"
        />
        <IntelCard
          href={`/intelligence/playbooks`}
          title="Playbooks"
          description="Estratégias reutilizáveis da agência"
          color="var(--amber)"
          bg="var(--amber-soft)"
        />
      </div>

      {niche && (
        <div style={{ marginTop: 20, padding: "12px 16px", borderRadius: 10, background: "var(--bg-surface)", border: "1px solid var(--border)", fontSize: 12, color: "var(--text-muted)" }}>
          Nicho detectado: <strong style={{ color: "var(--text-primary)" }}>{niche}</strong> — sugestão de filtro aplicada nos links acima.
        </div>
      )}
    </div>
  );
}

function IntelCard({ href, title, description, color, bg }: { href: string; title: string; description: string; color: string; bg: string }) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        padding: "16px 18px", borderRadius: 10,
        background: "var(--bg-surface)", border: "1px solid var(--border)",
        boxShadow: "var(--shadow-card)", cursor: "pointer",
        transition: "box-shadow 150ms, border-color 150ms",
      }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
          <Brain size={15} color={color} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{title}</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{description}</p>
      </div>
    </Link>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <h2 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", ...style }}>
      {children}
    </h2>
  );
}

function SummaryLine({ label, value, tone, primary }: { label: string; value: string; tone: string; primary?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: tone, boxShadow: `0 0 0 4px ${tone}14`, flexShrink: 0 }} />
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</p>
      </div>
      <p style={{
        fontSize: primary ? 15 : 13, fontWeight: primary ? 700 : 600,
        color: primary ? "var(--text-primary)" : "var(--text-secondary)",
        lineHeight: primary ? "20px" : "18px",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </p>
    </div>
  );
}
