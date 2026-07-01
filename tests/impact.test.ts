import { test } from "node:test";
import assert from "node:assert/strict";
import { median } from "../lib/ai-agent/impact";

// ── Impacto/ROI: mediana pura (base do card herói de tempo de resposta) ──

test("median retorna null para lista vazia", () => {
  assert.equal(median([]), null);
});

test("median de tamanho ímpar é o valor do meio", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([3]), 3);
});

test("median de tamanho par é a média (arredondada) dos dois centrais", () => {
  assert.equal(median([1, 2, 3, 4]), 3); // (2+3)/2 = 2.5 → 3
  assert.equal(median([10, 20]), 15);
  assert.equal(median([12, 12, 156 * 60, 156 * 60]), Math.round((12 + 156 * 60) / 2));
});

test("median não muta a entrada", () => {
  const nums = [5, 1, 3];
  median(nums);
  assert.deepEqual(nums, [5, 1, 3]);
});
