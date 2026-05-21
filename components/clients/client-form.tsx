"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Brush,
  Check,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  Megaphone,
  MessageCircle,
  Plus,
  RadioTower,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

const scopeModules: Array<{
  key: ScopeKey;
  label: string;
  hint: string;
  placeholder: string;
  icon: React.ElementType;
  tone: string;
}> = [
  { key: "content", label: "Conteudo", hint: "posts, reels, copys e rotinas editoriais", placeholder: "12 posts/mes, 4 reels/mes, stories diarios", icon: FileText, tone: "#3B82F6" },
  { key: "traffic", label: "Trafego", hint: "campanhas, verba, otimizacoes e leads", placeholder: "4 campanhas ativas, otimizacao semanal", icon: RadioTower, tone: "#7C3AED" },
  { key: "design", label: "Design", hint: "criativos, pecas, identidade e adaptacoes", placeholder: "8 criativos/mes, demandas sob SLA", icon: Brush, tone: "#F59E0B" },
  { key: "social", label: "Social", hint: "presenca, interacoes e rotina de canais", placeholder: "respostas diarias, monitoramento semanal", icon: MessageCircle, tone: "#10B981" },
  { key: "campaigns", label: "Campanhas", hint: "acoes pontuais, lancamentos e ofertas", placeholder: "1 campanha mensal + desdobramentos", icon: Megaphone, tone: "#EC4899" },
  { key: "landingPages", label: "Landing pages", hint: "paginas de captacao, eventos e conversao", placeholder: "1 landing por campanha principal", icon: Globe2, tone: "#06B6D4" },
];

const emptyScope: OperationalScope = {
  content: { enabled: false, volume: "" },
  traffic: { enabled: false, volume: "" },
  design: { enabled: false, volume: "" },
  social: { enabled: false, volume: "" },
  campaigns: { enabled: false, volume: "" },
  landingPages: { enabled: false, volume: "" },
};

function normalizeScope(value: unknown): OperationalScope {
  if (!value || typeof value !== "object") return emptyScope;
  const source = value as Partial<Record<ScopeKey, Partial<{ enabled: boolean; volume: string }>>>;
  return scopeModules.reduce((acc, item) => {
    acc[item.key] = {
      enabled: Boolean(source[item.key]?.enabled),
      volume: source[item.key]?.volume ?? "",
    };
    return acc;
  }, { ...emptyScope } as OperationalScope);
}

