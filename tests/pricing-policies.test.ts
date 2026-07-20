import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote, type PricingRules } from "../lib/ai-agent/pricing";

const rules: PricingRules = {
  base: [
    { key: "trad", label: "Tradição", amount: 2200, montagem: 270 },
    { key: "gour", label: "Gourmet", amount: 2650, montagem: 300 },
  ],
  options: [{ key: "pizza", label: "Forno Pizza", amount: 600 }],
  policies: {
    assemblyDiscount: [{ minItems: 2, pct: 10 }, { minItems: 3, pct: 13 }],
    access: { stairPerFlight: 100, spiral: 200, elevator: 100 },
    cashDiscountPct: 8,
  },
};
const q = (sel: Parameters<typeof computeQuote>[1]) => { const r = computeQuote(rules, sel); if (!r.ok) throw new Error("unknown: " + r.unknownKeys.join(",")); return r.quote; };
const line = (quote: ReturnType<typeof q>, key: string) => quote.items.find((i) => i.key === key)?.amount;

test("montagem 1 item = valor cheio", () => {
  const quote = q({ base: ["trad"], montagem: true });
  assert.equal(line(quote, "montagem"), 270);
  assert.equal(quote.total, 2470);
});

test("montagem 2 itens = -10% na soma das montagens", () => {
  const quote = q({ base: ["trad", "gour"], montagem: true }); // 270+300=570 → -10% = 513
  assert.equal(line(quote, "montagem"), 513);
  assert.equal(quote.total, 2200 + 2650 + 513);
});

test("montagem por QUANTIDADE (trad x2) = 2 itens", () => {
  const quote = q({ base: ["trad"], quantities: { trad: 2 }, montagem: true }); // 270*2=540 → -10% = 486
  assert.equal(line(quote, "montagem"), 486);
});

test("montagem 3+ itens = -13% sobre TODAS as montagens", () => {
  const quote = q({ base: ["trad"], quantities: { trad: 3 }, montagem: true }); // 810 → -13% = 704.7
  assert.equal(line(quote, "montagem"), 704.7);
});

test("acesso: elevador fixo, caracol fixo, escada por lance", () => {
  assert.equal(line(q({ base: ["trad"], access: { elevator: true } }), "acesso"), 100);
  assert.equal(line(q({ base: ["trad"], access: { spiral: true, flights: 5 } }), "acesso"), 200); // caracol ignora nº de lances
  assert.equal(line(q({ base: ["trad"], access: { flights: 3 } }), "acesso"), 300); // 3 × 100
  assert.equal(line(q({ base: ["trad"], access: { flights: 0 } }), "acesso"), undefined); // térreo → nada
});

test("desconto à vista = 8% SÓ nos produtos (não montagem/acesso)", () => {
  const quote = q({ base: ["trad"], options: ["pizza"], montagem: true, access: { flights: 2 }, cash: true });
  // produtos = 2200+600 = 2800 → desconto -224
  assert.equal(line(quote, "desconto_vista"), -224);
  // total = 2800 + montagem 270 + acesso 200 - 224
  assert.equal(quote.total, 2800 + 270 + 200 - 224);
});

test("sem policies → montagem/acesso/cash ignorados (Boqueirão intacto)", () => {
  const noPol: PricingRules = { base: [{ key: "x", label: "X", amount: 100 }] };
  const quote = computeQuote(noPol, { base: ["x"], montagem: true, access: { elevator: true }, cash: true });
  assert.ok(quote.ok && quote.quote.total === 100);
});

// ── BLINDAGEM: casos-limite / entrada suja ───────────────────────────────────
// Regras auxiliares: produto SEM montagem, valor decimal, taxa %, tiers fora de ordem.
const rules2: PricingRules = {
  base: [
    { key: "churr", label: "Churrasqueira", amount: 2200, montagem: 270 },
    { key: "espeto", label: "Espeto", amount: 90 },              // SEM montagem
    { key: "dec", label: "Decimal", amount: 100.1, montagem: 100.1 },
  ],
  options: [{ key: "pizza", label: "Forno Pizza", amount: 600 }],
  fees: [{ key: "servico", label: "Serviço 5%", percent: 5 }],
  policies: {
    assemblyDiscount: [{ minItems: 3, pct: 13 }, { minItems: 2, pct: 10 }], // fora de ordem DE PROPÓSITO
    access: { stairPerFlight: 100, spiral: 200, elevator: 100 },
    cashDiscountPct: 8,
  },
};
const q2 = (sel: Parameters<typeof computeQuote>[1]) => { const r = computeQuote(rules2, sel); if (!r.ok) throw new Error("unknown: " + r.unknownKeys.join(",")); return r.quote; };
const line2 = (quote: ReturnType<typeof q2>, key: string) => quote.items.find((i) => i.key === key)?.amount;

