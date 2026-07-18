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

export interface PriceItemDef { key: string; label: string; amount: number; code?: string | null }
export interface FeeDef { key: string; label: string; amount?: number; percent?: number; code?: string | null }
// Frete FIXO por região/zona: a IA coleta o endereço, o motor escolhe a linha
// (determinístico). Resolução CIDADE-primeiro, depois ZONA (por bairro/apelido):
//  - city  = município canônico ("Porto Alegre"); agrupa as zonas da mesma cidade.
//  - zone  = rótulo da zona ("Zona Sul", "Extremo Sul", "Rural", "Central"); vazio = cidade toda.
//  - aliases = BAIRROS/apelidos que identificam a zona no endereço (auto-detecção),
//              ex.: ["zona sul","restinga","ipanema"]. É o que deixa a cotação sólida.
//  - code  = município IBGE (agrupa zonas e pinta o mapa). assembly = "required" quando
//            a entrega SÓ sai com montagem (reflete no rótulo).
export interface FreightRegion { region: string; amount: number; city?: string; zone?: string; aliases?: string[]; code?: string | null; assembly?: "optional" | "required" }
export interface PricingRules {
  base?: PriceItemDef[];
  options?: PriceItemDef[];
  fees?: FeeDef[];
  freight?: FreightRegion[];    // frete fixo por região (resolvido pelo endereço)
  freightDefault?: number;      // fallback quando a região não bate (opcional)
}

// Seleção feita pela IA (só chaves — nunca valores).
export interface QuoteSelection {
  base: string[];
  options?: string[];
  fees?: string[]; // se omitido, aplica todas as fees configuradas
  quantities?: Record<string, number>;
}

export interface QuoteLine { key: string; label: string; qty: number; unit: number; amount: number; code?: string | null }
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
    items.push({ key: def.key, code: def.code ?? null, label: def.label, qty: q, unit: def.amount, amount: round2(def.amount * q) });
  }
  for (const k of sel.options ?? []) {
    const def = optMap.get(k);
    if (!def) { unknownKeys.push(k); continue; }
    const q = qty(k);
    items.push({ key: def.key, code: def.code ?? null, label: def.label, qty: q, unit: def.amount, amount: round2(def.amount * q) });
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
    items.push({ key: f.key, code: f.code ?? null, label: f.label, qty: 1, unit: round2(value), amount: round2(value) });
  }

  return { ok: true, quote: { items, subtotal, fees, total: round2(subtotal + fees) } };
}

// ── Frete determinístico por região ───────────────────────────────────────────
// Normaliza texto (minúsculo, sem acento) para casar região no endereço coletado.
const normText = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export type FreightZoneOption = { region: string; zone?: string; amount: number; assembly?: "optional" | "required" };
export type FreightResult =
  | { label: string; amount: number; code?: string | null }
  | { askZone: true; city: string; options: FreightZoneOption[] } // cidade tem várias zonas e nenhuma foi identificada
  | { unmatched: true }
  | null;

// Sufixos de zona no fim do nome ("Porto Alegre ZS" → cidade "Porto Alegre").
const ZONE_SUFFIX_RE = /\s+(?:zona\s+(?:sul|norte|leste|oeste|rural|central)|extremo\s+sul|z[snelro]|central|rural)$/i;
function baseCityName(f: FreightRegion): string {
  if (f.city) return f.city;
  return f.region.replace(ZONE_SUFFIX_RE, "").trim() || f.region;
}
// Chave do MUNICÍPIO: código IBGE quando houver (sólido), senão o nome-base normalizado.
function cityKeyOf(f: FreightRegion): string { return f.code || normText(baseCityName(f)); }

function resolvedLine(f: FreightRegion): { label: string; amount: number; code?: string | null } {
  const label = `Frete — ${f.region}${f.assembly === "required" ? " (entrega com montagem obrigatória)" : ""}`;
  return { label, amount: round2(f.amount), code: f.code ?? null };
}

