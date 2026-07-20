import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote, resolveFreight, appendFeeLine, type PricingRules } from "../lib/ai-agent/pricing";

// ── Motor de preço: determinístico, nunca inventa valor ──

const rules: PricingRules = {
  base: [
    { key: "premoldada_120", label: "Pré-moldada 1,20m", amount: 3900 },
    { key: "alvenaria", label: "Alvenaria sob medida", amount: 5200 },
  ],
  options: [
    { key: "coifa", label: "Coifa inox", amount: 850 },
    { key: "bancada", label: "Bancada granito", amount: 1200 },
  ],
  fees: [
    { key: "montagem", label: "Instalação", amount: 600 },
    { key: "taxa10", label: "Serviço 10%", percent: 10 },
  ],
  freight: [
    { region: "Caxias do Sul", amount: 150, aliases: ["Caxias"] },
    { region: "Bento Gonçalves", amount: 200, aliases: ["Bento"] },
    { region: "Porto Alegre", amount: 350, aliases: ["POA"] },
  ],
};

test("computeQuote soma base + opcionais e aplica fees (valor e %)", () => {
  const r = computeQuote(rules, { base: ["premoldada_120"], options: ["coifa"] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  // subtotal = 3900 + 850 = 4750; fees = 600 + 10% de 4750 (475) = 1075; total = 5825
  assert.equal(r.quote.subtotal, 4750);
  assert.equal(r.quote.fees, 1075);
  assert.equal(r.quote.total, 5825);
});

test("computeQuote respeita quantidades", () => {
  const r = computeQuote(rules, { base: ["premoldada_120"], options: ["coifa"], quantities: { coifa: 2 } });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.quote.subtotal, 3900 + 850 * 2); // 5600
});

test("computeQuote rejeita chave inexistente (não chuta preço)", () => {
  const r = computeQuote(rules, { base: ["modelo_fantasma"] });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.deepEqual(r.unknownKeys, ["modelo_fantasma"]);
});

test("computeQuote permite escolher só algumas fees", () => {
  const r = computeQuote(rules, { base: ["premoldada_120"], fees: ["montagem"] });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.quote.fees, 600); // sem a taxa de 10%
  assert.equal(r.quote.total, 4500);
});

// ── Frete por região: determinístico pelo endereço ──

test("resolveFreight casa a região pelo nome no endereço", () => {
  const f = resolveFreight(rules, "Rua X, 100 - Bairro Y, Caxias do Sul/RS");
  assert.deepEqual(f, { label: "Frete — Caxias do Sul", amount: 150, code: null });
});

test("resolveFreight casa por alias e ignora acento/caixa", () => {
  assert.deepEqual(resolveFreight(rules, "moro em BENTO"), { label: "Frete — Bento Gonçalves", amount: 200, code: null });
  assert.deepEqual(resolveFreight(rules, "sou de são paulo? não, porto alegre"), { label: "Frete — Porto Alegre", amount: 350, code: null });
});

test("resolveFreight sem região configurada retorna null (sem linha de frete)", () => {
  assert.equal(resolveFreight({ base: rules.base }, "Caxias"), null);
});

test("resolveFreight sem match e sem default retorna unmatched (nunca chuta)", () => {
  const f = resolveFreight(rules, "Manaus/AM");
  assert.deepEqual(f, { unmatched: true });
});

test("resolveFreight usa freightDefault quando região não bate", () => {
  const withDefault: PricingRules = { ...rules, freightDefault: 500 };
  assert.deepEqual(resolveFreight(withDefault, "Fortaleza"), { label: "Frete", amount: 500 });
});

test("resolveFreight com endereço vazio e sem default é unmatched", () => {
  assert.deepEqual(resolveFreight(rules, ""), { unmatched: true });
});

// ── appendFeeLine: soma o frete resolvido ao total ──

test("appendFeeLine soma o frete a fees e total, mantendo subtotal", () => {
  const base = computeQuote(rules, { base: ["premoldada_120"], fees: ["montagem"] });
  assert.equal(base.ok, true);
  if (!base.ok) return;
  const withFreight = appendFeeLine(base.quote, { label: "Frete — Caxias do Sul", amount: 150 });
  assert.equal(withFreight.subtotal, base.quote.subtotal); // subtotal não muda
  assert.equal(withFreight.fees, base.quote.fees + 150);
  assert.equal(withFreight.total, base.quote.total + 150);
  assert.equal(withFreight.items.at(-1)?.label, "Frete — Caxias do Sul");
});
