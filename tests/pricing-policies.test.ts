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