// Resolve o frete a partir do endereço/cidade do lead. Determinístico e CIDADE-primeiro:
//  1) se um BAIRRO/apelido (alias) aparece no endereço → zona identificada direto;
//  2) senão, identifica a CIDADE pelo nome-base: 1 zona → usa; VÁRIAS → askZone (a IA
//     pergunta qual zona), nunca chuta.
// null = frete não configurado; unmatched = nada bateu (e sem freightDefault) → pedir/encaminhar.
export function resolveFreight(rules: PricingRules, address: string): FreightResult {
  const list = rules.freight ?? [];
  if (!list.length) return null;
  const a = normText(address);
  if (!a) return rules.freightDefault != null ? { label: "Frete", amount: round2(rules.freightDefault) } : { unmatched: true };

  // 1) Bairro/apelido bate → zona identificada (sinal mais forte). Desempata pelo alias
  //    mais específico (mais longo) que casou, p/ não confundir zonas vizinhas.
  let bestAlias = "", bestHit: FreightRegion | null = null;
  for (const f of list) {
    for (const al of f.aliases ?? []) {
      const n = normText(al);
      if (n && n.length > bestAlias.length && a.includes(n)) { bestAlias = n; bestHit = f; }
    }
  }
  if (bestHit) return resolvedLine(bestHit);

  // 2) Sem bairro reconhecido: casa a CIDADE pelo nome-base (o match mais específico ganha).
  const cityHits = list.filter((f) => { const n = normText(baseCityName(f)); return n && a.includes(n); });
  if (!cityHits.length) return rules.freightDefault != null ? { label: "Frete", amount: round2(rules.freightDefault) } : { unmatched: true };
  const target = cityHits.reduce((best, f) => (normText(baseCityName(f)).length > normText(baseCityName(best)).length ? f : best));
  const key = cityKeyOf(target);
  const zones = list.filter((f) => cityKeyOf(f) === key);
  if (zones.length === 1) return resolvedLine(zones[0]);

  // Rótulo da zona digitado ("zona sul", "extremo sul"), ESCOPADO à cidade identificada
  // (evita "central" de uma cidade colidir com o de outra).
  const zoneHit = zones.filter((z) => z.zone && a.includes(normText(z.zone)));
  if (zoneHit.length === 1) return resolvedLine(zoneHit[0]);

  // Várias zonas na cidade e nenhuma identificada → perguntar (não cobrar zona errada).
  return { askZone: true, city: baseCityName(target), options: zones.map((z) => ({ region: z.region, zone: z.zone, amount: round2(z.amount), assembly: z.assembly })) };
}

// Anexa uma linha de taxa já resolvida (ex.: frete) a um orçamento calculado.
export function appendFeeLine(quote: ComputedQuote, line: { label: string; amount: number; code?: string | null }): ComputedQuote {
  const amount = round2(line.amount);
  return {
    items: [...quote.items, { key: "frete", code: line.code ?? null, label: line.label, qty: 1, unit: amount, amount }],
    subtotal: quote.subtotal,
    fees: round2(quote.fees + amount),
    total: round2(quote.total + amount),
  };
}

// Catálogo legível (para a IA saber quais chaves existem, sem inventar).
export function describeRules(rules: PricingRules): string {
  const line = (arr: { key: string; label: string; amount?: number; percent?: number }[] | undefined, titulo: string) =>
    arr && arr.length
      ? `${titulo}:\n${arr.map((i) => `  - ${i.key}: ${i.label}${i.amount != null ? ` (R$ ${i.amount})` : i.percent != null ? ` (${i.percent}%)` : ""}`).join("\n")}`
      : "";
  // Frete NÃO é escolhido pela IA (é resolvido pela cidade em resolveFreight). Não
  // listamos as regiões aqui — só a nota — para não inflar o prompt com dezenas de linhas.
  const freight = rules.freight?.length
    ? `FRETE: calculado AUTOMATICAMENTE pela cidade de entrega (${rules.freight.length} regiões atendidas). NÃO escolher frete — só garanta que coletou a cidade.`
    : "";
  return [line(rules.base, "BASE (obrigatório escolher)"), line(rules.options, "OPCIONAIS"), line(rules.fees, "TAXAS"), freight].filter(Boolean).join("\n");
}
