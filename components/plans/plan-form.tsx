"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DELIVERABLE_DEFAULTS } from "@/lib/deliverable-defaults";

interface PlanItem {
  id?: string;
  type: string;
  quantity: number;
  description?: string;
  deadlineDayOfMonth?: number | null;
  defaultPriority?: string;
  checklistItems?: string[];
}

interface PlanFormProps {
  plan?: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    frequency?: string;
    intensity?: string;
    averageDeadlineDays?: number | null;
    reviewDays?: number | null;
    demandLimit?: number | null;
    items: PlanItem[];
  };
  onSuccess: () => void;
  onCancel: () => void;
}

export function PlanForm({ plan, onSuccess, onCancel }: PlanFormProps) {
  const [name, setName] = useState(plan?.name ?? "");
  const [description, setDescription] = useState(plan?.description ?? "");
  const [category, setCategory] = useState(plan?.category ?? "");
  const [frequency, setFrequency] = useState(plan?.frequency ?? "");
  const [intensity, setIntensity] = useState(plan?.intensity ?? "");
  const [averageDeadlineDays, setAverageDeadlineDays] = useState(plan?.averageDeadlineDays?.toString() ?? "");
  const [reviewDays, setReviewDays] = useState(plan?.reviewDays?.toString() ?? "");
  const [demandLimit, setDemandLimit] = useState(plan?.demandLimit?.toString() ?? "");
  const [items, setItems] = useState<PlanItem[]>(
    plan?.items ?? [{ type: "", quantity: 1, checklistItems: [] }]
  );
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function addItem() {
    setItems((prev) => [...prev, { type: "", quantity: 1, checklistItems: [] }]);
  }

  function removeItem(idx: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof PlanItem, value: string | number | string[] | null | undefined) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Nome é obrigatório"); return; }
    if (items.some((i) => !i.type.trim())) { setError("Todos os tipos são obrigatórios"); return; }
    setError("");
    setLoading(true);

    const url = plan ? `/api/plans/${plan.id}` : "/api/plans";
    const method = plan ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        category,
        frequency,
        intensity,
        averageDeadlineDays: averageDeadlineDays ? Number(averageDeadlineDays) : undefined,
        reviewDays: reviewDays ? Number(reviewDays) : undefined,
        demandLimit: demandLimit ? Number(demandLimit) : undefined,
        items,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Erro ao salvar template");
      return;
    }

    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input
        label="Nome do template *"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Ex: Social + trafego"
        required
      />

      <Textarea
        label="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Quando este template deve ser usado..."
        rows={2}
      />

      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Categoria operacional
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
            <option value="">Selecionar</option>
            <option value="Performance">Performance</option>
            <option value="Conteudo">Conteudo</option>
            <option value="Social">Social</option>
            <option value="Institucional">Institucional</option>
            <option value="Lancamento">Lancamento</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Frequencia
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
            <option value="">Selecionar</option>
            <option value="Semanal">Semanal</option>
            <option value="Mensal">Mensal</option>
            <option value="Continuo">Continuo</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Intensidade
          <select value={intensity} onChange={(e) => setIntensity(e.target.value)} className="h-10 rounded-lg border px-3 text-sm outline-none" style={{ borderColor: "var(--border)", background: "var(--bg-surface)", color: "var(--text-primary)" }}>
            <option value="">Selecionar</option>
            <option value="Baixa">Baixa</option>
            <option value="Media">Media</option>
            <option value="Alta">Alta</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input label="Prazo medio" type="number" min={0} value={averageDeadlineDays} onChange={(e) => setAverageDeadlineDays(e.target.value)} placeholder="dias" />
        <Input label="Dias de revisao" type="number" min={0} value={reviewDays} onChange={(e) => setReviewDays(e.target.value)} placeholder="dias" />
        <Input label="Limite de demandas" type="number" min={0} value={demandLimit} onChange={(e) => setDemandLimit(e.target.value)} placeholder="mensal" />
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Frentes operacionais *
          </label>
          <button
            type="button"
            onClick={addItem}
            className="text-xs flex items-center gap-1 hover:opacity-80"
            style={{ color: "var(--accent-blue)" }}
          >
            <Plus size={11} /> Adicionar
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {items.map((item, idx) => {
            const defs = DELIVERABLE_DEFAULTS[item.type] ?? {};
            const isExpanded = expandedItem === idx;
            return (
              <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                {/* Row principal */}
                <div className="flex items-center gap-2" style={{ padding: "8px 10px", background: "var(--bg-elevated)" }}>
                  <input
                    value={item.type}
                    onChange={(e) => updateItem(idx, "type", e.target.value)}
                    placeholder="Tipo (ex: Post Feed)"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs border focus:outline-none focus:border-blue-500"
                    style={{ background: "var(--bg-base)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={item.quantity}
                    onChange={(e) => updateItem(idx, "quantity", parseInt(e.target.value) || 1)}
                    className="w-14 px-2 py-1.5 rounded-lg text-xs border text-center focus:outline-none"
                    style={{ background: "var(--bg-base)", borderColor: "var(--border-strong)", color: "var(--text-primary)" }}
                  />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>x/mês</span>
                  <button
                    type="button"
                    onClick={() => setExpandedItem(isExpanded ? null : idx)}
                    title="Configurar prazo e checklist"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px 4px" }}
                  >
                    {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    disabled={items.length <= 1}
                    className="w-6 h-6 rounded flex items-center justify-center disabled:opacity-30"
                    style={{ color: "var(--accent-red)", background: "none", border: "none", cursor: "pointer" }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>

                {/* Campos expandidos */}
                {isExpanded && (
                  <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-base)", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Dia do mês para vencer
                        <input
                          type="number"
                          min={0}
                          max={31}
                          placeholder={`Padrão: dia ${defs.deadlineDayOfMonth ?? 15}`}
                          value={item.deadlineDayOfMonth ?? ""}
                          onChange={(e) => updateItem(idx, "deadlineDayOfMonth", e.target.value ? parseInt(e.target.value) : "")}
                          style={{ display: "block", width: "100%", marginTop: 5, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12, outline: "none" }}
                        />
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>0 = último dia do mês</span>
                      </label>
                      <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        Prioridade padrão
                        <select
                          value={item.defaultPriority ?? "NORMAL"}
                          onChange={(e) => updateItem(idx, "defaultPriority", e.target.value)}
                          style={{ display: "block", width: "100%", marginTop: 5, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12, outline: "none" }}
                        >
                          <option value="LOW">Baixa</option>
                          <option value="NORMAL">Normal</option>
                          <option value="HIGH">Alta</option>
                          <option value="CRITICAL">Crítica</option>
                        </select>
                      </label>
                    </div>
                    <label style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      Checklist padrão (um por linha)
                      <textarea
                        rows={3}
                        placeholder={defs.checklistItems ? defs.checklistItems.join("\n") : "Ex: Brief\nArte\nAprovação"}
                        value={(item.checklistItems ?? []).join("\n")}
                        onChange={(e) => updateItem(idx, "checklistItems", e.target.value.split("\n").filter(Boolean))}
                        style={{ display: "block", width: "100%", marginTop: 5, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", fontSize: 12, outline: "none", resize: "none", boxSizing: "border-box" }}
                      />
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        Deixe vazio para usar o padrão do tipo
                      </span>
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ color: "var(--accent-red)", background: "rgba(239,68,68,0.1)" }}>
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          {plan ? "Salvar alterações" : "Criar template"}
        </Button>
      </div>
    </form>
  );
}
