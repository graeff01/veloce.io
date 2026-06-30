"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Edit2, Activity, Loader2, Upload, Trash2,
  Columns3, User, Mic, Bot, BarChart3, Send, Radar, FileText,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Badge, ClientStatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ClientForm } from "@/components/clients/client-form";
import { ClientHealthCard } from "@/components/clients/client-health-card";
import { FixedDemandsSection } from "@/components/clients/fixed-demands-section";
import { KanbanBoard } from "@/components/clients/kanban-board";
import { MeetingsTab } from "@/components/clients/meetings-tab";
import { WhatsAppTab } from "@/components/clients/whatsapp-tab";
import { CompetitiveIntelTab } from "@/components/clients/competitive-intel-tab";
import { AiAgentTab } from "@/components/ai-agent/ai-agent-tab";
import { AdsTab } from "@/components/clients/ads-tab";
import { GoogleAdsTab } from "@/components/clients/google-ads-tab";
import { BotTab } from "@/components/clients/bot-tab";
import { ReportsTab } from "@/components/clients/reports-tab";
import { FacebookGlyph, GoogleGlyph, WhatsAppGlyph } from "@/components/clients/brand-glyphs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientDetail {
  id: string;
  name: string;
  brand?: string;
  logoUrl?: string | null;
  followUpAt?: string | null;
  followUpNote?: string | null;
  email?: string;
  phone?: string;
  primaryContact?: string;
  website?: string;
  instagram?: string;
  city?: string;
  status: "ACTIVE" | "INACTIVE" | "PAUSED";
  modules?: string[];
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

type Tab = "operacao" | "perfil" | "reunioes" | "leads" | "anuncios" | "google" | "inteligencia" | "ia" | "bot" | "relatorios";

// ── Root component ────────────────────────────────────────────────────────────

