"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

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
  const [status,         setStatus]         = useState<"ACTIVE" | "INACTIVE" | "PAUSED">("ACTIVE");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

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
        website, instagram, city, niche, mainGoal, operationType,
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
        <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Identidade */}
          <FieldGroup title="Identidade da conta">
            <Field label="Nome do cliente *" value={name}  onChange={setName}  placeholder="Nome operacional" required />
            <Field label="Marca"             value={brand} onChange={setBrand} placeholder="Nome público da marca" />
          </FieldGroup>

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
            <Field label="Objetivo principal" value={mainGoal}      onChange={setMainGoal}      placeholder="Ex: Gerar leads qualificados" />
            <Field label="Tipo de operação"   value={operationType} onChange={setOperationType} placeholder="Ex: Social + Tráfego pago" />
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
            style={{ padding: "8px 18px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "8px 22px", borderRadius: 9, border: "none",
              background: "var(--accent)", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            {loading && <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />}
            {clientId ? "Salvar" : "Criar cliente"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ─── Field Group ────────────────────────────────────────── */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", opacity: 0.7, whiteSpace: "nowrap" }}>
          {title}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
        {children}
      </div>
    </div>
  );
}

/* ─── Field ──────────────────────────────────────────────── */
function Field({
  label, value, onChange, placeholder, type = "text", required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; type?: string; required?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </label>
      <input
        required={required}
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          height: 38, width: "100%", borderRadius: 9,
          border: "1px solid var(--border-strong)",
          background: "var(--bg-elevated)", color: "var(--text-primary)",
          padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _ChevronDown = ChevronDown; // keep import live for future selects