test("quantidade suja: 0 e negativa viram 1; fracionária arredonda p/ baixo", () => {
  assert.equal(line2(q2({ base: ["churr"], quantities: { churr: 0 }, montagem: true }), "montagem"), 270);   // 1 item
  assert.equal(line2(q2({ base: ["churr"], quantities: { churr: -5 }, montagem: true }), "montagem"), 270);  // 1 item
  assert.equal(line2(q2({ base: ["churr"], quantities: { churr: 2.9 }, montagem: true }), "montagem"), 486); // 2 itens: 540 -10%
});

test("produto SEM montagem + montagem:true → não gera linha de montagem", () => {
  const quote = q2({ base: ["espeto"], fees: [], montagem: true });
  assert.equal(line2(quote, "montagem"), undefined);
  assert.equal(quote.total, 90);
});

test("tiers de desconto fora de ordem resolvem igual (pega o mais alto elegível)", () => {
  assert.equal(line2(q2({ base: ["churr"], quantities: { churr: 3 }, montagem: true }), "montagem"), 704.7); // 810 -13%
  assert.equal(line2(q2({ base: ["churr"], quantities: { churr: 2 }, montagem: true }), "montagem"), 486);   // 540 -10%
});

test("assemblyDiscount vazio → montagem cheia (sem desconto)", () => {
  const noTier: PricingRules = { ...rules2, policies: { ...rules2.policies!, assemblyDiscount: [] } };
  const r = computeQuote(noTier, { base: ["churr"], quantities: { churr: 3 }, montagem: true });
  assert.ok(r.ok && r.quote.items.find((i) => i.key === "montagem")?.amount === 810);
});

test("acesso: prioridade elevador > caracol > escada quando vários flags", () => {
  assert.equal(line2(q2({ base: ["churr"], access: { elevator: true, spiral: true, flights: 5 } }), "acesso"), 100); // elevador
  assert.equal(line2(q2({ base: ["churr"], access: { spiral: true, flights: 5 } }), "acesso"), 200);                 // caracol
  assert.equal(line2(q2({ base: ["churr"], access: { flights: -2 } }), "acesso"), undefined);                        // negativo → nada
});

test("acesso ignorado quando policies.access não existe", () => {
  const noAccess: PricingRules = { base: rules2.base, policies: { cashDiscountPct: 8 } };
  const r = computeQuote(noAccess, { base: ["churr"], access: { elevator: true } });
  assert.ok(r.ok && r.quote.items.every((i) => i.key !== "acesso"));
});

test("cashDiscountPct 0/ausente → sem linha de desconto", () => {
  const zero: PricingRules = { ...rules2, policies: { ...rules2.policies!, cashDiscountPct: 0 } };
  assert.equal(computeQuote(zero, { base: ["churr"], cash: true }).ok && true, true);
  const r = computeQuote(zero, { base: ["churr"], cash: true });
  assert.ok(r.ok && r.quote.items.every((i) => i.key !== "desconto_vista"));
});

test("arredondamento a 2 casas em valor decimal (desconto à vista)", () => {
  // subtotal 100.10 → 8% = 8.008 → arredonda p/ 8.01
  assert.equal(line2(q2({ base: ["dec"], cash: true }), "desconto_vista"), -8.01);
});

test("taxa % e desconto à vista incidem SÓ nos produtos (montagem fora)", () => {
  const quote = q2({ base: ["churr"], options: ["pizza"], fees: ["servico"], montagem: true, cash: true });
  const prod = 2200 + 600; // 2800
  assert.equal(line2(quote, "servico"), round2Pct(prod, 5));   // 140
  assert.equal(line2(quote, "desconto_vista"), -round2Pct(prod, 8)); // -224
  assert.equal(quote.subtotal, prod); // montagem não entra no subtotal
});

function round2Pct(v: number, pct: number) { return Math.round(v * pct) / 100; }
