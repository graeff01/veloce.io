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

export interface PriceItemDef { key: string; label: string; amount: number; code?: string | null; montagem?: number }
export interface FeeDef { key: string; label: string; amount?: number; percent?: number; code?: string | null }
// Políticas de preço configuráveis por cliente (hoje: JR). Todas OPCIONAIS — sem
// elas, o motor calcula igual antes (Boqueirão etc. não muda).
export interface PricingPolicies {
  // Desconto na MONTAGEM por quantidade de itens: % sobre a SOMA das montagens.
  assemblyDiscount?: { minItems: number; pct: number }[]; // ex: [{minItems:2,pct:10},{minItems:3,pct:13}]
  // Acréscimo de ACESSO (montagem): escada tradicional por lance, caracol fixo, elevador fixo.
  access?: { stairPerFlight?: number; spiral?: number; elevator?: number };
  cashDiscountPct?: number;          // desconto à vista (dinheiro) SÓ nos produtos (base+opcionais)
  freightAssemblyThreshold?: number; // frete acima disso exige montagem (regra tratada no tools.ts)
}
// Frete FIXO por região/zona: a IA coleta o endereço, o motor escolhe a linha
// (determinístico). Resolução CIDADE-primeiro, depois ZONA (por bairro/apelido):
//  - city  = município canônico ("Porto Alegre"); agrupa as zonas da mesma cidade.
//  - zone  = rótulo da zona ("Zona Sul", "Extremo Sul", "Rural", "Central"); vazio = cidade toda.
//  - aliases = BAIRROS/apelidos que identificam a zona no endereço (auto-detecção),
//              ex.: ["zona sul","restinga","ipanema"]. É o que deixa a cotação sólida.
//  - code  = município IBGE (agrupa zonas e pinta o mapa). assembly = "required" quando
//            a entrega SÓ sai com montagem (reflete no rótulo).
// neighborhoods = BAIRROS que pertencem à zona (com coordenada p/ o pin no mapa). É o
// que a IA usa pra identificar a zona pelo endereço (só cadastrado onde há variação).
export interface FreightNeighborhood { name: string; lat?: number; lng?: number }
export interface FreightRegion { region: string; amount: number; city?: string; zone?: string; aliases?: string[]; neighborhoods?: FreightNeighborhood[]; code?: string | null; assembly?: "optional" | "required" }
export interface PricingRules {
  base?: PriceItemDef[];
  options?: PriceItemDef[];
  fees?: FeeDef[];
  freight?: FreightRegion[];    // frete fixo por região (resolvido pelo endereço)
  freightDefault?: number;      // fallback quando a região não bate (opcional)
  policies?: PricingPolicies;   // montagem/acesso/à vista (opcional; hoje só JR)
}

// Acesso coletado do lead (ficha) → acréscimo de montagem.
export interface AccessInfo { flights?: number; spiral?: boolean; elevator?: boolean }

// Seleção feita pela IA (só chaves — nunca valores).
export interface QuoteSelection {
  base: string[];
  options?: string[];
  fees?: string[]; // se omitido, aplica todas as fees configuradas
  quantities?: Record<string, number>;
  montagem?: boolean;    // inclui entrega + montagem (soma a montagem de cada produto, com desconto por qtd)
  access?: AccessInfo;   // acréscimo de acesso (escada/elevador)
  cash?: boolean;        // pagamento em dinheiro → desconto à vista nos produtos
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

  // subtotal = só PRODUTOS (base+opcionais). Montagem/acesso/frete NÃO entram no desconto à vista.
  const subtotal = round2(items.reduce((s, i) => s + i.amount, 0));
  const pol = rules.policies;
  const extras: QuoteLine[] = [];

  // ── MONTAGEM (por produto, com desconto por quantidade de itens) ──────────────
  if (sel.montagem && pol) {
    const baseSel = (sel.base ?? []).map((k) => baseMap.get(k)!).filter(Boolean);
    const gross = baseSel.reduce((s, def) => s + (def.montagem ?? 0) * qty(def.key), 0);
    const itemCount = baseSel.reduce((s, def) => s + qty(def.key), 0);
    if (gross > 0) {
      const tier = [...(pol.assemblyDiscount ?? [])].filter((t) => itemCount >= t.minItems).sort((a, b) => b.minItems - a.minItems)[0];
      const pct = tier?.pct ?? 0;
      const amount = round2(gross * (1 - pct / 100));
      extras.push({ key: "montagem", code: null, label: `Entrega + Montagem${pct ? ` (${pct}% de desconto p/ ${itemCount} itens)` : ""}`, qty: 1, unit: amount, amount });
    }
  }

  // ── ACESSO (escada tradicional por lance / caracol fixo / elevador fixo) ──────
  if (sel.access && pol?.access) {
    const a = sel.access, ac = pol.access;
    let val = 0, label = "";
    if (a.elevator) { val = ac.elevator ?? 0; label = "Acesso (elevador)"; }
    else if (a.spiral) { val = ac.spiral ?? 0; label = "Acesso (escada caracol)"; }
    else if (a.flights && a.flights > 0) { val = round2((ac.stairPerFlight ?? 0) * a.flights); label = `Acesso (escada, ${a.flights} ${a.flights === 1 ? "lance" : "lances"})`; }
    if (val > 0) extras.push({ key: "acesso", code: null, label, qty: 1, unit: val, amount: val });
  }

