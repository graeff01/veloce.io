import { test } from "node:test";
import assert from "node:assert/strict";
import { looksIncomplete } from "../lib/ai-agent/queue";

test("fragmentos (lead escrevendo em partes) → espera mais", () => {
  assert.ok(looksIncomplete("Eu vi que não é daqui, de")); // termina em preposição
  assert.ok(looksIncomplete("quero saber o preço e"));   // termina em conjunção
  assert.ok(looksIncomplete("Eu moro em"));              // preposição pendente
  assert.ok(looksIncomplete("No"));                      // 1-2 caracteres soltos
});

// Este teste guarda uma DECISÃO, não um detalhe: "curta = fragmento" foi
// removido de propósito (ver o comentário em lib/ai-agent/queue.ts). No
// WhatsApp quase toda mensagem é curta E completa — "Oi", "Porto Alegre",
// "Gourmet" — e tratá-las como fragmento fazia a IA esperar 12 segundos em
// TODA mensagem. As asserções antigas ainda cobravam o comportamento velho e o
// teste falhava sem que houvesse nada errado no código.
test("mensagem curta e fechada NÃO é fragmento", () => {
  assert.ok(!looksIncomplete("Eu moro"));
  assert.ok(!looksIncomplete("No rio"));
  assert.ok(!looksIncomplete("Sim"));
  assert.ok(!looksIncomplete("Porto Alegre"));
});

test("mensagens completas → resposta normal (não estende)", () => {
  assert.ok(!looksIncomplete("Quanto custa o Renegade 2016 que está no anúncio?"));
  assert.ok(!looksIncomplete("Gostaria de saber sobre as condições de financiamento"));
  assert.ok(!looksIncomplete("Olá, vim pelo anúncio da Renegade branca"));
});
