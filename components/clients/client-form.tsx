"use client";

import { useState } from "react";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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

export function ClientForm({ initial, onSuccess, onCancel, clientId }: ClientFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [primaryContact, setPrimaryContact] = useState(initial?.primaryContact ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [instagram, setInstagram] = useState(initial?.instagram ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [operationType, setOperationType] = useState(initial?.operationType ?? "");
  const [niche, setNiche] = useState(initial?.niche ?? "");
  const [mainGoal, setMainGoal] = useState(initial?.mainGoal ?? "");
  const [contractStart, setContractStart] = useState(initial?.contractStart ? new Date(initial.contractStart).toISOString().slice(0, 10) : "");
  const [operationalFrequency, setOperationalFrequency] = useState(initial?.operationalFrequency ?? "");
  const [strategicNotes, setStrategicNotes] = useState(initial?.strategicNotes ?? "");
  const [communicationTone, setCommunicationTone] = useState(initial?.communicationTone ?? "");
  const [restrictions, setRestrictions] = useState(initial?.restrictions ?? "");
  const [preferences, setPreferences] = useState(initial?.preferences ?? "");
  const [clientBehavior, setClientBehavior] = useState(initial?.clientBehavior ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        city,
        operationType,
        niche,
        mainGoal,
        contractStart,
        operationalFrequency,
        strategicNotes,
        communicationTone,
        restrictions,
        preferences,
        clientBehavior,
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormSection title="Dados basicos">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nome do cliente *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Marca Alpha" required />
          <Input label="Marca" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex: Alpha Studio" />
          <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="contato@cliente.com" />
          <Input label="Telefone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
          <Input label="Responsavel principal" value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} placeholder="Nome do contato" />
          <Input label="Cidade" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Sao Paulo" />
          <Input label="Site" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          <Input label="Instagram" value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@cliente" />
        </div>
      </FormSection>

      <FormSection title="Dados operacionais">
        <div className="grid grid-cols-2 gap-3">
          <Select label="Tipo de operacao" value={operationType} onChange={(e) => setOperationType(e.target.value)}>
            <option value="">Selecionar</option>
            <option value="Social Media">Social Media</option>
            <option value="Performance">Performance</option>
            <option value="Conteudo e Performance">Conteudo e Performance</option>
            <option value="Institucional">Institucional</option>
            <option value="Lancamento">Lancamento</option>
          </Select>
          <Input label="Nicho" value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Imobiliario, varejo, saude..." />
          <Input label="Objetivo principal" value={mainGoal} onChange={(e) => setMainGoal(e.target.value)} placeholder="Gerar leads, autoridade..." />
          <Input label="Inicio do contrato" type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} />
          <Select label="Frequencia operacional" value={operationalFrequency} onChange={(e) => setOperationalFrequency(e.target.value)}>
            <option value="">Selecionar</option>
            <option value="Semanal">Semanal</option>
            <option value="Quinzenal">Quinzenal</option>
            <option value="Mensal">Mensal</option>
            <option value="Continuo">Continuo</option>
          </Select>
          <Select label="Tom de comunicacao" value={communicationTone} onChange={(e) => setCommunicationTone(e.target.value)}>
            <option value="">Selecionar</option>
            <option value="Premium e direto">Premium e direto</option>
            <option value="Institucional">Institucional</option>
            <option value="Educativo">Educativo</option>
            <option value="Comercial agressivo">Comercial agressivo</option>
            <option value="Leve e humano">Leve e humano</option>
          </Select>
        </div>
      </FormSection>

      <FormSection title="Contexto interno">
        <Textarea label="Observacoes estrategicas" value={strategicNotes} onChange={(e) => setStrategicNotes(e.target.value)} placeholder="Contexto que muda a execucao..." rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <Textarea label="Restricoes" value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="O que evitar" rows={2} />
          <Textarea label="Preferencias" value={preferences} onChange={(e) => setPreferences(e.target.value)} placeholder="Canais, formatos, rituais" rows={2} />
        </div>
        <Textarea label="Comportamento do cliente" value={clientBehavior} onChange={(e) => setClientBehavior(e.target.value)} placeholder="Ex: demora aprovacoes, prefere WhatsApp..." rows={2} />
      </FormSection>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--accent-red)", background: "rgba(239,68,68,0.1)" }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          {clientId ? "Salvar alterações" : "Criar cliente"}
        </Button>
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}
