import { test } from "node:test";
import assert from "node:assert/strict";
import { turnsEquivalent, compareConversation, atendimentoEvents, turnSignature } from "../lib/ai-agent/eval/sim-compare";

test("turnos iguais na assinatura (texto diferente) = equivalente", () => {
  const a = { ia: "Oi! tudo bem?", decision: "respondeu_duvida", tools: ["enviar_foto"], artifacts: ["image"] };
  const b = { ia: "Olá, tudo certo?", decision: "respondeu_duvida", tools: ["enviar_foto"], artifacts: ["image"] };
  assert.equal(turnsEquivalent(a, b).equal, true);
});

test("decisão diferente = divergente", () => {
  const a = { decision: "respondeu_duvida", tools: [], artifacts: [] };
  const b = { decision: "escalou", tools: [], artifacts: [] };
  const r = turnsEquivalent(a, b);
  assert.equal(r.equal, false);
  assert.match(r.diffs[0], /decisão/);
});

test("tool a mais = divergente (ordem não importa)", () => {
  const a = { decision: "d", tools: ["a", "b"], artifacts: [] };
  const b = { decision: "d", tools: ["b", "a", "c"], artifacts: [] };
  assert.equal(turnsEquivalent(a, b).equal, false);
  // mesma tools em ordem diferente = equivalente
  assert.equal(turnsEquivalent(a, { decision: "d", tools: ["b", "a"], artifacts: [] }).equal, true);
});

test("artefato (PDF) a menos = divergente", () => {
  const a = { decision: "d", tools: ["enviar_orcamento"], artifacts: ["pdf"] };
  const b = { decision: "d", tools: ["enviar_orcamento"], artifacts: [] };
  assert.equal(turnsEquivalent(a, b).equal, false);
});

test("compareConversation conta iguais e reporta divergências; turno ausente conta", () => {
  const base = [{ decision: "a", tools: [], artifacts: [] }, { decision: "b", tools: ["x"], artifacts: [] }];
  const cand = [{ decision: "a", tools: [], artifacts: [] }, { decision: "b", tools: [], artifacts: [] }];
  const r = compareConversation(base, cand);
  assert.equal(r.turnsTotal, 2);
  assert.equal(r.turnsEqual, 1);
  assert.equal(r.divergences.length, 1);
  assert.equal(r.divergences[0].turn, 1);
});

test("atendimentoEvents conta vídeo/catálogo/PDF/foto/escala", () => {
  const turns = [
    { tools: ["enviar_video"], artifacts: ["video"] },
    { tools: ["enviar_foto"], artifacts: ["image"] },
    { tools: ["gerar_orcamento", "enviar_orcamento"], artifacts: ["pdf"] },
    { tools: ["escalar_humano"], artifacts: [] },
  ];
  const ev = atendimentoEvents(turns);
  assert.equal(ev.video, 1); assert.equal(ev.foto, 1); assert.equal(ev.pdf, 1); assert.equal(ev.escala, 1);
});

test("turnSignature ordena tools/artefatos p/ comparação estável", () => {
  const s = turnSignature({ decision: "d", tools: ["b", "a"], artifacts: ["z", "a"] });
  assert.deepEqual(s.tools, ["a", "b"]);
  assert.deepEqual(s.artifacts, ["a", "z"]);
});
