import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveAgentState, type StateSignals } from "../lib/ai-agent/conversation-state";

const base: StateSignals = {
  isFirstTurn: false, hasProductInterest: false, quoteReady: false,
  quoteInProgress: false, quoteApproved: false, funnelStage: null,
};

test("1º contato sem sinal → saudacao", () => {
  assert.equal(deriveAgentState({ ...base, isFirstTurn: true }), "saudacao");
});

test("houve troca mas sem produto → conhecendo", () => {
  assert.equal(deriveAgentState({ ...base }), "conhecendo");
});

test("produto identificado → identificando_produto", () => {
  assert.equal(deriveAgentState({ ...base, hasProductInterest: true }), "identificando_produto");
  assert.equal(deriveAgentState({ ...base, funnelStage: "qualificado" }), "identificando_produto");
});

test("ficha pronta p/ orçar → orcamento", () => {
  assert.equal(deriveAgentState({ ...base, hasProductInterest: true, quoteReady: true }), "orcamento");
});

test("orçamento em curso → orcamento (mesmo sem quoteReady)", () => {
  assert.equal(deriveAgentState({ ...base, quoteInProgress: true }), "orcamento");
});

test("orçamento aprovado → fechamento", () => {
  assert.equal(deriveAgentState({ ...base, quoteReady: true, quoteApproved: true }), "fechamento");
});

test("funil em negociacao/convertido → fechamento", () => {
  assert.equal(deriveAgentState({ ...base, funnelStage: "negociacao" }), "fechamento");
  assert.equal(deriveAgentState({ ...base, hasProductInterest: true, funnelStage: "convertido" }), "fechamento");
});

test("nunca regride: fechamento vence produto/orçamento", () => {
  const s: StateSignals = { ...base, isFirstTurn: true, hasProductInterest: true, quoteReady: true, quoteInProgress: true, quoteApproved: true };
  assert.equal(deriveAgentState(s), "fechamento");
});
