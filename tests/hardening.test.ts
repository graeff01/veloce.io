import { test } from "node:test";
import assert from "node:assert/strict";
import { CircuitBreaker } from "../lib/ai-agent/llm-limiter";
import { costOf } from "../lib/ai-agent/usage";

test("circuit breaker abre após N falhas e reseta no sucesso", () => {
  const cb = new CircuitBreaker(3, 1000);
  assert.equal(cb.canPass(0), true);
  cb.recordFailure(0); cb.recordFailure(0);
  assert.equal(cb.isOpen, false, "ainda fechado abaixo do limiar");
  cb.recordFailure(0); // 3ª falha → abre
  assert.equal(cb.canPass(500), false, "aberto durante cooldown");
  assert.equal(cb.canPass(1000), true, "fecha após cooldown");
  cb.recordFailure(2000); cb.recordSuccess(); // sucesso zera o contador
  assert.equal(cb.canPass(2001), true);
});

test("costOf calcula preço por modelo", () => {
  // gpt-4o-mini: 0.15 in / 0.60 out por 1M.
  assert.equal(Math.round(costOf("gpt-4o-mini", 1_000_000, 0) * 100) / 100, 0.15);
  assert.equal(Math.round(costOf("gpt-4o-mini", 0, 1_000_000) * 100) / 100, 0.60);
  // modelo desconhecido cai no default (mini).
  assert.equal(Math.round(costOf("modelo-x", 1_000_000, 0) * 100) / 100, 0.15);
  // embedding só tem custo de input.
  assert.equal(costOf("text-embedding-3-small", 1_000_000, 999), (1_000_000 / 1e6) * 0.02);
});
