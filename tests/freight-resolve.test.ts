import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveFreight, type PricingRules } from "../lib/ai-agent/pricing";

// POA com 3 zonas (mesmo código IBGE) + cidades de zona única.
const rules: PricingRules = {
  freight: [
    { region: "Porto Alegre — Central", city: "Porto Alegre", zone: "Central", amount: 160, code: "4314902" },
    { region: "Porto Alegre — Zona Sul", city: "Porto Alegre", zone: "Zona Sul", amount: 200, code: "4314902", aliases: ["zona sul"], neighborhoods: [{ name: "Restinga", lat: -30.15, lng: -51.14 }, { name: "Tristeza" }] },
    { region: "Porto Alegre — Extremo Sul", city: "Porto Alegre", zone: "Extremo Sul", amount: 300, code: "4314902", assembly: "required" },
    { region: "Canoas", city: "Canoas", amount: 60, code: "4304606" },
    { region: "Gravataí — Rural", city: "Gravataí", zone: "Rural", amount: 310, code: "4309209", aliases: ["morungava"] },
    { region: "Feliz", city: "Feliz", amount: 400, code: "4308052" },
    { region: "Alto Feliz", city: "Alto Feliz", amount: 385, code: "4300638" },
  ],
};

const amount = (r: ReturnType<typeof resolveFreight>) => (r && "amount" in r ? r.amount : null);

test("bairro (neighborhood) identifica a zona (auto-detecção)", () => {
  assert.equal(amount(resolveFreight(rules, "moro na restinga, porto alegre")), 200); // neighborhood c/ coord
  assert.equal(amount(resolveFreight(rules, "sou do bairro tristeza em poa")), 200); // neighborhood sem coord
  assert.equal(amount(resolveFreight(rules, "porto alegre, bairro morungava")), 310); // Gravataí Rural via bairro
});

test("rótulo da zona digitado resolve (escopado à cidade)", () => {
  assert.equal(amount(resolveFreight(rules, "porto alegre zona sul")), 200);
  assert.equal(amount(resolveFreight(rules, "entrega em porto alegre extremo sul")), 300);
});

test("cidade de zona única resolve direto", () => {
  assert.equal(amount(resolveFreight(rules, "sou de canoas")), 60);
});

test("cidade com várias zonas e nenhuma identificada → askZone", () => {
  const r = resolveFreight(rules, "porto alegre");
  assert.ok(r && "askZone" in r);
  if (r && "askZone" in r) { assert.equal(r.city, "Porto Alegre"); assert.equal(r.options.length, 3); }
});

test("cidade fora da área → unmatched", () => {
  const r = resolveFreight(rules, "florianopolis sc");
  assert.ok(r && "unmatched" in r);
});

test("montagem obrigatória entra no rótulo", () => {
  const r = resolveFreight(rules, "porto alegre extremo sul");
  assert.ok(r && "label" in r && r.label.includes("montagem obrigatória"));
});

test("sem frete configurado → null", () => {
  assert.equal(resolveFreight({}, "porto alegre"), null);
});

test("casamento por PALAVRA — 'Feliz' vs 'Alto Feliz' (o mais específico ganha)", () => {
  assert.equal(amount(resolveFreight(rules, "entrega em alto feliz")), 385);
  assert.equal(amount(resolveFreight(rules, "moro em feliz rs")), 400);
});

test("casamento por PALAVRA — não casa dentro de outra palavra", () => {
  // "feliz" dentro de "felizmente" NÃO deve casar Feliz; a cidade é Canoas.
  assert.equal(amount(resolveFreight(rules, "moro felizmente em canoas")), 60);
});
