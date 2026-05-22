"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Brush,
  Check,
  ChevronDown,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Link2,
  Megaphone,
  MessageCircle,
  Plus,
  RadioTower,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Types ─────────────────────────────────────────────── */
type ScopeKey = "content" | "traffic" | "design" | "social" | "campaigns" | "landingPages";
type OperationalScope = Record<ScopeKey, { enabled: boolean; volume: string }>;

interface ClientFormProps {
  initial?: {
    name: string;
    brand?: string;
    email?: string;
    phone?: string;
    primaryContact?: string;
    website?: string;
    instagram?: string;
    city?: string;
    operationType?: string;
    operationalScope?: unknown;
    operationalFrequency?: string;
    reviewDay?: string;
    expectedSla?: string;
    meetingFrequency?: string;
    approvalRoutine?: string;
    operationalUrgency?: string;
    importantLinks?: string;
    niche?: string;
    mainGoal?: string;
    contractStart?: string | Date | null;
    communicationTone?: string;
    preferences?: string;
    strategicNotes?: string;
    clientBehavior?: string;
    restrictions?: string;
  };
  onSuccess: () => void;
  onCancel: () => void;
  clientId?: string;
}

/* ─── Scope modules config ───────────────────────────────── */
const scopeModules: Array<{
  key: ScopeKey;
  label: string;
  hint: string;
  placeholder: string;
  icon: React.ElementType;
  tone: string;
}> = [
  { key: "content",      label: "Conteúdo",      hint: "Posts, reels, copys e rotinas editoriais",  placeholder: "12 posts/mês, 4 reels/mês, stories diários",    icon: FileText,    tone: "#3B82F6" },
  { key: "traffic",      label: "Tráfego",        hint: "Campanhas, verba, otimizações e leads",      placeholder: "4 campanhas ativas, otimização semanal",         icon: RadioTower,  tone: "#7C3AED" },
  { key: "design",       label: "Design",         hint: "Criativos, peças, identidade e adaptações",  placeholder: "8 criativos/mês, demandas sob SLA",              icon: Brush,       tone: "#F59E0B" },
  { key: "social",       label: "Social",         hint: "Presença, interações e rotina de canais",    placeholder: "Respostas diárias, monitoramento semanal",       icon: MessageCircle, tone: "#10B981" },
  { key: "campaigns",    label: "Campanhas",      hint: "Ações pontuais, lançamentos e ofertas",      placeholder: "1 campanha mensal + desdobramentos",             icon: Megaphone,   tone: "#EC4899" },
  { key: "landingPages", label: "Landing pages",  hint: "Páginas de captação, eventos e conversão",   placeholder: "1 landing por campanha principal",               icon: Globe2,      tone: "#06B6D4" },
];

const emptyScope: OperationalScope = {
  content:      { enabled: false, volume: "" },
  traffic:      { enabled: false, volume: "" },
  design:       { enabled: false, volume: "" },
  social:       { enabled: false, volume: "" },
  campaigns:    { enabled: false, volume: "" },
  landingPages: { enabled: false, volume: "" },
};

function normalizeScope(value: unknown): OperationalScope {
  if (!value || typeof value !== "object") return emptyScope;
  const src = value as Partial<Record<ScopeKey, Partial<{ enabled: boolean; volume: string }>>>;
  return scopeModules.reduce((acc, m) => {
    acc[m.key] = { enabled: Boolean(src[m.key]?.enabled), volume: src[m.key]?.volume ?? "" };
    return acc;
  }, { ...emptyScope } as OperationalScope);
}