  // Fees configuradas (percentual incide sobre os produtos).
  for (const k of feeKeys) {
    const f = feeMap.get(k)!;
    const value = f.amount != null ? f.amount : f.percent != null ? (subtotal * f.percent) / 100 : 0;
    extras.push({ key: f.key, code: f.code ?? null, label: f.label, qty: 1, unit: round2(value), amount: round2(value) });
  }

  // ── DESCONTO À VISTA (dinheiro) — SÓ nos produtos ─────────────────────────────
  if (sel.cash && pol?.cashDiscountPct) {
    const d = round2(-(subtotal * pol.cashDiscountPct) / 100);
    if (d < 0) extras.push({ key: "desconto_vista", code: null, label: `Desconto à vista (${pol.cashDiscountPct}%)`, qty: 1, unit: d, amount: d });
  }

  items.push(...extras);
  const fees = round2(extras.reduce((s, i) => s + i.amount, 0));
  return { ok: true, quote: { items, subtotal, fees, total: round2(subtotal + fees) } };
}

// ── Frete determinístico por região ───────────────────────────────────────────
// Normaliza texto (minúsculo, sem acento, pontuação→espaço, espaços colapsados) para
// casar região no endereço coletado.
const normText = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
// Casamento por PALAVRA (não substring cru): evita falso-positivo como "sul" dentro de
// "insulina" ou "feliz" dentro de "felizmente". needle e haystack já normalizados.
const wordHit = (haystack: string, needle: string) => !!needle && (" " + haystack + " ").includes(" " + needle + " ");

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

  // 1) BAIRRO/apelido bate → zona identificada (sinal mais forte). Desempata pelo termo
  //    mais específico (mais longo) que casou, p/ não confundir zonas vizinhas.
  let bestKw = "", bestHit: FreightRegion | null = null;
  for (const f of list) {
    const kws = [...(f.aliases ?? []), ...((f.neighborhoods ?? []).map((n) => n.name))];
    for (const kw of kws) {
      const n = normText(kw);
      if (n && n.length > bestKw.length && wordHit(a, n)) { bestKw = n; bestHit = f; }
    }
  }
  if (bestHit) return resolvedLine(bestHit);

  // 2) Sem bairro reconhecido: casa a CIDADE pelo nome-base (o match mais específico ganha).
  const cityHits = list.filter((f) => wordHit(a, normText(baseCityName(f))));
  if (!cityHits.length) return rules.freightDefault != null ? { label: "Frete", amount: round2(rules.freightDefault) } : { unmatched: true };
  const target = cityHits.reduce((best, f) => (normText(baseCityName(f)).length > normText(baseCityName(best)).length ? f : best));
  const key = cityKeyOf(target);
  const zones = list.filter((f) => cityKeyOf(f) === key);
  if (zones.length === 1) return resolvedLine(zones[0]);

  // Rótulo da zona digitado ("zona sul", "extremo sul"), ESCOPADO à cidade identificada
  // (evita "central" de uma cidade colidir com o de outra).
  const zoneHit = zones.filter((z) => z.zone && wordHit(a, normText(z.zone)));
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
  const freight = rules.freight?.length ? describeFreightNote(rules.freight) : "";
  return [line(rules.base, "BASE (obrigatório escolher)"), line(rules.options, "OPCIONAIS"), line(rules.fees, "TAXAS"), freight].filter(Boolean).join("\n");
}

// Nota de frete p/ o prompt: instrui a IA a coletar a cidade e, NAS cidades com várias
// zonas, PERGUNTAR o bairro/região antes de orçar (é o que faz a auto-detecção render).
export function describeFreightNote(freight: FreightRegion[]): string {
  const byCity = new Map<string, Set<string>>();
  for (const f of freight) {
    const c = f.city || baseCityName(f);
    const set = byCity.get(c) ?? new Set<string>();
    set.add(f.zone || "");
    byCity.set(c, set);
  }
  const multi = [...byCity.entries()].filter(([, zs]) => zs.size > 1).map(([c]) => c);
  const base = `FRETE: calculado AUTOMATICAMENTE pela cidade de entrega (${freight.length} regiões atendidas). NÃO escolha o frete — só garanta que coletou a cidade.`;
  if (!multi.length) return base;
  const ex = multi.slice(0, 10).join(", ");
  return `${base}\nATENÇÃO — estas cidades têm ZONAS com fretes diferentes: ${ex}${multi.length > 10 ? ` (e +${multi.length - 10})` : ""}. Se o lead for de uma delas, PERGUNTE o bairro/região dele (ex.: "Você é de Porto Alegre? De qual bairro/região?") e registre na ficha ANTES de orçar — assim o frete sai certo.`;
}
