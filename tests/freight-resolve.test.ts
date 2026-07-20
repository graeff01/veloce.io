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

// ── ACURÁCIA / casos-limite: bairro genérico não pode vazar entre cidades ────────
// Cenário real: "Centro" existe em quase toda cidade. Registrado como bairro numa zona
// de POA, NÃO pode cobrar o frete de POA quando o cliente diz outra cidade.
const rulesGen: PricingRules = {
  freight: [
    { region: "Porto Alegre — Central", city: "Porto Alegre", zone: "Central", amount: 160, code: "4314902", neighborhoods: [{ name: "Centro Histórico" }] },
    { region: "Porto Alegre — Zona Sul", city: "Porto Alegre", zone: "Zona Sul", amount: 200, code: "4314902", aliases: ["zona sul"], neighborhoods: [{ name: "Cidade Baixa" }, { name: "Centro" }, { name: "Restinga" }] },
    { region: "Canoas", city: "Canoas", amount: 60, code: "4304606", neighborhoods: [{ name: "Centro" }] },
    { region: "São Leopoldo", city: "São Leopoldo", amount: 90, code: "4318705" },
    { region: "Santa Cruz do Sul", city: "Santa Cruz do Sul", zone: "Central", amount: 250, code: "4316808" },
  ],
};

test("bairro genérico segue a CIDADE citada (não vaza p/ outra cidade)", () => {
  assert.equal(amount(resolveFreight(rulesGen, "moro no centro de canoas")), 60);        // era 200 (bug)
  assert.equal(amount(resolveFreight(rulesGen, "santa cruz do sul, centro")), 250);      // era 200 (bug)
  assert.equal(amount(resolveFreight(rulesGen, "centro, sao leopoldo")), 90);            // sem zona, cidade única
});

test("bairro dentro da cidade certa ainda resolve a zona", () => {
  assert.equal(amount(resolveFreight(rulesGen, "cidade baixa, porto alegre")), 200);     // bairro composto
  assert.equal(amount(resolveFreight(rulesGen, "moro na restinga em poa")), 200);
});

test("acentuação: com ou sem acento resolve igual", () => {
  assert.equal(amount(resolveFreight(rulesGen, "moro em sao leopoldo")), 90);
  assert.equal(amount(resolveFreight(rulesGen, "entrega em são leopoldo rs")), 90);
});

test("bairro genérico SEM cidade citada não chuta (ambíguo → unmatched)", () => {
  // "Centro" existe em POA e Canoas; sem cidade não dá p/ saber → não cobra errado.
  const r = resolveFreight(rulesGen, "moro no centro");
  assert.ok(r && "unmatched" in r);
});

test("bairro ÚNICO sem cidade citada resolve (Restinga só existe numa região)", () => {
  assert.equal(amount(resolveFreight(rulesGen, "sou lá da restinga")), 200);
});
