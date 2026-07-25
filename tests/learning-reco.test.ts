import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRecommendations, type AggregatedSignals } from "../lib/ai-agent/eval/learning-reco";

const base = (p: Partial<AggregatedSignals> = {}): AggregatedSignals => ({
  totalConversations: p.totalConversations ?? 100,
  windowDays: p.windowDays ?? 30,
  dimensions: p.dimensions ?? [],
  objections: p.objections ?? [],
  noSource: p.noSource ?? { contactIds: [], samples: [] },
  minConversations: p.minConversations,
});

const ev = (n: number) => Array.from({ length: n }, (_, i) => ({ contactId: `c${i}`, excerpt: "x" }));

test("dimensão baixa vira recomendação com contrato completo (evidência, volume, taxa, alvo, impacto, confiança)", () => {
  const r = buildRecommendations(base({ dimensions: [{ dimension: "handoff", lowConversations: ev(8) }] }));
  assert.equal(r.length, 1);
  const x = r[0];
  assert.equal(x.type, "dimensao_baixa");
  assert.equal(x.targetComponent, "playbook");
  assert.equal(x.conversationCount, 8);
  assert.equal(x.rate, 0.08);           // 8/100
  assert.ok(x.confidence > 0 && x.confidence < 1);
  assert.equal(x.expectedImpact.reach, 0.08);
  assert.ok(x.evidence.length === 8);
  assert.ok(x.proposedChange.summary.length > 0);
});

test("abaixo do limiar não vira recomendação", () => {
  assert.equal(buildRecommendations(base({ dimensions: [{ dimension: "handoff", lowConversations: ev(2) }] })).length, 0);
  // limiar configurável
  assert.equal(buildRecommendations(base({ minConversations: 2, dimensions: [{ dimension: "handoff", lowConversations: ev(2) }] })).length, 1);
});

test("objeção frequente vira recomendação (playbook)", () => {
  const r = buildRecommendations(base({ objections: [{ type: "PRICE", contactIds: ["a", "b", "c", "d"], avgSeverity: 0.7 }] }));
  assert.equal(r.length, 1);
  assert.equal(r[0].type, "objecao_frequente");
  assert.equal(r[0].conversationCount, 4);
});

test("conhecimento ausente (abster/sem fonte) vira recomendação (conhecimento)", () => {
  const r = buildRecommendations(base({ noSource: { contactIds: ["a", "b", "c", "d", "e"], samples: ev(5) } }));
  assert.equal(r.length, 1);
  assert.equal(r[0].targetComponent, "conhecimento");
  assert.equal(r[0].conversationCount, 5);
});

test("confiança cresce com o volume", () => {
  const c5 = buildRecommendations(base({ dimensions: [{ dimension: "handoff", lowConversations: ev(5) }] }))[0].confidence;
  const c50 = buildRecommendations(base({ dimensions: [{ dimension: "handoff", lowConversations: ev(50) }] }))[0].confidence;
  assert.ok(c50 > c5);
});

test("prioriza por impacto × confiança (mais alcance/confiança primeiro)", () => {
  const r = buildRecommendations(base({
    totalConversations: 100,
    dimensions: [{ dimension: "handoff", lowConversations: ev(30) }],       // rate alto
    objections: [{ type: "PRICE", contactIds: ["a", "b", "c"], avgSeverity: 0.5 }], // rate baixo
  }));
  assert.equal(r[0].type, "dimensao_baixa"); // maior alcance vem primeiro
});