export function ClientDetailContent({ clientId }: { clientId: string }) {
  const { data: session } = useSession();
  const [client,     setClient]     = useState<ClientDetail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>("operacao");
  const [editOpen,   setEditOpen]   = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (res.ok) setClient(await res.json());
    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [clientId]);

  // Deep-link: abre direto na aba pedida via ?tab= (usado pelos links das
  // notificações, ex.: "Responder →" abre a aba WhatsApp).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    const valid: Tab[] = ["operacao", "perfil", "reunioes", "leads", "anuncios", "google", "inteligencia", "ia", "bot"];
    if (t && (valid as string[]).includes(t)) setTab(t as Tab);
  }, []);

  const isAdmin    = session?.user.role === "ADMIN";
  const currentPlan = client?.clientPlans?.[0];

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

  // Operação, Relatórios e Perfil são sempre fixas; o resto depende dos módulos.
  const CORE_TABS: Tab[] = ["operacao", "relatorios", "perfil"];
  // brand: cor da marca aplicada ao título + sublinhado (Meta = azul Facebook, Google = azul Google).
  const allTabs: { key: Tab; label: string; icon: React.ReactNode; brand?: string }[] = [
    { key: "operacao",  label: "Operação",  icon: <Columns3 size={13} /> },
    { key: "reunioes",  label: "Reuniões",  icon: <Mic size={13} /> },
    { key: "leads",     label: "WhatsApp",  icon: <WhatsAppGlyph size={14} />, brand: "#25D366" },
    { key: "anuncios",  label: "Anúncios",  icon: <FacebookGlyph size={14} />, brand: "#1877F2" },
    { key: "google",    label: "Google",    icon: <GoogleGlyph size={14} />,   brand: "#4285F4" },
    { key: "inteligencia", label: "Inteligência", icon: <Radar size={13} /> },
    { key: "ia",        label: "IA",        icon: <Bot size={13} /> },
    { key: "bot",       label: "BOT",       icon: <Send size={13} /> },
    { key: "relatorios", label: "Relatórios", icon: <FileText size={13} /> },
    { key: "perfil",    label: "Perfil",    icon: <User size={13} /> },
  ];
  const tabs = client.modules
    ? allTabs.filter((t) => CORE_TABS.includes(t.key) || client.modules!.includes(t.key))
    : allTabs;
  // Se a aba ativa não está visível (módulo desligado / deep-link), cai na Operação.
  const activeTab: Tab = tabs.some((t) => t.key === tab) ? tab : "operacao";

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
                {currentPlan && <Badge variant="purple">{currentPlan.plan.name}</Badge>}
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
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2 }}>
          {tabs.map(({ key, label, icon, brand }) => {
            const active = activeTab === key;
            // Abas de marca (Meta/Google) usam a cor da marca no título e no sublinhado.
            const labelColor = brand ?? (active ? "var(--text-primary)" : "var(--text-muted)");
            const underline = active ? `2px solid ${brand ?? "var(--accent)"}` : "2px solid transparent";
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
                  color: labelColor,
                  opacity: brand && !active ? 0.78 : 1,
                  borderBottom: underline,
                  marginBottom: -1,
                  transition: "color 120ms, border-color 120ms, opacity 120ms",
                }}
              >
                {icon} {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ──────────────────────────────────── */}
      {activeTab === "operacao" && (
        <KanbanBoard clientId={clientId} clientName={client.name} />
      )}

      {activeTab === "reunioes" && (
        <MeetingsTab clientId={clientId} />
      )}

      {activeTab === "leads" && (
        <WhatsAppTab clientId={clientId} />
      )}

      {activeTab === "anuncios" && (
        <div style={{ padding: "24px 28px" }}>
          <AdsTab clientId={clientId} />
        </div>
      )}

      {activeTab === "google" && (
        <GoogleAdsTab clientId={clientId} />
      )}

      {activeTab === "inteligencia" && (
        <CompetitiveIntelTab clientId={clientId} />
      )}

      {activeTab === "ia" && (
        <AiAgentTab clientId={clientId} />
      )}

      {activeTab === "bot" && (
        <BotTab clientId={clientId} />
      )}

      {activeTab === "relatorios" && (
        <ReportsTab clientId={clientId} modules={client.modules} />
      )}

      {activeTab === "perfil" && (
        <PerfilTab
          client={client}
          clientId={clientId}
          isAdmin={isAdmin}
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
            modules:             client.modules,
            deliverables:        currentPlan?.plan.items.map((item) => ({
              type:              item.type,
              quantity:          item.quantity,
              deadlineDayOfMonth: item.deadlineDayOfMonth ?? null,
            })) ?? [],
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
  onEditOpen,
  onSaved,
}: {
  client: ClientDetail;
  clientId: string;
  isAdmin: boolean;
  onEditOpen: () => void;
  onSaved: () => void;
}) {
  const [fuDate, setFuDate] = useState(client.followUpAt ? client.followUpAt.slice(0, 10) : "");
  const [fuNote, setFuNote] = useState(client.followUpNote ?? "");
  const [savingFu, setSavingFu] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [savingLogo, setSavingLogo] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  async function saveFollowUp() {
    setSavingFu(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        followUpAt: fuDate ? new Date(fuDate).toISOString() : null,
        followUpNote: fuNote.trim() || null,
      }),
    });
    setSavingFu(false);
    onSaved();
  }

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

  function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (logoInputRef.current) logoInputRef.current.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Selecione um arquivo de imagem."); return; }
    if (file.size > 600 * 1024) { alert("Logo muito grande (máx. 600KB)."); return; }
    const reader = new FileReader();
    reader.onload = () => saveLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function saveStatus(status: "ACTIVE" | "PAUSED" | "INACTIVE") {
    if (status === client.status || savingStatus) return;
    setSavingStatus(true);
    await fetch(`/api/clients/${clientId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSavingStatus(false);
    onSaved();
  }

  const timelineLogs = client.recentLogs
    .filter(l => l.action !== "UPDATE_CLIENT")
    .slice(0, 12);

  const groups = [
    { title: "Contato", rows: [
      { label: "Responsável", value: client.primaryContact },
      { label: "E-mail", value: client.email },
      { label: "Telefone", value: client.phone },
      { label: "Instagram", value: client.instagram },
      { label: "Website", value: client.website },
      { label: "Cidade", value: client.city },
    ] },
    { title: "Operação", rows: [
      { label: "Frequência", value: client.operationalFrequency },
      { label: "Reuniões", value: client.meetingFrequency },
      { label: "SLA esperado", value: client.expectedSla },
      { label: "Rotina de aprovação", value: client.approvalRoutine },
    ] },
    { title: "Estratégia", rows: [
      { label: "Nicho", value: client.niche },
      { label: "Objetivo", value: client.mainGoal },
      { label: "Tom de comunicação", value: client.communicationTone },
      { label: "Restrições", value: client.restrictions },
      { label: "Preferências", value: client.preferences },
      { label: "Comportamento", value: client.clientBehavior },
      { label: "Notas estratégicas", value: client.strategicNotes },
    ] },
    { title: "Links", rows: [
      { label: "Links importantes", value: client.importantLinks },
    ] },
  ].map((g) => ({ ...g, rows: g.rows.filter((r) => r.value) })).filter((g) => g.rows.length > 0);

  return (
    <div style={{
      flex: 1, padding: "24px 28px 48px",
      display: "grid", gridTemplateColumns: "1.6fr 1fr",
      gap: 28, alignItems: "start",
    }}>

      {/* ── Left: Client data (agrupado) ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Identidade (logo + nome) */}
        <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "center", gap: 16, boxShadow: "var(--shadow-card)" }}>
          <div style={{ width: 64, height: 64, borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {client.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={client.logoUrl} alt={client.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <Avatar name={client.name} size="md" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{client.name}</p>
            {client.brand && <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0" }}>{client.brand}</p>}
            {isAdmin && (
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoFile} />
                <button onClick={() => logoInputRef.current?.click()} disabled={savingLogo}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: 12, fontWeight: 600, cursor: savingLogo ? "default" : "pointer", opacity: savingLogo ? 0.6 : 1 }}>
                  {savingLogo ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={12} />}
                  {client.logoUrl ? "Trocar foto" : "Enviar foto"}
                </button>
                {client.logoUrl && !savingLogo && (
                  <button onClick={() => saveLogo(null)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    <Trash2 size={12} /> Remover
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status do cliente */}
        {isAdmin && (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 18px", boxShadow: "var(--shadow-card)" }}>
            <Label style={{ marginBottom: 10 }}>Status do cliente</Label>
            <div style={{ display: "flex", gap: 8 }}>
              {([["ACTIVE", "Ativo", "#16A34A"], ["PAUSED", "Pausado", "#D97706"], ["INACTIVE", "Inativo", "#64748B"]] as const).map(([value, label, color]) => {
                const active = client.status === value;
                return (
                  <button key={value} onClick={() => saveStatus(value)} disabled={savingStatus}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 10px", borderRadius: 9, cursor: savingStatus ? "default" : "pointer", fontSize: 12.5, fontWeight: 600,
                      border: `1px solid ${active ? color : "var(--border)"}`,
                      background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : "var(--bg-elevated)",
                      color: active ? color : "var(--text-muted)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? color : "var(--text-muted)" }} /> {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Label>Dados do cliente</Label>
          {isAdmin && (
            <button onClick={onEditOpen}
              style={{ display: "flex", alignItems: "center", gap: 5, border: "1px solid var(--border)", background: "transparent", borderRadius: 7, padding: "4px 12px", fontSize: 11, color: "var(--text-muted)", cursor: "pointer" }}>
              <Edit2 size={10} /> Editar
            </button>
          )}
        </div>

        {groups.length === 0 ? (
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "32px 18px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Nenhum dado cadastrado</p>
            {isAdmin && (
              <button onClick={onEditOpen}
                style={{ marginTop: 10, padding: "7px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}>
                Preencher dados
              </button>
            )}
          </div>
        ) : groups.map((g) => (
          <div key={g.title} style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", boxShadow: "var(--shadow-card)" }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.06em", textTransform: "uppercase", padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)", margin: 0 }}>{g.title}</p>
            <div style={{ padding: "6px 0" }}>
              {g.rows.map((row) => (
                <div key={row.label} style={{ display: "flex", gap: 14, padding: "8px 18px", alignItems: "baseline" }}>
                  <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", minWidth: 150, flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontSize: 12.5, color: "var(--text-primary)", lineHeight: 1.5 }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Demandas fixas — entram no kanban "A fazer" todo início de mês */}
        <FixedDemandsSection clientId={clientId} isAdmin={isAdmin} />
      </section>

      {/* ── Right: Saúde + Follow-up + Activity timeline ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

        {/* Saúde das integrações */}
        <section>
          <Label style={{ marginBottom: 10 }}>Saúde das integrações</Label>
          <ClientHealthCard clientId={clientId} />
        </section>

        {/* Follow-up / próximo contato */}
        <section>
          <Label style={{ marginBottom: 10 }}>Próximo contato (follow-up)</Label>
          <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              type="date"
              value={fuDate}
              onChange={(e) => setFuDate(e.target.value)}
              style={{ height: 38, borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
            />
            <textarea
              value={fuNote}
              onChange={(e) => setFuNote(e.target.value)}
              placeholder="Ex: cobrar aprovação dos criativos, renovar contrato..."
              rows={2}
              style={{ borderRadius: 9, border: "1px solid var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)", padding: "9px 12px", fontSize: 13, outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={saveFollowUp}
                disabled={savingFu}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: savingFu ? "default" : "pointer", opacity: savingFu ? 0.6 : 1 }}
              >
                {savingFu && <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />} Salvar
              </button>
            </div>
            {client.followUpAt && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                Agendado para {formatDate(client.followUpAt)}{client.followUpNote ? ` · ${client.followUpNote}` : ""}
              </p>
            )}
          </div>
        </section>

        <div>
        <Label style={{ marginBottom: 10 }}>Histórico de atividade</Label>
        <div style={{
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 10, overflowX: "hidden", overflowY: "auto", maxHeight: 320,
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
