import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFreightTable, buildImportPreview, type GeoMaps } from "../lib/freight-import";
import type { FreightRegion } from "../lib/ai-agent/pricing";

test("parse: formato real da planilha (tab, R$, vírgula, prefixo Frete)", () => {
  const text = `Frete Obrigatório com Montagem\tPreço

Frete Estância Velha\tR$ 250,00
frete Lindolfo Collor\tR$ 250,00
Frete Porto Alegre ZS\tR$ 250,00
Frete Litoral (geral litoral gaucho)\tR$ 410,00
Frete Bom Retiro do Sul\tR$ 375,00
Frete Encantado\tR$ 550,00
Frete Campo Belo
Frete Teste Milhar\tR$ 1.234,56`;
  const { rows, skipped } = parseFreightTable(text);
  const by = Object.fromEntries(rows.map((r) => [r.region, r.amount]));
  assert.equal(by["Estância Velha"], 250);
  assert.equal(by["Lindolfo Collor"], 250);
  assert.equal(by["Porto Alegre ZS"], 250);
  assert.equal(by["Litoral (geral litoral gaucho)"], 410); // "geral" no MEIO não é header
  assert.equal(by["Bom Retiro do Sul"], 375);
  assert.equal(by["Teste Milhar"], 1234.56); // milhar com ponto
  assert.equal(rows.length, 7);
  assert.ok(skipped.some((s) => s.includes("Campo Belo"))); // sem preço → pulado
  assert.ok(!rows.some((r) => /obrigat|preco/i.test(r.region))); // header não vira linha
});

test("parse: variações de número", () => {
  const { rows } = parseFreightTable("Frete X\t60\nFrete Y\tR$60,00\nFrete Z\t1.500");
  assert.deepEqual(rows.map((r) => r.amount), [60, 60, 1500]);
});

const geo: GeoMaps = {
  codeBySlug: new Map([["porto alegre", "4314902"], ["canoas", "4304606"], ["sapucaia do sul", "4318705"]]),
  nameByCode: new Map([["4314902", "Porto Alegre"], ["4304606", "Canoas"], ["4318705", "Sapucaia do Sul"]]),
};
const existing: FreightRegion[] = [
  { region: "Canoas", city: "Canoas", amount: 60, code: "4304606" },
  { region: "Porto Alegre — Central", city: "Porto Alegre", zone: "Central", amount: 160, code: "4314902", neighborhoods: [{ name: "Centro", lat: -30, lng: -51 }] },
];

test("preview: classifica same/price/new/unmatched e preserva bairros", () => {
  const parsed = parseFreightTable("Frete Canoas\tR$60\nFrete Porto Alegre\tR$170\nFrete Porto Alegre ZS\tR$250\nFrete Sapucaia\tR$150\nFrete Cidade Fantasma\tR$99").rows;
  const { rows, merged } = buildImportPreview(existing, parsed, geo);
  const st = Object.fromEntries(rows.map((r) => [r.region, r.status]));
  assert.equal(st["Canoas"], "same");
  assert.equal(st["Porto Alegre — Central"], "price"); // base "Porto Alegre" ≡ Central → 160→170
  assert.equal(st["Porto Alegre — Zona Sul"], "new");
  assert.equal(st["Sapucaia do Sul"], "new"); // NAME_FIX + IBGE
  assert.equal(st["Cidade Fantasma"], "unmatched"); // sem IBGE
  // bairros da Central preservados após mudança de preço
  const central = merged.find((f) => f.zone === "Central")!;
  assert.equal(central.amount, 170);
  assert.equal(central.neighborhoods?.[0]?.name, "Centro");
});

test("preview: nada muda quando os preços batem", () => {
  const parsed = parseFreightTable("Frete Canoas\tR$60").rows;
  const { rows } = buildImportPreview(existing, parsed, geo);
  assert.equal(rows[0].status, "same");
});
