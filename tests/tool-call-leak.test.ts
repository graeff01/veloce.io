import { test } from "node:test";
import assert from "node:assert/strict";
import { stripToolCallLeak } from "../lib/ai-agent/orchestrator";

// BLINDAGEM: o modelo às vezes ESCREVE uma chamada de ferramenta como texto em vez de
// executá-la; isso não pode vazar pro cliente. stripToolCallLeak remove só sintaxe de
// tool-call conhecida, sem tocar em prosa legítima.

test("remove atualizar_ficha({...}) vazado — formato parênteses (caso real do QA)", () => {
  const r = stripToolCallLeak(`atualizar_ficha({"campos":{"nome":"joão"}})\nPrazer, João! Garantia de 1 ano.`);
  assert.equal(r, "Prazer, João! Garantia de 1 ano.");
});

test("remove atualizar_ficha {...} vazado — formato CHAVES com espaço (2º caso real, pós-deploy)", () => {
  assert.equal(stripToolCallLeak(`atualizar_ficha {"campos":{"nome":"joão"}}`), "");
});

test("remove formato chaves SEM espaço", () => {
  assert.equal(stripToolCallLeak(`atualizar_ficha{"campos":{"nome":"x"}} Oi!`), "Oi!");
});

test("NÃO toca em chaves soltas em prosa (sem nome de ferramenta antes)", () => {
  const s = "Uso {carvão} às vezes, tá?";
  assert.equal(stripToolCallLeak(s), s);
});

test("remove chamada de args vazios (escalar_humano())", () => {
  assert.equal(stripToolCallLeak(`escalar_humano()\nJá chamei um vendedor.`), "Já chamei um vendedor.");
});

test("remove gerar_orcamento inline", () => {
  assert.equal(stripToolCallLeak(`gerar_orcamento({"pagamento":"cartao"}) segue seu orçamento`), "segue seu orçamento");
});

test("NÃO toca em prosa com parênteses legítimos", () => {
  const s = "A churrasqueira custa R$ 3.757 (à vista fica 8% off).";
  assert.equal(stripToolCallLeak(s), s);
});

test("NÃO toca em texto que só MENCIONA a palavra (sem parênteses de call)", () => {
  const s = "Vou gerar seu orçamento agora, tá? Também posso enviar o catálogo.";
  assert.equal(stripToolCallLeak(s), s);
});

test("resposta que era SÓ o vazamento vira vazia (cai no fallback do orquestrador)", () => {
  assert.equal(stripToolCallLeak(`atualizar_ficha({"campos":{"nome":"x"}})`), "");
});
