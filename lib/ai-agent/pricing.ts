// ── Motor de preço determinístico (F2) ───────────────────────────────────────
// A IA COLETA; este motor CALCULA. O preço NUNCA sai do modelo — sai daqui, a
// partir das regras cadastradas por cliente (PricingConfig.rules). Combinado com o
// grounding (F1), garante que nenhum valor é inventado: a IA só pode escolher itens
// que existem na tabela; qualquer chave deshecida vira erro (não um preço chutado).
//
// Formato das regras (por cliente):
// {
//   "base":    [{ "key": "modelo_x", "label": "Modelo X", "amount": 3500 }],
//   "options": [{ "key": "tampa",    "label": "Tampa de vidro", "amount": 450 }],
//   "fees":    [{ "key": "frete",    "label": "Frete", "amount": 300 },
//               { "key": "instal",   "label": "Instalação", "percent": 10 }]
// }

export interface PriceItemDef { key: string; label: string; amount: number }
export interface FeeDef { key: string; label: string; amount?: number; percent?: number }
export interface PricingRules { base?: PriceItemDef[]; options?: PriceItemDef[]; fees?: FeeDef[] }

// Seleção feita pela IA (só chaves — nunca valores).
export interface QuoteSelection {
  base: string[];
  options?: string[];
  fees?: string[]; // se omitido, aplica todas as fees configuradas
  quantities?: Record<string, number>;
}

export interface QuoteLine { key: string; label: string; qty: number; unit: number; amount: number }
export interface ComputedQuote {
  items: QuoteLine[];
  subtotal: number;
  fees: number;
  total: number;
}
export type PricingResult = { ok: true; quote: ComputedQuote } | { ok: false; unknownKeys: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeQuote(rules: PricingRules, sel: QuoteSelection): PricingResult {
  const baseMap = new Map((rules.base ?? []).map((i) => [i.key, i]));
  const optMap = new Map((rules.options ?? []).map((i) => [i.key, i]));
  const feeMap = new Map((rules.fees ?? []).map((f) => [f.key, f]));
  const qty = (k: string) => Math.max(1, Math.floor(sel.quantities?.[k] ?? 1));

  const unknownKeys: string[] = [];
  const items: QuoteLine[] = [];

  for (const k of sel.base ?? []) {
    const def = baseMap.get(k);
    if (!def) { unknownKeys.push(k); continue; }
    const q = qty(k);
    items.push({ key: def.key, label: def.label, qty: q, unit: def.amount, amount: round2(def.amount * q) });
  }
  for (const k of sel.options ?? []) {
    const def = optMap.get(k);
    if (!def) { unknownKeys.push(k); continue; }
    const q = qty(k);
    items.push({ key: def.key, label: def.label, qty: q, unit: def.amount, amount: round2(def.amount * q) });
  }

  // Chave de fee inválida também é erro (não silenciar).
  const feeKeys = sel.fees ?? [...feeMap.keys()];
  for (const k of feeKeys) if (!feeMap.has(k)) unknownKeys.push(k);

  if (unknownKeys.length) return { ok: false, unknownKeys };

  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));

  let fees = 0;
  for (const k of feeKeys) {
    const f = feeMap.get(k)!;
    const value = f.amount != null ? f.amount : f.percent != null ? (subtotal * f.percent) / 100 : 0;
    fees = round2(fees + value);
    items.push({ key: f.key, label: f.label, qty: 1, unit: round2(value), amount: round2(value) });
  }

  return { ok: true, quote: { items, subtotal, fees, total: round2(subtotal + fees) } };
}

// Catálogo legível (para a IA saber quais chaves existem, sem inventar).
export function describeRules(rules: PricingRules): string {
  const line = (arr: { key: string; label: string; amount?: number; percent?: number }[] | undefined, titulo: string) =>
    arr && arr.length
      ? `${titulo}:\n${arr.map((i) => `  - ${i.key}: ${i.label}${i.amount != null ? ` (R$ ${i.amount})` : i.percent != null ? ` (${i.percent}%)` : ""}`).join("\n")}`
      : "";
  return [line(rules.base, "BASE (obrigatório escolher)"), line(rules.options, "OPCIONAIS"), line(rules.fees, "TAXAS")].filter(Boolean).join("\n");
}
