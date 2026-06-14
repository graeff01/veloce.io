import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, budgetedWindow } from "../lib/ai-agent/memory";
import type { ChatMessage } from "../lib/openai";

const msg = (role: "user" | "assistant", content: string): ChatMessage => ({ role, content });

test("estimateTokens cresce com o tamanho do texto", () => {
  assert.equal(estimateTokens(""), 0);
  assert.ok(estimateTokens("a".repeat(40)) >= 10);
});

test("budgetedWindow mantém ordem cronológica", () => {
  const msgs = [msg("user", "1"), msg("assistant", "2"), msg("user", "3")];
  const out = budgetedWindow(msgs, 1000);
  assert.deepEqual(out.map((m) => m.content), ["1", "2", "3"]);
});

test("budgetedWindow corta as mais antigas quando estoura o orçamento", () => {
  // Cada mensagem ~25 tokens (100 chars/4). Orçamento p/ ~2 mensagens.
  const big = "x".repeat(100);
  const msgs = [msg("user", big), msg("assistant", big), msg("user", big), msg("assistant", big)];
  const out = budgetedWindow(msgs, 60);
  assert.ok(out.length < msgs.length, "deveria ter cortado");
  // Mantém as MAIS RECENTES (o fim do array).
  assert.equal(out[out.length - 1].content, big);
});

test("budgetedWindow garante ao menos a última mensagem mesmo se ela estoura", () => {
  const huge = "y".repeat(10000);
  const out = budgetedWindow([msg("user", huge)], 10);
  assert.equal(out.length, 1);
});