/* ─── Main component ─────────────────────────────────────── */
export function ClientForm({ initial, onSuccess, onCancel, clientId }: ClientFormProps) {
  const [step, setStep] = useState(0);

  /* Form state */
  const [name, setName]                       = useState(initial?.name ?? "");
  const [brand, setBrand]                     = useState(initial?.brand ?? "");
  const [email, setEmail]                     = useState(initial?.email ?? "");
  const [phone, setPhone]                     = useState(initial?.phone ?? "");
  const [primaryContact, setPrimaryContact]   = useState(initial?.primaryContact ?? "");
  const [website, setWebsite]                 = useState(initial?.website ?? "");
  const [instagram, setInstagram]             = useState(initial?.instagram ?? "");
  const [operationType, setOperationType]     = useState(initial?.operationType ?? "");
  const [operationalScope, setOperationalScope] = useState<OperationalScope>(() => normalizeScope(initial?.operationalScope));
  const [operationalFrequency, setOperationalFrequency] = useState(initial?.operationalFrequency ?? "");
  const [reviewDay, setReviewDay]             = useState(initial?.reviewDay ?? "");
  const [expectedSla, setExpectedSla]         = useState(initial?.expectedSla ?? "");
  const [meetingFrequency, setMeetingFrequency] = useState(initial?.meetingFrequency ?? "");
  const [approvalRoutine, setApprovalRoutine] = useState(initial?.approvalRoutine ?? "");
  const [operationalUrgency, setOperationalUrgency] = useState(initial?.operationalUrgency ?? "");
  const [strategicNotes, setStrategicNotes]   = useState(initial?.strategicNotes ?? "");
  const [clientBehavior, setClientBehavior]   = useState(initial?.clientBehavior ?? "");
  const [restrictions, setRestrictions]       = useState(initial?.restrictions ?? "");
  const [importantLinks, setImportantLinks]   = useState(initial?.importantLinks ?? "");
  const [linkDraft, setLinkDraft]             = useState("");
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState("");

  /* Derived */
  const links = useMemo(() =>
    importantLinks.split("\n").map((l) => l.trim()).filter(Boolean),
    [importantLinks],
  );
  const activeModules     = scopeModules.filter((m) => operationalScope[m.key].enabled);
  const configuredModules = activeModules.filter((m) => operationalScope[m.key].volume.trim());
  const operationName     = brand || name || "Nova operação";

  /* Handlers */
  function updateScope(key: ScopeKey, patch: Partial<{ enabled: boolean; volume: string }>) {
    setOperationalScope((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function addLink() {
    if (!linkDraft.trim()) return;
    setImportantLinks((prev) => [prev, linkDraft.trim()].filter(Boolean).join("\n"));
    setLinkDraft("");
  }

  function removeLink(link: string) {
    setImportantLinks((prev) => prev.split("\n").filter((l) => l.trim() !== link).join("\n"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) { setStep((v) => v + 1); return; }
    setError("");
    setLoading(true);
    const url    = clientId ? `/api/clients/${clientId}` : "/api/clients";
    const method = clientId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, brand, email, phone, primaryContact, website, instagram,
        operationType, operationalScope, operationalFrequency,
        reviewDay, expectedSla, meetingFrequency, approvalRoutine,
        operationalUrgency, strategicNotes, clientBehavior, restrictions, importantLinks,
      }),
    });
    setLoading(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Erro ao salvar cliente"); return; }
    onSuccess();
  }

  /* Step definitions */
  const steps = [
    { label: "Identidade", icon: BadgeCheck, done: Boolean(name && (brand || primaryContact || phone)) },
    { label: "Escopo",     icon: Layers3,    done: activeModules.length > 0 },
    { label: "Ritmo",      icon: Gauge,      done: Boolean(reviewDay || expectedSla || meetingFrequency || operationalFrequency) },
    { label: "Contexto",   icon: Sparkles,   done: Boolean(strategicNotes || clientBehavior || restrictions || links.length) },
  ];

  /* ── Render ────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">

      {/* ── Step Rail ──────────────────────────────────── */}
      <StepRail steps={steps} current={step} onSelect={setStep} />

      {/* ── Body ───────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">

        {/* Left — scrollable form area */}
        <div className="flex-1 overflow-y-auto">
          <div className="op-enter px-7 py-7" key={step}>

            {/* Step 0 — Identidade */}
            {step === 0 && (
              <FormSection title="Dados básicos" description="Identidade e canais de contato da conta.">
                <FieldGroup title="Identidade da conta">
                  <Field label="Nome do cliente" value={name} onChange={setName} placeholder="Nome operacional" required />
                  <Field label="Marca" value={brand} onChange={setBrand} placeholder="Nome público da marca" />
                </FieldGroup>
                <FieldGroup title="Contato principal">
                  <Field label="Responsável" value={primaryContact} onChange={setPrimaryContact} placeholder="Nome do contato" />
                  <Field label="WhatsApp" value={phone} onChange={setPhone} placeholder="(11) 99999-0000" />
                  <Field label="E-mail" type="email" value={email} onChange={setEmail} placeholder="contato@cliente.com" />
                </FieldGroup>
                <FieldGroup title="Canais digitais">
                  <Field label="Instagram" value={instagram} onChange={setInstagram} placeholder="@cliente" />
                  <Field label="Site" value={website} onChange={setWebsite} placeholder="https://..." />
                </FieldGroup>
              </FormSection>
            )}

            {/* Step 1 — Escopo */}
            {step === 1 && (
              <FormSection title="Estrutura operacional" description="Ative somente as frentes que existem para este cliente.">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {scopeModules.map((module) => (
                    <ModuleCard
                      key={module.key}
                      module={module}
                      active={operationalScope[module.key].enabled}
                      value={operationalScope[module.key].volume}
                      onToggle={(enabled) => updateScope(module.key, { enabled })}
                      onChange={(value) => updateScope(module.key, { volume: value })}
                    />
                  ))}
                </div>
                <FieldGroup title="Frequência e resumo">
                  <SelectField
                    label="Frequência operacional"
                    value={operationalFrequency}
                    onChange={setOperationalFrequency}
                    options={["Semanal", "Quinzenal", "Mensal", "Contínuo"]}
                  />
                  <Field label="Resumo do escopo" value={operationType} onChange={setOperationType} placeholder="Ex: Social + tráfego" />
                </FieldGroup>
              </FormSection>
            )}

            {/* Step 2 — Ritmo */}
            {step === 2 && (
              <FormSection title="Ritmo operacional" description="Cadência esperada para revisão, reunião e aprovação.">
                <FieldGroup title="Cadência">
                  <SelectField label="Dia de revisão"         value={reviewDay}           onChange={setReviewDay}           options={["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]} />
                  <SelectField label="SLA esperado"            value={expectedSla}         onChange={setExpectedSla}         options={["24h", "48h", "72h", "Sob demanda"]} />
                  <SelectField label="Frequência de reuniões" value={meetingFrequency}     onChange={setMeetingFrequency}    options={["Semanal", "Quinzenal", "Mensal", "Sem ritual fixo"]} />
                  <SelectField label="Urgência operacional"   value={operationalUrgency}   onChange={setOperationalUrgency}  options={["Baixa", "Média", "Alta", "Crítica"]} />
                </FieldGroup>
                <TextAreaField
                  label="Rotina de aprovação"
                  value={approvalRoutine}
                  onChange={setApprovalRoutine}
                  placeholder="Ex: cliente revisa na quinta, aprova via WhatsApp"
                  rows={4}
                />
              </FormSection>
            )}

            {/* Step 3 — Contexto */}
            {step === 3 && (
              <FormSection title="Contexto interno" description="Memória curta para reduzir atrito e retrabalho.">
                <TextAreaField label="Observações estratégicas" value={strategicNotes} onChange={setStrategicNotes} placeholder="Contexto que muda a execução" rows={3} />
                <FieldGroup title="Comportamento e restrições">
                  <TextAreaField label="Comportamento do cliente" value={clientBehavior} onChange={setClientBehavior} placeholder="Como aprova, responde e decide" rows={4} />
                  <TextAreaField label="Restrições e atenção"    value={restrictions}   onChange={setRestrictions}   placeholder="O que evitar ou monitorar" rows={4} />
                </FieldGroup>
                <LinkManager
                  draft={linkDraft}
                  onDraftChange={setLinkDraft}
                  links={links}
                  onAdd={addLink}
                  onRemove={removeLink}
                />
              </FormSection>
            )}

          </div>
        </div>

        {/* Right — live summary sidebar */}
        <Sidebar
          operationName={operationName}
          operationType={operationType}
          activeModules={activeModules}
          configuredModules={configuredModules}
          operationalScope={operationalScope}
          operationalFrequency={operationalFrequency}
          reviewDay={reviewDay}
          expectedSla={expectedSla}
          meetingFrequency={meetingFrequency}
          operationalUrgency={operationalUrgency}
        />
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-4 border-t px-7 py-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="shrink-0 text-[11px] font-medium tabular-nums"
            style={{ color: "var(--text-muted)" }}
          >
            {step + 1} / 4
          </span>
          {error && (
            <p
              className="truncate rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ color: "var(--red)", background: "var(--red-soft)" }}
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {step === 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancelar
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep((v) => v - 1)}>
              <ArrowLeft size={13} />
              Voltar
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" loading={loading}>
            {step < 3
              ? <><span>Continuar</span> <ArrowRight size={13} /></>
              : clientId ? "Salvar setup" : "Criar cliente"
            }
          </Button>
        </div>
      </div>
    </form>
  );
}

/* ─── Shared field style ─────────────────────────────────── */
const fieldStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background:  "var(--bg-elevated)",
  color:       "var(--text-primary)",
};

/* ─── StepRail ───────────────────────────────────────────── */
function StepRail({
  steps,
  current,
  onSelect,
}: {
  steps: Array<{ label: string; icon: React.ElementType; done: boolean }>;
  current: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      className="flex items-center px-7 py-4 border-b gap-0"
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
    >
      {steps.map((s, i) => {
        const isActive = i === current;
        const isPast   = i < current;
        const showCheck = s.done && !isActive;

        return (
          <Fragment key={s.label}>
            <button
              type="button"
              onClick={() => onSelect(i)}
              className="flex items-center gap-2.5 shrink-0 transition-opacity"
              style={{ opacity: !isActive && !isPast && !s.done ? 0.55 : 1 }}
            >
              {/* Circle */}
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full transition-all"
                style={{
                  background:   isActive ? "var(--accent)" : showCheck ? "var(--accent-soft)" : "var(--bg-elevated)",
                  border:       `1.5px solid ${isActive ? "var(--accent)" : showCheck ? "var(--accent-mid)" : "var(--border-strong)"}`,
                  color:        isActive ? "#fff" : showCheck ? "var(--accent)" : "var(--text-muted)",
                  boxShadow:    isActive ? "0 2px 8px rgba(79,70,229,0.28)" : "none",
                }}
              >
                {showCheck
                  ? <Check size={12} strokeWidth={2.5} />
                  : <span className="text-[11px] font-bold leading-none">{i + 1}</span>
                }
              </span>

              {/* Label */}
              <span
                className="text-xs font-semibold leading-none"
                style={{ color: isActive ? "var(--text-primary)" : "var(--text-muted)" }}
              >
                {s.label}
              </span>
            </button>

            {/* Connector */}
            {i < steps.length - 1 && (
              <div
                className="mx-3 h-px flex-1 transition-colors"
                style={{
                  background:  i < current ? "var(--accent-mid)" : "var(--border-strong)",
                  minWidth: 16,
                  opacity: 0.55,
                }}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/* ─── FormSection ────────────────────────────────────────── */
function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-8">
        <h3 className="text-[15px] font-semibold leading-none" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>{description}</p>
      </div>
      <div className="flex flex-col gap-7">{children}</div>
    </section>
  );
}

/* ─── FieldGroup ─────────────────────────────────────────── */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <span
          className="shrink-0 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", opacity: 0.65 }}
        >
          {title}
        </span>
        <div className="h-px flex-1" style={{ background: "var(--border)" }} />
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">{children}</div>
    </div>
  );
}

/* ─── Field ──────────────────────────────────────────────── */
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-xl border px-3.5 text-sm outline-none transition-colors placeholder:opacity-40"
        style={fieldStyle}
      />
    </div>
  );
}

/* ─── SelectField ────────────────────────────────────────── */
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full appearance-none rounded-xl border px-3.5 pr-9 text-sm outline-none transition-colors"
          style={fieldStyle}
        >
          <option value="">Selecionar</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown
          size={13}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    </div>
  );
}