export function ClientForm({ initial, onSuccess, onCancel, clientId }: ClientFormProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [primaryContact, setPrimaryContact] = useState(initial?.primaryContact ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [instagram, setInstagram] = useState(initial?.instagram ?? "");
  const [operationType, setOperationType] = useState(initial?.operationType ?? "");
  const [operationalScope, setOperationalScope] = useState<OperationalScope>(() => normalizeScope(initial?.operationalScope));
  const [operationalFrequency, setOperationalFrequency] = useState(initial?.operationalFrequency ?? "");
  const [reviewDay, setReviewDay] = useState(initial?.reviewDay ?? "");
  const [expectedSla, setExpectedSla] = useState(initial?.expectedSla ?? "");
  const [meetingFrequency, setMeetingFrequency] = useState(initial?.meetingFrequency ?? "");
  const [approvalRoutine, setApprovalRoutine] = useState(initial?.approvalRoutine ?? "");
  const [operationalUrgency, setOperationalUrgency] = useState(initial?.operationalUrgency ?? "");
  const [strategicNotes, setStrategicNotes] = useState(initial?.strategicNotes ?? "");
  const [clientBehavior, setClientBehavior] = useState(initial?.clientBehavior ?? "");
  const [restrictions, setRestrictions] = useState(initial?.restrictions ?? "");
  const [importantLinks, setImportantLinks] = useState(initial?.importantLinks ?? "");
  const [linkDraft, setLinkDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const links = useMemo(() => importantLinks.split("\n").map((link) => link.trim()).filter(Boolean), [importantLinks]);
  const activeModules = scopeModules.filter((module) => operationalScope[module.key].enabled);
  const configuredModules = activeModules.filter((module) => operationalScope[module.key].volume.trim());
  const progress = Math.round(((step + 1) / 4) * 100);
  const operationName = brand || name || "Nova operacao";

  function updateScope(key: ScopeKey, patch: Partial<{ enabled: boolean; volume: string }>) {
    setOperationalScope((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function addLink() {
    if (!linkDraft.trim()) return;
    setImportantLinks((prev) => [prev, linkDraft.trim()].filter(Boolean).join("\n"));
    setLinkDraft("");
  }

  function removeLink(link: string) {
    setImportantLinks((prev) => prev.split("\n").filter((item) => item.trim() !== link).join("\n"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }

    setError("");
    setLoading(true);

    const url = clientId ? `/api/clients/${clientId}` : "/api/clients";
    const method = clientId ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        brand,
        email,
        phone,
        primaryContact,
        website,
        instagram,
        operationType,
        operationalScope,
        operationalFrequency,
        reviewDay,
        expectedSla,
        meetingFrequency,
        approvalRoutine,
        operationalUrgency,
        strategicNotes,
        clientBehavior,
        restrictions,
        importantLinks,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao salvar cliente");
      return;
    }

    onSuccess();
  }

  const steps = [
    { label: "Dados", icon: BadgeCheck, done: Boolean(name && (brand || primaryContact || phone)) },
    { label: "Escopo", icon: Layers3, done: activeModules.length > 0 },
    { label: "Ritmo", icon: Gauge, done: Boolean(reviewDay || expectedSla || meetingFrequency || operationalFrequency) },
    { label: "Contexto", icon: Sparkles, done: Boolean(strategicNotes || clientBehavior || restrictions || links.length) },
  ];

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="min-w-0 flex-1">
          <div style={{ maxWidth: 860, paddingInline: 28, paddingTop: 20, width: "100%" }}>
            <div className="mb-8">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--accent)" }}>
                    Setup operacional
                  </p>
                  <h2 className="mt-3 text-[20px] font-semibold leading-7" style={{ color: "var(--text-primary)" }}>
                    {operationName}
                  </h2>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Configure como a operacao realmente funciona antes de criar demandas.
                  </p>
                </div>
                <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--bg-elevated)" }}>
                  {progress}% pronto
                </span>
              </div>
              <div className="mt-6 h-px w-full" style={{ background: "rgba(148,163,184,0.14)" }}>
                <div style={{ width: `${progress}%`, height: 1, background: "var(--accent)", transition: "width 240ms var(--ease-enter)" }} />
              </div>
            </div>

            <StepRail steps={steps} current={step} onSelect={setStep} />

            <div className="mt-6">
            {step === 0 && (
              <SetupSection title="Dados basicos" description="Identidade e canais essenciais da conta.">
                <FieldGroup title="Identidade">
                  <Field label="Nome do cliente" value={name} onChange={setName} placeholder="Nome operacional" required />
                  <Field label="Marca" value={brand} onChange={setBrand} placeholder="Nome publico da marca" />
                </FieldGroup>
                <FieldGroup title="Contato">
                  <Field label="Responsavel" value={primaryContact} onChange={setPrimaryContact} placeholder="Contato principal" />
                  <Field label="WhatsApp" value={phone} onChange={setPhone} placeholder="(11) 99999-0000" />
                  <Field label="Email interno" type="email" value={email} onChange={setEmail} placeholder="contato@cliente.com" />
                </FieldGroup>
                <FieldGroup title="Canais">
                  <Field label="Instagram" value={instagram} onChange={setInstagram} placeholder="@cliente" />
                  <Field label="Site" value={website} onChange={setWebsite} placeholder="https://..." />
                </FieldGroup>
              </SetupSection>
            )}

            {step === 1 && (
              <SetupSection title="Estrutura operacional" description="Ative somente as frentes que existem para este cliente.">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {scopeModules.map((module) => (
                    <OperationalModule
                      key={module.key}
                      module={module}
                      active={operationalScope[module.key].enabled}
                      value={operationalScope[module.key].volume}
                      onToggle={(enabled) => updateScope(module.key, { enabled })}
                      onChange={(value) => updateScope(module.key, { volume: value })}
                    />
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SelectField label="Frequencia operacional" value={operationalFrequency} onChange={setOperationalFrequency} options={["Semanal", "Quinzenal", "Mensal", "Continuo"]} />
                  <Field label="Resumo do escopo" value={operationType} onChange={setOperationType} placeholder="Ex: Social + trafego" />
                </div>
              </SetupSection>
            )}

            {step === 2 && (
              <SetupSection title="Ritmo operacional" description="Cadencia esperada para revisao, reuniao e aprovacao.">
                <div className="grid grid-cols-1 gap-x-[18px] gap-y-5 md:grid-cols-2">
                  <SelectField label="Dia de revisao" value={reviewDay} onChange={setReviewDay} options={["Segunda", "Terca", "Quarta", "Quinta", "Sexta"]} />
                  <SelectField label="SLA esperado" value={expectedSla} onChange={setExpectedSla} options={["24h", "48h", "72h", "Sob demanda"]} />
                  <SelectField label="Frequencia de reunioes" value={meetingFrequency} onChange={setMeetingFrequency} options={["Semanal", "Quinzenal", "Mensal", "Sem ritual fixo"]} />
                  <SelectField label="Urgencia operacional" value={operationalUrgency} onChange={setOperationalUrgency} options={["Baixa", "Media", "Alta", "Critica"]} />
                </div>
                <TextAreaField label="Rotina de aprovacao" value={approvalRoutine} onChange={setApprovalRoutine} placeholder="Ex: cliente revisa quinta, aprova no WhatsApp" rows={4} />
              </SetupSection>
            )}

            {step === 3 && (
              <SetupSection title="Contexto interno" description="Memoria curta para reduzir atrito e retrabalho.">
                <TextAreaField label="Observacoes" value={strategicNotes} onChange={setStrategicNotes} placeholder="Contexto que muda a execucao" rows={3} />
                <div className="grid grid-cols-1 gap-x-[18px] gap-y-5 md:grid-cols-2">
                  <TextAreaField label="Comportamento do cliente" value={clientBehavior} onChange={setClientBehavior} placeholder="Como aprova, responde e decide" rows={3} />
                  <TextAreaField label="Restricoes e pontos de atencao" value={restrictions} onChange={setRestrictions} placeholder="O que evitar ou monitorar" rows={3} />
                </div>
                <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                  <label className="mb-2 block text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>Links importantes</label>
                  <div className="flex gap-2">
                    <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://..." className="h-11 flex-1 rounded-lg border px-3 text-sm outline-none" style={fieldStyle} />
                    <button type="button" onClick={addLink} className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
                      <Plus size={13} /> Adicionar
                    </button>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {links.map((link) => (
                      <button key={link} type="button" onClick={() => removeLink(link)} className="flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs" style={{ borderColor: "var(--border)", color: "var(--text-secondary)" }}>
                        <span className="truncate">{link}</span>
                        <Trash2 size={12} style={{ color: "var(--red)" }} />
                      </button>
                    ))}
                  </div>
                </div>
              </SetupSection>
            )}
            </div>
          </div>
        </div>

        <aside className="w-80 shrink-0 self-start rounded-2xl border p-5 sticky top-0" style={{ borderColor: "rgba(148,163,184,0.12)", background: "rgba(15,23,42,0.55)", boxShadow: "0 4px 24px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <Gauge size={14} />
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Operacao prevista</p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Resumo vivo do setup</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <SummaryBlock title="Frentes ativas" empty="Nenhuma frente ativada">
              {activeModules.map((module) => (
                <SummaryLine key={module.key} dot={module.tone} label={module.label} value={operationalScope[module.key].volume || "sem volume definido"} />
              ))}
            </SummaryBlock>

            <SummaryBlock title="Ritmo" empty="Ritmo ainda aberto">
              {operationalFrequency && <SummaryLine label="Frequencia" value={operationalFrequency} />}
              {reviewDay && <SummaryLine label="Revisao" value={reviewDay} />}
              {expectedSla && <SummaryLine label="SLA" value={expectedSla} />}
              {meetingFrequency && <SummaryLine label="Reuniao" value={meetingFrequency} />}
              {operationalUrgency && <SummaryLine label="Urgencia" value={operationalUrgency} />}
            </SummaryBlock>

            <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.028)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.10)" }}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>Leitura operacional</p>
              <p className="mt-2 text-xs leading-5" style={{ color: "var(--text-secondary)" }}>
                {configuredModules.length > 0
                  ? `${operationName} nasce com ${configuredModules.length} frente${configuredModules.length === 1 ? "" : "s"} configurada${configuredModules.length === 1 ? "" : "s"}.`
                  : "Defina o escopo para o sistema entender o ritmo desta conta."}
              </p>
            </div>
          </div>
        </aside>
      </div>

      {error && <p className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ color: "var(--accent-red)", background: "rgba(239,68,68,0.1)" }}>{error}</p>}

      <div className="mt-6 flex justify-end gap-3 border-t px-7 pt-5" style={{ borderColor: "rgba(148,163,184,0.12)" }}>
        {step === 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep((value) => value - 1)}>
            <ArrowLeft size={12} /> Voltar
          </Button>
        )}
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          {step < 3 ? <>Continuar <ArrowRight size={12} /></> : clientId ? "Salvar setup" : "Criar cliente"}
        </Button>
      </div>
    </form>
  );
}

const fieldStyle = {
  borderColor: "var(--border-strong)",
  background: "var(--bg-base)",
  color: "var(--text-primary)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45)",
};

function StepRail({ steps, current, onSelect }: { steps: Array<{ label: string; icon: React.ElementType; done: boolean }>; current: number; onSelect: (index: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const active = index === current;
        return (
          <button
            key={step.label}
            type="button"
            onClick={() => onSelect(index)}
            className="relative flex h-11 items-center gap-2 rounded-xl border px-3 text-left transition-all"
            style={{
              borderColor: active ? "rgba(124,58,237,0.38)" : "var(--border)",
              background: active ? "linear-gradient(180deg, var(--accent-soft), var(--bg-surface))" : "var(--bg-elevated)",
              boxShadow: active ? "0 14px 30px rgba(124,58,237,0.10)" : "none",
            }}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: active ? "var(--accent)" : "var(--bg-base)", color: active ? "white" : "var(--text-muted)" }}>
              {step.done && !active ? <Check size={14} /> : <Icon size={14} />}
            </span>
            <span>
              <span className="block text-xs font-bold" style={{ color: active ? "var(--accent)" : "var(--text-primary)" }}>{step.label}</span>
              <span className="block text-[10px]" style={{ color: "var(--text-muted)" }}>{step.done ? "configurado" : "pendente"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SetupSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="op-enter">
      <div className="mb-7">
        <h3 className="text-[18px] font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p className="mt-2 text-sm leading-5" style={{ color: "var(--text-muted)" }}>{description}</p>
      </div>
      <div className="flex flex-col gap-6">{children}</div>
    </section>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl px-6 py-5" style={{ background: "rgba(255,255,255,0.018)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.10)" }}>
      <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.10em]" style={{ color: "rgba(148,163,184,0.56)" }}>{title}</p>
      <div className="grid grid-cols-1 gap-x-[18px] gap-y-5 md:grid-cols-2">{children}</div>
    </div>
  );
}

