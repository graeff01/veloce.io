import { test } from "node:test";
import assert from "node:assert/strict";
import { slotState, scoreLead, urgencyScore, type ProfileLike } from "../lib/ai-agent/scoring";

test("slotState: perfil vazio = tudo faltando", () => {
  const s = slotState({});
  assert.equal(s.filled.length, 0);
  assert.deepEqual(s.missing.sort(), ["financiamento", "interesse", "orcamento", "troca", "urgencia", "visita"].sort());
});

test("Cenário 2 — parcial: identifica lacunas corretamente", () => {
  const p: ProfileLike = { productInterest: "Taos", hasTradeIn: true };
  const s = slotState(p);
  assert.ok(s.filled.includes("interesse"));
  assert.ok(s.filled.includes("troca"));
  assert.ok(s.missing.includes("orcamento"));
  assert.ok(s.missing.includes("urgencia"));
});

test("Cenário 1 — completo: nenhum slot faltando", () => {
  const p: ProfileLike = { productInterest: "Taos", budget: "120k", wantsFinancing: true, hasTradeIn: false, urgency: "essa semana", visitIntent: true };
  assert.equal(slotState(p).missing.length, 0);
});

test("urgencyScore mapeia prazo para faixa", () => {
  assert.equal(urgencyScore("quero fechar essa semana"), 1);
  assert.equal(urgencyScore("talvez esse mês"), 0.6);
  assert.equal(urgencyScore("sem pressa, só pesquisando"), 0.2);
  assert.equal(urgencyScore(null), 0);
});

test("score: lead frio (só curiosidade) = COLD", () => {
  const r = scoreLead({ productInterest: "Taos" });
  assert.equal(r.temperature, "cold");
  assert.ok(r.score < 40);
});

test("Cenário 3 + dinâmica — esquenta drasticamente com sinais fortes", () => {
  const cold = scoreLead({ productInterest: "Taos" });
  // Lead muda: dá entrada alta, quer fechar essa semana.
  const hot = scoreLead({ productInterest: "Taos", budget: "70k de entrada", readyToBuy: true, urgency: "quero fechar essa semana", wantsFinancing: true });
  assert.ok(hot.score > cold.score + 40, `esperava salto grande: ${cold.score} -> ${hot.score}`);
  assert.equal(hot.temperature, "hot");
});

test("orçamento atualizado não duplica — score reflete o estado final", () => {
  const a = scoreLead({ productInterest: "Taos", budget: "100k", visitIntent: true });
  const b = scoreLead({ productInterest: "Taos", budget: "140k", visitIntent: true });
  // Mesma estrutura de sinais => mesmo score (orçamento é presença, não soma).
  assert.equal(a.score, b.score);
});

test("Cenário 4 — evasivo permanece COLD (sem sinais fortes)", () => {
  const r = scoreLead({ productInterest: "Taos", urgency: "depois vejo" });
  assert.equal(r.temperature, "cold");
});
