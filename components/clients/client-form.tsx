"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Gauge,
  Layers3,
  Link2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_DEFAULTS } from "@/lib/deliverable-defaults";

/* ─── Types ─────────────────────────────────────────────── */

interface DeliverableItem {
  type: string;
  quantity: number;
  deadlineDayOfMonth: number | null; // null = último dia do mês
}

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
    deliverables?: DeliverableItem[];
  };
  onSuccess: () => void;
  onCancel: () => void;
  clientId?: string;
}

/* ─── Deliverable presets ────────────────────────────────── */
const DELIVERABLE_PRESETS = Object.keys(DELIVERABLE_DEFAULTS);
const CUSTOM_TYPES = ["Google Ads", "TikTok Ads", "Email Marketing", "SEO", "Apresentação", "Landing Page"];
const ALL_TYPES = [...DELIVERABLE_PRESETS, ...CUSTOM_TYPES.filter((t) => !DELIVERABLE_PRESETS.includes(t))];

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

  /* Deliverables state */
  const [deliverables, setDeliverables] = useState<DeliverableItem[]>(() => {
    if (initial?.deliverables?.length) return initial.deliverables;
    return [];
  });
  const [customTypeDraft, setCustomTypeDraft] = useState("");

  /* Derived */
  const links = useMemo(() =>
    importantLinks.split("\n").map((l) => l.trim()).filter(Boolean),
    [importantLinks],
  );
  const operationName = brand || name || "Nova operação";

  /* Deliverable handlers */
  function addDeliverable(type: string) {
    if (deliverables.some((d) => d.type === type)) return;
    const defaults = DELIVERABLE_DEFAULTS[type];
    setDeliverables((prev) => [...prev, {
      type,
      quantity: 1,
      deadlineDayOfMonth: defaults?.deadlineDayOfMonth ?? 20,
    }]);
  }

  function removeDeliverable(type: string) {
    setDeliverables((prev) => prev.filter((d) => d.type !== type));
  }

  function updateDeliverable(type: string, patch: Partial<DeliverableItem>) {
    setDeliverables((prev) => prev.map((d) => d.type === type ? { ...d, ...patch } : d));
  }

  function addCustomType() {
    const t = customTypeDraft.trim();
    if (!t) return;
    addDeliverable(t);
    setCustomTypeDraft("");
  }

  /* Link handlers */
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
        operationType, operationalFrequency,
        reviewDay, expectedSla, meetingFrequency, approvalRoutine,
        operationalUrgency, strategicNotes, clientBehavior, restrictions, importantLinks,
        deliverables,
      }),
    });
    setLoading(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "Erro ao salvar cliente"); return; }
    onSuccess();
  }

  /* Step definitions */
  const steps = [
    { label: "Identidade",    icon: BadgeCheck, done: Boolean(name && (brand || primaryContact || phone)) },
    { label: "Entregáveis",   icon: Layers3,    done: deliverables.length > 0 },
    { label: "Ritmo",         icon: Gauge,      done: Boolean(reviewDay || expectedSla || meetingFrequency || operationalFrequency) },
    { label: "Contexto",      icon: Sparkles,   done: Boolean(strategicNotes || clientBehavior || restrictions || links.length) },
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

            {/* Step 1 — Entregáveis */}
            {step === 1 && (
              <FormSection title="Entregáveis mensais" description="O que este cliente recebe por mês. Você vai marcar como concluído conforme o mês avança.">

                {/* Type picker */}
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)", opacity: 0.65 }}>Adicionar entregável</span>
                    <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ALL_TYPES.map((type) => {
                      const active = deliverables.some((d) => d.type === type);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => active ? removeDeliverable(type) : addDeliverable(type)}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all"
                          style={{
                            borderColor: active ? "var(--accent)" : "var(--border)",
                            background:  active ? "var(--accent-soft)" : "var(--bg-surface)",
                            color:       active ? "var(--accent)" : "var(--text-muted)",
                          }}
                        >
                          {active ? <Check size={10} strokeWidth={2.5} /> : <Plus size={10} />}
                          {type}
                        </button>
                      );
                    })}
                    {/* Custom type input */}
                    <div className="flex items-center gap-1.5">
                      <input
                        value={customTypeDraft}
                        onChange={(e) => setCustomTypeDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomType(); } }}
                        placeholder="Outro tipo..."
                        className="h-8 rounded-full border px-3 text-xs outline-none placeholder:opacity-40"
                        style={{ borderColor: "var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)", width: 130 }}
                      />
                      <button
                        type="button"
                        onClick={addCustomType}
                        className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold text-white"
                        style={{ background: "var(--accent)" }}
                      >
                        <Plus size={10} /> Adicionar
                      </button>
                    </div>
                  </div>
                </div>

                {/* Deliverables table */}
                {deliverables.length > 0 && (
                  <div>
                    <div className="mb-3 flex items-center gap-3">
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)", opacity: 0.65 }}>Configurar quantidades</span>
                      <div className="h-px flex-1" style={{ background: "var(--border)" }} />
                    </div>
                    <div className="flex flex-col gap-2">
                      {deliverables.map((d) => (
                        <DeliverableRow
                          key={d.type}
                          item={d}
                          onChange={(patch) => updateDeliverable(d.type, patch)}
                          onRemove={() => removeDeliverable(d.type)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {deliverables.length === 0 && (
                  <div className="rounded-2xl border border-dashed py-10 text-center" style={{ borderColor: "var(--border)" }}>
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      Selecione ao menos um entregável acima.
                    </p>
                  </div>
                )}

                <FieldGroup title="Resumo e frequência">
                  <SelectField
                    label="Frequência operacional"
                    value={operationalFrequency}
                    onChange={setOperationalFrequency}
                    options={["Semanal", "Quinzenal", "Mensal", "Contínuo"]}
                  />
                  <Field label="Resumo do escopo" value={operationType} onChange={setOperationType} placeholder="Ex: Social + tráfego pago" />
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
          deliverables={deliverables}
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

/* ─── DeliverableRow ─────────────────────────────────────── */
function DeliverableRow({
  item,
  onChange,
  onRemove,
}: {
  item: DeliverableItem;
  onChange: (patch: Partial<DeliverableItem>) => void;
  onRemove: () => void;
}) {
  const defaults = DELIVERABLE_DEFAULTS[item.type];
  const defaultDeadline = defaults?.deadlineDayOfMonth ?? 20;
  const isFimDoMes = item.deadlineDayOfMonth === 0;

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border px-4 py-3"
      style={{ borderColor: "var(--accent-soft)", background: "var(--bg-surface)" }}
    >
      {/* Type label */}
      <span
        className="min-w-0 flex-1 text-sm font-semibold"
        style={{ color: "var(--text-primary)" }}
      >
        {item.type}
      </span>

      {/* Quantity stepper */}
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onChange({ quantity: Math.max(1, item.quantity - 1) })}
          className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}
        >
          <Minus size={11} />
        </button>
        <span className="w-8 text-center text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {item.quantity}
        </span>
        <button
          type="button"
          onClick={() => onChange({ quantity: item.quantity + 1 })}
          className="flex h-7 w-7 items-center justify-center rounded-lg border transition-colors"
          style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}
        >
          <Plus size={11} />
        </button>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>×/mês</span>
      </div>

      {/* Deadline: "Dia X" or "Fim do mês" */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Toggle fim do mês */}
        <button
          type="button"
          onClick={() => onChange({ deadlineDayOfMonth: isFimDoMes ? defaultDeadline : 0 })}
          className="h-7 rounded-lg border px-2 text-[11px] font-semibold transition-all"
          style={{
            borderColor: isFimDoMes ? "var(--accent)" : "var(--border)",
            background:  isFimDoMes ? "var(--accent-soft)" : "var(--bg-elevated)",
            color:       isFimDoMes ? "var(--accent)" : "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
          title={isFimDoMes ? "Clique para definir um dia fixo" : "Clique para sem data fixa (conclui no fim do mês)"}
        >
          {isFimDoMes ? "Fim do mês" : "Sem data"}
        </button>

        {/* Day input — só mostra quando tem dia definido */}
        {!isFimDoMes && (
          <>
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>dia</span>
            <input
              type="number"
              min={1}
              max={31}
              value={item.deadlineDayOfMonth ?? defaultDeadline}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                onChange({ deadlineDayOfMonth: v > 0 ? v : defaultDeadline });
              }}
              className="h-7 w-12 rounded-lg border px-2 text-center text-xs font-semibold outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}
            />
          </>
        )}
      </div>

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 opacity-30 transition-opacity hover:opacity-80"
      >
        <Trash2 size={13} style={{ color: "var(--red)" }} />
      </button>
    </div>
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
  deliverables,
  operationalFrequency,
  reviewDay,
  expectedSla,
  meetingFrequency,
  operationalUrgency,
}: {
  operationName: string;
  operationType: string;
  deliverables: DeliverableItem[];
  operationalFrequency: string;
  reviewDay: string;
  expectedSla: string;
  meetingFrequency: string;
  operationalUrgency: string;
}) {
  const hasRhythm = Boolean(operationalFrequency || reviewDay || expectedSla || meetingFrequency || operationalUrgency);
  const totalDeliverables = deliverables.reduce((sum, d) => sum + d.quantity, 0);

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

        {/* Deliverables summary */}
        <div className="mb-4">
          <SidebarLabel>Entregáveis/mês</SidebarLabel>
          {deliverables.length === 0 ? (
            <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>Nenhum entregável definido ainda.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {deliverables.map((d) => (
                <div key={d.type} className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>{d.type}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold tabular-nums" style={{ color: "var(--accent)" }}>{d.quantity}×</span>
                    {d.deadlineDayOfMonth != null && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>até {d.deadlineDayOfMonth === 0 ? "fim" : `dia ${d.deadlineDayOfMonth}`}</span>
                    )}
                  </div>
                </div>
              ))}
              {totalDeliverables > 0 && (
                <div className="mt-1 pt-1.5 border-t flex items-center justify-between" style={{ borderColor: "var(--border)" }}>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Total mensal</span>
                  <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{totalDeliverables} entregas</span>
                </div>
              )}
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
            {deliverables.length > 0
              ? `${operationName} tem ${deliverables.length} tipo${deliverables.length === 1 ? "" : "s"} de entregável — ${totalDeliverables} entrega${totalDeliverables === 1 ? "" : "s"} por mês.`
              : "Defina os entregáveis para o sistema gerar as tasks automaticamente cada mês."}
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
