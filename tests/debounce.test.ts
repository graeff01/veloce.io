import { test } from "node:test";
import assert from "node:assert/strict";
import { looksIncomplete } from "../lib/ai-agent/queue";

test("fragmentos (lead escrevendo em partes) → espera mais", () => {
  assert.ok(looksIncomplete("Eu moro"));                 // curta
  assert.ok(looksIncomplete("No rio"));                  // curta
  assert.ok(looksIncomplete("Eu vi que não é daqui, de")); // termina em preposição
  assert.ok(looksIncomplete("quero saber o preço e"));   // termina em conjunção
  assert.ok(looksIncomplete("Sim"));                     // curta (aceitável esperar)
});

test("mensagens completas → resposta normal (não estende)", () => {
  assert.ok(!looksIncomplete("Quanto custa o Renegade 2016 que está no anúncio?"));
  assert.ok(!looksIncomplete("Gostaria de saber sobre as condições de financiamento"));
  assert.ok(!looksIncomplete("Olá, vim pelo anúncio da Renegade branca"));
});
