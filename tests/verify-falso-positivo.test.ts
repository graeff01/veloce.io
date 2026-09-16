import { test } from "node:test";
import assert from "node:assert/strict";
import { daResposta } from "../lib/ai-agent/verify";

// ── Por que este filtro existe ───────────────────────────────────────────────
// Medido com casos reais da JR: o auditor apontava como "não apoiada" uma frase
// que estava nas FONTES — a fala do próprio lead, que entra ali junto com o
// histórico. Chegou a barrar uma resposta que era só cordialidade.
// Em produção, barrar significa ABSTER. Falso positivo cala o atendimento numa
// resposta correta — pior que o problema que o auditor veio resolver.
// Reescrever o prompt não resolveu; a decisão saiu da mão do modelo.

const FONTES = [
  "Churrasqueira Gourmet: bifeteira a gás embutida, um dos lados balanceados. R$ 4.197.",
  "lead: o modelo gourmet seria este mesmo, só que espelhado, para o fogao ficar do outro lado",
].join("\n");

test("frase que veio das FONTES é descartada", () => {
  // O caso real: o modelo devolveu a fala do lead como se fosse afirmação da IA.
  const item = "O modelo gourmet seria este mesmo, só que espelhado, para o fogao ficar do outro lado";
  const resposta = "Que legal! Fico à disposição para o que precisar 😊";
  assert.equal(daResposta(item, resposta, FONTES), false);
});

test("invenção que veio da RESPOSTA é mantida", () => {
  const item = "O modelo Gourmet pode ser feito com a abertura para o lado esquerdo";
  const resposta = "Exatamente! O modelo Gourmet pode ser feito com a abertura para o lado esquerdo, para que o fogão fique do lado que você prefere.";
  assert.equal(daResposta(item, resposta, FONTES), true);
});

test("tolera paráfrase ao citar", () => {
  // O modelo nem sempre copia literal — substring simples perderia o caso.
  const item = "fabricamos a Gourmet em qualquer medida sob encomenda";
  const resposta = "Sim, nós fabricamos a Gourmet em qualquer medida, sob encomenda — é só dizer o tamanho.";
  assert.equal(daResposta(item, resposta, FONTES), true);
});

test("item que não está em lugar nenhum não passa", () => {
  assert.equal(daResposta("entregamos em Manaus no mesmo dia", "Olá, tudo bem?", FONTES), false);
});

test("empate fica com a resposta", () => {
  // Quando a mesma frase aparece nos dois, é porque a IA REPETIU algo apoiado —
  // e aí quem decide é o auditor, não o filtro.
  const item = "bifeteira a gás embutida";
  const resposta = "A Gourmet tem bifeteira a gás embutida.";
  assert.equal(daResposta(item, resposta, FONTES), true);
});

test("item vazio ou só palavra curta não derruba nada", () => {
  assert.equal(daResposta("", "qualquer resposta", FONTES), false);
  assert.equal(daResposta("ok e a de", "ok e a de", FONTES), false);
});
