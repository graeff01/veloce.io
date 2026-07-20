import { test } from "node:test";
import assert from "node:assert/strict";
import { lintFreight } from "../lib/ai-agent/freight-lint";
import { type FreightRegion } from "../lib/ai-agent/pricing";

const codes = (fr: FreightRegion[]) => lintFreight(fr).map((i) => i.code);
const has = (fr: FreightRegion[], code: string) => codes(fr).includes(code);

test("cadastro correto não gera problemas", () => {
  const fr: FreightRegion[] = [
    { region: "Porto Alegre — Zona Sul", city: "Porto Alegre", zone: "Zona Sul", amount: 200, code: "4314902", neighborhoods: [{ name: "Restinga" }] },
    { region: "Porto Alegre — Central", city: "Porto Alegre", zone: "Central", amount: 160, code: "4314902", neighborhoods: [{ name: "Centro Histórico" }] },
    { region: "Canoas", city: "Canoas", amount: 60, code: "4304606" },
  ];
  assert.deepEqual(lintFreight(fr), []);
});

test("E1 — valor ausente/inválido é erro", () => {
  assert.ok(has([{ region: "X", amount: 0 }], "valor-invalido"));
  assert.ok(has([{ region: "Y", amount: NaN }], "valor-invalido"));
  assert.ok(has([{ region: "Z", amount: -5 }], "valor-invalido"));
});

test("E2 — mesma cidade+zona duplicada é erro", () => {
  const fr: FreightRegion[] = [
    { region: "Canoas A", city: "Canoas", amount: 60, code: "43" },
    { region: "Canoas B", city: "Canoas", amount: 70, code: "43" },
  ];
  assert.ok(has(fr, "zona-duplicada"));
});

test("E3 — zonas da mesma cidade com code divergente não agrupam", () => {
  const fr: FreightRegion[] = [
    { region: "Porto Alegre — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, code: "4314902" },
    { region: "Porto Alegre — Norte", city: "Porto Alegre", zone: "Norte", amount: 180 }, // sem code
  ];
  assert.ok(has(fr, "cidade-nao-agrupa"));
});

test("E3 — mesma cidade com MESMO code não acusa", () => {
  const fr: FreightRegion[] = [
    { region: "Porto Alegre — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, code: "4314902" },
    { region: "Porto Alegre — Norte", city: "Porto Alegre", zone: "Norte", amount: 180, code: "4314902" },
  ];
  assert.ok(!has(fr, "cidade-nao-agrupa"));
});

test("A1 — bairro em cidades diferentes vira aviso de ambiguidade", () => {
  const fr: FreightRegion[] = [
    { region: "POA — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, code: "43", neighborhoods: [{ name: "Centro" }] },
    { region: "Canoas", city: "Canoas", amount: 60, code: "44", neighborhoods: [{ name: "Centro" }] },
  ];
  assert.ok(has(fr, "bairro-ambiguo"));
});

test("A2 — zona sem bairro/apelido em cidade multi-zona vira aviso", () => {
  const fr: FreightRegion[] = [
    { region: "POA — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, code: "43", neighborhoods: [{ name: "Restinga" }] },
    { region: "POA — Extremo Sul", city: "Porto Alegre", zone: "Extremo Sul", amount: 300, code: "43" }, // sem bairro
  ];
  assert.ok(has(fr, "zona-sem-bairro"));
});

test("A2 — cidade de zona ÚNICA sem bairro NÃO acusa", () => {
  const fr: FreightRegion[] = [{ region: "Canoas", city: "Canoas", amount: 60, code: "44" }];
  assert.ok(!has(fr, "zona-sem-bairro"));
});

test("A3 — apelido genérico/curto vira aviso", () => {
  assert.ok(has([{ region: "POA — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, aliases: ["sul"] }], "apelido-generico"));
  assert.ok(has([{ region: "X", amount: 100, aliases: ["ZN"] }], "apelido-generico"));
  // apelido específico (distrito) NÃO acusa
  assert.ok(!lintFreight([{ region: "Gravataí — Rural", city: "Gravataí", amount: 310, aliases: ["morungava"] }]).some((i) => i.code === "apelido-generico"));
});

test("A4 — apelido igual ao nome de outra cidade é erro", () => {
  const fr: FreightRegion[] = [
    { region: "POA — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, code: "43", aliases: ["canoas"] },
    { region: "Canoas", city: "Canoas", amount: 60, code: "44" },
  ];
  assert.ok(has(fr, "apelido-colide-cidade"));
});

test("erros vêm antes dos avisos na ordenação", () => {
  const fr: FreightRegion[] = [
    { region: "POA — Sul", city: "Porto Alegre", zone: "Sul", amount: 200, code: "43", aliases: ["sul"] }, // A3 aviso
    { region: "Bad", amount: 0 }, // E1 erro
  ];
  const out = lintFreight(fr);
  assert.equal(out[0].level, "erro");
});
