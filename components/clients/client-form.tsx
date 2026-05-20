"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ClientFormProps {
  initial?: {
    name: string;
    email?: string;
    phone?: string;
  };
  onSuccess: () => void;
  onCancel: () => void;
  clientId?: string;
}

export function ClientForm({ initial, onSuccess, onCancel, clientId }: ClientFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
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
      body: JSON.stringify({ name, email, phone }),
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
      <Input
        label="Nome do cliente *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex: Marca Alpha"
        required
      />
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="contato@cliente.com"
      />
      <Input
        label="Telefone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="(11) 99999-0000"
      />

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