/* ─── TextAreaField ──────────────────────────────────────── */
function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="resize-none rounded-xl border px-3.5 py-3 text-sm leading-6 outline-none transition-colors placeholder:opacity-40"
        style={fieldStyle}
      />
    </div>
  );
}

/* ─── ModuleCard ─────────────────────────────────────────── */
function ModuleCard({
  module,
  active,
  value,
  onToggle,
  onChange,
}: {
  module: (typeof scopeModules)[number];
  active: boolean;
  value: string;
  onToggle: (enabled: boolean) => void;
  onChange: (value: string) => void;
}) {
  const Icon = module.icon;

  return (
    <div
      className="rounded-2xl border p-4 transition-all"
      style={{
        borderColor: active ? `${module.tone}50` : "var(--border)",
        background:  active ? `${module.tone}08` : "var(--bg-surface)",
        boxShadow:   active ? `0 0 0 1px ${module.tone}20` : "none",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all"
          style={{
            background: active ? `${module.tone}18` : "var(--bg-elevated)",
            color:      active ? module.tone : "var(--text-muted)",
          }}
        >
          <Icon size={16} />
        </span>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                {module.label}
              </p>
              <p className="mt-1 text-[11px] leading-4" style={{ color: "var(--text-muted)" }}>
                {module.hint}
              </p>
            </div>
            <Toggle active={active} color={module.tone} onToggle={onToggle} label={module.label} />
          </div>

          {/* Expandable volume input */}
          <div
            style={{
              maxHeight: active ? 90 : 0,
              opacity:   active ? 1 : 0,
              overflow:  "hidden",
              transition: "max-height 240ms ease-out, opacity 200ms ease-out",
            }}
          >
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={module.placeholder}
              rows={2}
              className="mt-3.5 w-full resize-none rounded-xl border px-3.5 py-2.5 text-xs leading-5 outline-none placeholder:opacity-40"
              style={fieldStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Toggle ─────────────────────────────────────────────── */
function Toggle({
  active,
  color,
  onToggle,
  label,
}: {
  active: boolean;
  color: string;
  onToggle: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`Alternar ${label}`}
      onClick={() => onToggle(!active)}
      className="relative h-5 w-9 shrink-0 rounded-full transition-colors"
      style={{ background: active ? color : "var(--border-strong)" }}
    >
      <span
        className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform"
        style={{ left: 2, transform: active ? "translateX(16px)" : "translateX(0)" }}
      />
    </button>
  );
}

/* ─── LinkManager ────────────────────────────────────────── */
function LinkManager({
  draft,
  onDraftChange,
  links,
  onAdd,
  onRemove,
}: {
  draft: string;
  onDraftChange: (v: string) => void;
  links: string[];
  onAdd: () => void;
  onRemove: (link: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Links importantes
      </label>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd(); } }}
          placeholder="https://..."
          className="h-10 flex-1 rounded-xl border px-3.5 text-sm outline-none placeholder:opacity-40"
          style={fieldStyle}
        />
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-4 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--accent)" }}
        >
          <Plus size={12} />
          Adicionar
        </button>
      </div>

      {links.length > 0 && (
        <div className="mt-0.5 flex flex-col gap-1.5">
          {links.map((link) => (
            <div
              key={link}
              className="flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5"
              style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
            >
              <Link2 size={11} className="shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="flex-1 truncate text-xs" style={{ color: "var(--text-secondary)" }}>{link}</span>
              <button
                type="button"
                onClick={() => onRemove(link)}
                className="shrink-0 opacity-40 transition-opacity hover:opacity-100"
              >
                <Trash2 size={12} style={{ color: "var(--red)" }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Sidebar ────────────────────────────────────────────── */
function Sidebar({
  operationName,
  operationType,
  activeModules,
  configuredModules,
  operationalScope,
  operationalFrequency,
  reviewDay,
  expectedSla,
  meetingFrequency,
  operationalUrgency,
}: {
  operationName: string;
  operationType: string;
  activeModules: typeof scopeModules;
  configuredModules: typeof scopeModules;
  operationalScope: OperationalScope;
  operationalFrequency: string;
  reviewDay: string;
  expectedSla: string;
  meetingFrequency: string;
  operationalUrgency: string;
}) {
  const hasRhythm = Boolean(operationalFrequency || reviewDay || expectedSla || meetingFrequency || operationalUrgency);

  return (
    <aside
      className="w-72 shrink-0 overflow-y-auto border-l"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
    >
      <div className="p-5">

        {/* Header */}
        <div className="mb-5 flex items-center gap-2.5">
          <span className="live-dot h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Operação prevista</p>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Resumo em tempo real</p>
          </div>
        </div>

        {/* Account card */}
        <SidebarCard>
          <SidebarLabel>Conta</SidebarLabel>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{operationName}</p>
          {operationType && (
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{operationType}</p>
          )}
        </SidebarCard>

        {/* Active modules */}
        <div className="mb-4">
          <SidebarLabel>Frentes ativas</SidebarLabel>
          {activeModules.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Nenhuma frente ativada ainda.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {activeModules.map((m) => {
                const Icon = m.icon;
                const vol  = operationalScope[m.key].volume;
                return (
                  <div key={m.key} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                      style={{ background: `${m.tone}18`, color: m.tone }}
                    >
                      <Icon size={10} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-none" style={{ color: "var(--text-primary)" }}>
                        {m.label}
                      </p>
                      <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {vol || "volume a definir"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Rhythm */}
        {hasRhythm && (
          <SidebarCard className="mb-4">
            <SidebarLabel>Ritmo</SidebarLabel>
            <div className="mt-2 flex flex-col gap-1.5">
              {operationalFrequency && <RhythmRow label="Frequência"  value={operationalFrequency} />}
              {reviewDay            && <RhythmRow label="Revisão"     value={reviewDay} />}
              {expectedSla          && <RhythmRow label="SLA"         value={expectedSla} />}
              {meetingFrequency     && <RhythmRow label="Reunião"     value={meetingFrequency} />}
              {operationalUrgency   && <RhythmRow label="Urgência"    value={operationalUrgency} />}
            </div>
          </SidebarCard>
        )}

        {/* Operational reading */}
        <SidebarCard>
          <SidebarLabel>Leitura operacional</SidebarLabel>
          <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
            {configuredModules.length > 0
              ? `${operationName} nasce com ${configuredModules.length} frente${configuredModules.length === 1 ? "" : "s"} configurada${configuredModules.length === 1 ? "" : "s"}.`
              : "Defina o escopo para o sistema entender o ritmo desta conta."}
          </p>
        </SidebarCard>

      </div>
    </aside>
  );
}

/* ─── Sidebar helpers ────────────────────────────────────── */
function SidebarCard({ children, className = "mb-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-3.5 ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
    >
      {children}
    </div>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
      {children}
    </p>
  );
}

function RhythmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[11px] font-semibold" style={{ color: "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}
