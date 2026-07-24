import { test } from "node:test";
import assert from "node:assert/strict";
import { mapQualifToProfile } from "../lib/ai-agent/qualify-extract";

// O mapper é a FONTE ÚNICA usada pelo backstop (extractQualification) e pelo classificador
// consolidado (classify.ts). Estes testes travam o contrato: os dois NUNCA podem divergir
// no que escrevem no LeadProfile — é o que garante que ligar AI_CONSOLIDATED_CLASSIFY="on"
// não muda comportamento.

test("mapa vazio quando nada tem evidência", () => {
  assert.deepEqual(mapQualifToProfile({}), {});
  assert.deepEqual(mapQualifToProfile({ produto: null, orcamento: "null", troca: "sei lá" }), {});
});

test("strings: só campos preenchidos e trimados", () => {
  const d = mapQualifToProfile({ produto: " Taos ", uso: "família", orcamento: "até 25 mil", estagio: "comparando" });
  assert.deepEqual(d, { productInterest: "Taos", usageContext: "família", budget: "até 25 mil", decisionStage: "comparando" });
});

test("financiamento_detalhe implica wantsFinancing=true", () => {
  const d = mapQualifToProfile({ financiamento_detalhe: "10 mil de entrada" });
  assert.equal(d.wantsFinancing, true);
  assert.equal(d.financingDetail, "10 mil de entrada");
});

test("financiamento booleano explícito prevalece", () => {
  assert.equal(mapQualifToProfile({ financiamento: false }).wantsFinancing, false);
  assert.equal(mapQualifToProfile({ financiamento: true }).wantsFinancing, true);
});

test("troca_veiculo implica hasTradeIn=true", () => {
  const d = mapQualifToProfile({ troca_veiculo: "Gol 2015 90mil km" });
  assert.equal(d.hasTradeIn, true);
  assert.equal(d.tradeInDetail, "Gol 2015 90mil km");
});

test("troca=false explícito não é sobrescrito por ausência de detalhe", () => {
  assert.equal(mapQualifToProfile({ troca: false }).hasTradeIn, false);
});

test("nunca inclui chaves para campos ausentes (não zera perfil existente)", () => {
  const d = mapQualifToProfile({ produto: "Taos" });
  assert.ok(!("hasTradeIn" in d));
  assert.ok(!("wantsFinancing" in d));
  assert.ok(!("urgency" in d));
});
