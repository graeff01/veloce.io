"use client";

import { useState } from "react";
import { Loader2, Check } from "lucide-react";

/* ─── Módulos selecionáveis (Operação e Perfil são sempre fixas) ─────────── */
const MODULES: { key: string; label: string; desc: string }[] = [
  { key: "reunioes",     label: "Reuniões",     desc: "Atas e alinhamentos" },
  { key: "leads",        label: "WhatsApp",     desc: "Conversas e leads" },
  { key: "anuncios",     label: "Anúncios (Meta)", desc: "Facebook / Instagram" },
  { key: "google",       label: "Google Ads",   desc: "Campanhas no Google" },
  { key: "ia",           label: "IA",           desc: "Agente de atendimento" },
  { key: "bot",          label: "BOT",          desc: "Portal e alertas" },
];
// Google entra desligado por padrão (só quando o cliente roda Google).
const DEFAULT_MODULE_KEYS = ["reunioes", "leads", "anuncios", "ia", "bot"];

/* ─── Types ─────────────────────────────────────────────── */

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
    niche?: string;
    mainGoal?: string;
    operationType?: string;
    operationalFrequency?: string;
    reviewDay?: string;
    expectedSla?: string;
    meetingFrequency?: string;
    operationalUrgency?: string;
    approvalRoutine?: string;
    strategicNotes?: string;
    clientBehavior?: string;
    restrictions?: string;
    importantLinks?: string;
    contractStart?: string | Date | null;
    communicationTone?: string;
    preferences?: string;
    deliverables?: unknown[];
    operationalScope?: unknown;
    modules?: string[];
  };
  onSuccess: () => void;
  onCancel: () => void;
  clientId?: string;
}

/* ─── Main component ─────────────────────────────────────── */
export function ClientForm({ initial, onSuccess, onCancel, clientId }: ClientFormProps) {
  const [name,           setName]           = useState(initial?.name ?? "");
  const [brand,          setBrand]          = useState(initial?.brand ?? "");
  const [email,          setEmail]          = useState(initial?.email ?? "");
  const [phone,          setPhone]          = useState(initial?.phone ?? "");
  const [primaryContact, setPrimaryContact] = useState(initial?.primaryContact ?? "");
  const [website,        setWebsite]        = useState(initial?.website ?? "");
  const [instagram,      setInstagram]      = useState(initial?.instagram ?? "");
  const [city,           setCity]           = useState(initial?.city ?? "");
  const [niche,          setNiche]          = useState(initial?.niche ?? "");
  const [mainGoal,       setMainGoal]       = useState(initial?.mainGoal ?? "");
  const [operationType,  setOperationType]  = useState(initial?.operationType ?? "");
  const [status]                            = useState<"ACTIVE" | "INACTIVE" | "PAUSED">("ACTIVE");
  // Novo cliente já vem com tudo ligado; edição respeita o que está salvo.
  const [modules, setModules] = useState<string[]>(initial?.modules ?? DEFAULT_MODULE_KEYS);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const toggleModule = (key: string) =>
    setModules((m) => (m.includes(key) ? m.filter((k) => k !== key) : [...m, key]));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const url    = clientId ? `/api/clients/${clientId}` : "/api/clients";
    const method = clientId ? "PUT" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, brand, email, phone, primaryContact,
        website, instagram, city, niche, mainGoal, operationType, modules,
        ...(clientId ? {} : { status }),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const d = await res.json().catch(() => null);
      setError(d?.error ?? "Erro ao salvar cliente");
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Body ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>
        <div style={{ maxWidth: 620, display: "flex", flexDirection: "column", gap: 30 }}>

          {/* Identidade */}
          <FieldGroup title="Identidade da conta">
            <Field label="Nome do cliente *" value={name}  onChange={setName}  placeholder="Nome operacional" required />
            <Field label="Marca"             value={brand} onChange={setBrand} placeholder="Nome público da marca" />
          </FieldGroup>

          {/* Módulos */}
          <div>
            <SectionHeader title="O que o cliente roda com a gente" />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px" }}>
              Operação e Perfil aparecem sempre. Marque só os módulos que esse cliente usa — as abas dele ficam limpas.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {MODULES.map((m) => {
                const on = modules.includes(m.key);
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => toggleModule(m.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 11, textAlign: "left",
                      padding: "11px 13px", borderRadius: 11, cursor: "pointer",
                      border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                      background: on ? "var(--accent-soft)" : "var(--bg-elevated)",
                      transition: "border-color .15s, background .15s",
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1.5px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                      background: on ? "var(--accent)" : "transparent",
                    }}>
                      {on && <Check size={13} color="#fff" strokeWidth={3} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: on ? "var(--accent)" : "var(--text-primary)" }}>{m.label}</span>
                      <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>{m.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contato */}
          <FieldGroup title="Contato principal">
            <Field label="Responsável"  value={primaryContact} onChange={setPrimaryContact} placeholder="Nome do contato" />
            <Field label="WhatsApp"     value={phone}          onChange={setPhone}           placeholder="(11) 99999-0000" />
            <Field label="E-mail"       value={email}          onChange={setEmail}           placeholder="contato@cliente.com" type="email" />
            <Field label="Cidade"       value={city}           onChange={setCity}            placeholder="São Paulo, SP" />
          </FieldGroup>

          {/* Canais */}
          <FieldGroup title="Canais digitais">
            <Field label="Instagram" value={instagram} onChange={setInstagram} placeholder="@cliente" />
            <Field label="Site"      value={website}   onChange={setWebsite}   placeholder="https://..." />
          </FieldGroup>

          {/* Contexto */}
          <FieldGroup title="Contexto operacional">
            <Field label="Nicho / Segmento"  value={niche}         onChange={setNiche}         placeholder="Ex: Imobiliário, E-commerce" />
            <Field label="Tipo de operação"  value={operationType} onChange={setOperationType} placeholder="Ex: Social + Tráfego pago" />
            <Field label="Objetivo principal" value={mainGoal}     onChange={setMainGoal}      placeholder="Ex: Gerar leads qualificados no WhatsApp" full />
          </FieldGroup>

        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────── */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 32px", borderTop: "1px solid var(--border)",
          background: "var(--bg-surface)", flexShrink: 0, gap: 12,
        }}
      >
        {error && (
          <p style={{ fontSize: 12, color: "var(--red)", background: "var(--red-soft)", padding: "6px 12px", borderRadius: 8, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: "9px 18px", borderRadius: 9, border: "1px solid var(--border-strong)", background: "transparent", color: "var(--text-secondary)", fontSize: 13, fontWeight: 500, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            style={{
              padding: "9px 24px", borderRadius: 9, border: "none",
              background: "var(--accent)", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: loading || !name.trim() ? "not-allowed" : "pointer",
              opacity: loading || !name.trim() ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            {clientId ? "Salvar alterações" : "Criar cliente"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ─── Section header (divisor com título) ────────────────── */
function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", opacity: 0.75, whiteSpace: "nowrap" }}>
        {title}
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

/* ─── Field Group ────────────────────────────────────────── */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionHeader title={title} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Field ──────────────────────────────────────────────── */
function Field({
  label, value, onChange, placeholder, type = "text", required, full,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; required?: boolean; full?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: full ? "1 / -1" : undefined }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
        style={{
          height: 40, width: "100%", borderRadius: 9,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)", color: "var(--text-primary)",
          padding: "0 13px", fontSize: 13, outline: "none", boxSizing: "border-box",
          transition: "border-color .15s",
        }}
      />
    </div>
  );
}