function OperationalModule({
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
      className="rounded-2xl border p-5 transition-all"
      style={{
        borderColor: active ? `${module.tone}66` : "var(--border)",
        background: active ? `linear-gradient(180deg, ${module.tone}10, var(--bg-surface))` : "var(--bg-elevated)",
        boxShadow: active ? `0 16px 32px ${module.tone}12` : "none",
      }}
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: `${module.tone}18`, color: module.tone }}>
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{module.label}</p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{module.hint}</p>
            </div>
            <button
              type="button"
              onClick={() => onToggle(!active)}
              className="relative h-6 w-11 rounded-full transition-colors"
              style={{ background: active ? module.tone : "var(--border-strong)" }}
              aria-label={`Alternar ${module.label}`}
            >
              <span
                className="absolute top-1 h-4 w-4 rounded-full bg-white transition-transform"
                style={{ left: 4, transform: active ? "translateX(20px)" : "translateX(0)" }}
              />
            </button>
          </div>
          <div
            style={{
              maxHeight: active ? 82 : 0,
              opacity: active ? 1 : 0,
              overflow: "hidden",
              transition: "max-height 220ms var(--ease-enter), opacity 180ms var(--ease-enter)",
            }}
          >
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder={module.placeholder}
              rows={2}
              className="mt-5 w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none"
              style={fieldStyle}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; type?: string; required?: boolean }) {
  return (
    <label className="group block rounded-xl px-4 py-3" style={{ background: "rgba(15,23,42,0.34)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.14)" }}>
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "rgba(148,163,184,0.68)" }}>{label}</span>
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="block h-8 w-full bg-transparent text-sm leading-5 outline-none placeholder:text-[var(--text-muted)]" style={{ color: "var(--text-primary)" }} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block rounded-xl px-4 py-3" style={{ background: "rgba(15,23,42,0.34)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.14)" }}>
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "rgba(148,163,184,0.68)" }}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="block h-8 w-full bg-transparent text-sm outline-none" style={{ color: "var(--text-primary)" }}>
        <option value="">Selecionar</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TextAreaField({ label, value, onChange, placeholder, rows }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows: number }) {
  return (
    <label className="block rounded-xl px-4 py-3" style={{ background: "rgba(15,23,42,0.34)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.14)" }}>
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.06em]" style={{ color: "rgba(148,163,184,0.68)" }}>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={rows} className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" style={{ color: "var(--text-primary)" }} />
    </label>
  );
}

function SummaryBlock({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "rgba(148,163,184,0.68)" }}>{title}</p>
      <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.028)", boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.12)" }}>
        {hasContent ? <div className="space-y-2">{children}</div> : <p className="text-xs" style={{ color: "var(--text-muted)" }}>{empty}</p>}
      </div>
    </div>
  );
}

function SummaryLine({ label, value, dot = "var(--accent)" }: { label: string; value: string; dot?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
      <div className="min-w-0">
        <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
        <p className="truncate text-xs" style={{ color: "var(--text-muted)" }}>{value}</p>
      </div>
    </div>
  );
}
