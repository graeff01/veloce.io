import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvaluation, shouldSample, EVAL_CATEGORIES } from "../lib/ai-agent/evaluation";
import { hashString, pickWeighted } from "../lib/ai-agent/variants";

// ── Avaliação / AI Judge ──
test("Cenário 1 — resposta excelente", () => {
  const r = parseEvaluation('{"overall":9.1,"naturalness":9,"empathy":8.5,"clarity":9,"persuasion":8,"qualification":8.5,"conversationFlow":9,"category":"excellent","severity":0.1}');
  assert.equal(r?.category, "excellent");
  assert.ok((r?.overall ?? 0) >= 8);
});

test("Cenário 2 — falhou objeção", () => {
  const r = parseEvaluation('{"overall":5,"category":"missed_objection","suggestion":"Explorar faixa de preço","severity":0.8}');
  assert.equal(r?.category, "missed_objection");
});

test("Cenário 3 — tom robótico", () => {
  const r = parseEvaluation('{"overall":4,"category":"robotic_tone","severity":0.7}');
  assert.equal(r?.category, "robotic_tone");
});

test("Cenário 4 — qualificação fraca", () => {
  const r = parseEvaluation('{"overall":4.5,"category":"weak_qualification"}');
  assert.equal(r?.category, "weak_qualification");
});

test("parseEvaluation rejeita categoria inválida e clampa score", () => {
  assert.equal(parseEvaluation('{"overall":8,"category":"inventada"}'), null);
  const r = parseEvaluation('{"overall":15,"category":"excellent"}');
  assert.equal(r?.overall, 10); // clamp 0..10
});

test("taxonomia de categorias congelada", () => {
  assert.ok(EVAL_CATEGORIES.includes("excellent"));
  assert.ok(EVAL_CATEGORIES.includes("weak_closing"));
});

test("shouldSample determinístico com rng injetado", () => {
  assert.equal(shouldSample(1), true);
  assert.equal(shouldSample(0), false);
  assert.equal(shouldSample(0.5, 0.4), true);
  assert.equal(shouldSample(0.5, 0.6), false);
});

// ── Prompt A/B ──
test("hashString é estável", () => {
  assert.equal(hashString("contato-123"), hashString("contato-123"));
});

test("pickWeighted é determinístico por seed e respeita peso", () => {
  const vs = [{ key: "A", weight: 1 }, { key: "B", weight: 1 }];
  const first = pickWeighted(vs, "lead-xyz")?.key;
  assert.equal(pickWeighted(vs, "lead-xyz")?.key, first); // mesmo lead → mesma variante
  // distribuição entre 1000 seeds fica perto de 50/50.
  let a = 0;
  for (let i = 0; i < 1000; i++) if (pickWeighted(vs, `lead-${i}`)?.key === "A") a++;
  assert.ok(a > 380 && a < 620, `distribuição enviesada: ${a}/1000`);
});

test("pickWeighted ignora variantes com peso 0 e lista vazia", () => {
  assert.equal(pickWeighted([{ key: "X", weight: 0 }], "s"), null);
  assert.equal(pickWeighted([], "s"), null);
});
