"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Input, Select, Textarea } from "@/components/ui/input";
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
    reviewDay?: string;
    expectedSla?: string;
    meetingFrequency?: string;
    approvalRoutine?: string;
    operationalUrgency?: string;
    importantLinks?: string;
    niche?: string;
    mainGoal?: string;
    contractStart?: string | Date | null;
    operationalFrequency?: string;
    strategicNotes?: string;
    communicationTone?: string;
    restrictions?: string;
    preferences?: string;
    clientBehavior?: string;
  };
  onSuccess: () => void;
  onCancel: () => void;
  clientId?: string;
}

const scopeLabels: Array<{ key: ScopeKey; label: string; hint: string }> = [
  { key: "content", label: "Conteudo", hint: "posts, reels, copys" },
  { key: "traffic", label: "Trafego", hint: "campanhas e otimizacao" },
  { key: "design", label: "Design", hint: "criativos e pecas" },
  { key: "social", label: "Social", hint: "rotina de redes" },
  { key: "campaigns", label: "Campanhas", hint: "acoes pontuais" },
  { key: "landingPages", label: "Landing pages", hint: "paginas e captacao" },
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
  return scopeLabels.reduce((acc, item) => {
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

  const steps = ["Dados", "Escopo", "Ritmo", "Contexto"];

  return (
    <form onSubmit={handleSubmit} className="flex min-h-[620px] flex-col">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-muted)" }}>
          Setup operacional
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className="h-9 rounded-lg border text-xs font-semibold"
              style={{
                borderColor: index <= step ? "rgba(124,58,237,0.45)" : "var(--border)",
                background: index === step ? "var(--accent-soft)" : "var(--bg-elevated)",
                color: index <= step ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {index < step ? <Check size={13} style={{ display: "inline", marginRight: 5 }} /> : null}
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1">
        {step === 0 && (
          <FormSection title="Dados basicos" description="Somente o que identifica a conta e os canais principais.">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Nome do cliente *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome operacional" required />
              <Input label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Nome publico da marca" />
              <Input label="Responsavel" value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} placeholder="Contato principal" />
              <Input label="WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
              <Input label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@cliente" />
              <Input label="Site" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
              <Input label="Email interno" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@cliente.com" />
            </div>
          </FormSection>
        )}

        {step === 1 && (
          <FormSection title="Estrutura operacional" description="Defina o escopo vivo do cliente. Depois ele pode ser ajustado livremente.">
            <div className="grid grid-cols-2 gap-3">
              {scopeLabels.map((item) => (
                <div key={item.key} className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={operationalScope[item.key].enabled}
                      onChange={(event) => updateScope(item.key, { enabled: event.target.checked })}
                      className="mt-1"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{item.label}</span>
                      <span className="block text-xs" style={{ color: "var(--text-muted)" }}>{item.hint}</span>
                    </span>
                  </label>
                  <input
                    value={operationalScope[item.key].volume}
                    onChange={(event) => updateScope(item.key, { volume: event.target.value })}
                    placeholder="Volume mensal ou regra"
                    className="mt-3 h-9 w-full rounded-lg border px-3 text-xs outline-none"
                    style={{ borderColor: "var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)" }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Select label="Frequencia operacional" value={operationalFrequency} onChange={(e) => setOperationalFrequency(e.target.value)}>
                <option value="">Selecionar</option>
                <option value="Semanal">Semanal</option>
                <option value="Quinzenal">Quinzenal</option>
                <option value="Mensal">Mensal</option>
                <option value="Continuo">Continuo</option>
              </Select>
              <Input label="Resumo do escopo" value={operationType} onChange={(e) => setOperationType(e.target.value)} placeholder="Ex: Social + trafego" />
            </div>
          </FormSection>
        )}

        {step === 2 && (
          <FormSection title="Ritmo operacional" description="Como a conta se move durante a semana.">
            <div className="grid grid-cols-2 gap-3">
              <Select label="Dia de revisao" value={reviewDay} onChange={(e) => setReviewDay(e.target.value)}>
                <option value="">Selecionar</option>
                {["Segunda", "Terca", "Quarta", "Quinta", "Sexta"].map((day) => <option key={day} value={day}>{day}</option>)}
              </Select>
              <Select label="SLA esperado" value={expectedSla} onChange={(e) => setExpectedSla(e.target.value)}>
                <option value="">Selecionar</option>
                <option value="24h">24h</option>
                <option value="48h">48h</option>
                <option value="72h">72h</option>
                <option value="Sob demanda">Sob demanda</option>
              </Select>
              <Select label="Frequencia de reunioes" value={meetingFrequency} onChange={(e) => setMeetingFrequency(e.target.value)}>
                <option value="">Selecionar</option>
                <option value="Semanal">Semanal</option>
                <option value="Quinzenal">Quinzenal</option>
                <option value="Mensal">Mensal</option>
                <option value="Sem ritual fixo">Sem ritual fixo</option>
              </Select>
              <Select label="Urgencia operacional" value={operationalUrgency} onChange={(e) => setOperationalUrgency(e.target.value)}>
                <option value="">Selecionar</option>
                <option value="Baixa">Baixa</option>
                <option value="Media">Media</option>
                <option value="Alta">Alta</option>
                <option value="Critica">Critica</option>
              </Select>
            </div>
            <Textarea label="Rotina de aprovacao" value={approvalRoutine} onChange={(e) => setApprovalRoutine(e.target.value)} placeholder="Ex: cliente revisa quinta, aprova no WhatsApp" rows={3} />
          </FormSection>
        )}

        {step === 3 && (
          <FormSection title="Contexto interno" description="Memoria operacional curta para evitar retrabalho.">
            <Textarea label="Observacoes" value={strategicNotes} onChange={(e) => setStrategicNotes(e.target.value)} placeholder="Contexto que muda a execucao" rows={2} />
            <div className="grid grid-cols-2 gap-3">
              <Textarea label="Comportamento do cliente" value={clientBehavior} onChange={(e) => setClientBehavior(e.target.value)} placeholder="Como aprova, responde e decide" rows={2} />
              <Textarea label="Restricoes e pontos de atencao" value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="O que evitar ou monitorar" rows={2} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Links importantes</label>
              <div className="flex gap-2">
                <input value={linkDraft} onChange={(event) => setLinkDraft(event.target.value)} placeholder="https://..." className="h-10 flex-1 rounded-lg border px-3 text-sm outline-none" style={{ borderColor: "var(--border-strong)", background: "var(--bg-base)", color: "var(--text-primary)" }} />
                <button type="button" onClick={addLink} className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-white" style={{ background: "var(--accent)" }}>
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
          </FormSection>
        )}
      </div>

      {error && <p className="mt-4 rounded-lg px-3 py-2 text-xs" style={{ color: "var(--accent-red)", background: "rgba(239,68,68,0.1)" }}>{error}</p>}

      <div className="mt-6 flex justify-end gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
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

function FormSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h3 style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>{title}</h3>
        <p style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)" }}>{description}</p>
      </div>
      {children}
    </section>
  );
}
