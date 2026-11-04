import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tools = readFileSync(join(process.cwd(), "lib", "ai-agent", "tools.ts"), "utf8");

// ── Não perguntar térreo/escada quando é transportadora ─────────────────────
// Apontamento da Maria (03/11) e repetido na madrugada de 04/11:
//
//   LEAD: "Monta em São Borja?"
//   IA  : "vou montar o orçamento para entrega em São Borja, tudo certinho.
//          Só preciso confirmar se o local é térreo ou tem escada"
//
// São Borja é fora da área própria — não existe montagem lá. Três turnos
// depois a própria IA disse que não tem montagem na região, contradizendo o
// que tinha acabado de prometer.
//
// A causa: a descrição do parâmetro mandava perguntar os três acessos SEMPRE,
// sem condição. Acesso só serve para calcular MONTAGEM.

test("a descrição do acesso condiciona à existência de montagem", () => {
  const desc = /acesso: \{ type: "object", description: "([^"]*)"/.exec(tools)?.[1] ?? "";
  assert.ok(desc, "o parâmetro acesso sumiu");
  assert.match(desc, /SÓ PERGUNTE ISTO SE HOUVER MONTAGEM/,
    "sem a condição, a IA volta a perguntar escada para quem recebe por transportadora");
  assert.match(desc, /TRANSPORTADORA/, "precisa nomear o caso em que não cabe");
});

test("o galho de fora-de-área proíbe a pergunta explicitamente", () => {
  // Condicionar na descrição do parâmetro não basta: quando o orçamento volta
  // dizendo que é fora da área, a instrução daquele momento é a que o modelo
  // está lendo. As duas precisam concordar.
  const i = tools.indexOf("A cidade do lead NÃO está na nossa área de entrega/montagem própria");
  assert.ok(i > 0, "o galho de fora-de-área sumiu");
  const trecho = tools.slice(i, i + 700);
  assert.match(trecho, /NÃO PERGUNTE se o local é térreo/, "falta a proibição explícita");
  assert.match(trecho, /não existe montagem/, "precisa dizer o porquê, não só proibir");
});

test("a proibição vem ANTES da instrução de preço", () => {
  // O modelo lê em ordem. Se o aviso vier depois de 'informe o valor, peça CPF',
  // ele já montou a resposta inteira antes de chegar nele.
  const i = tools.indexOf("A cidade do lead NÃO está na nossa área");
  const trecho = tools.slice(i, i + 700);
  const iProibicao = trecho.indexOf("NÃO PERGUNTE se o local é térreo");
  const iPreco = trecho.indexOf("PRIMEIRO informe o valor");
  assert.ok(iProibicao > 0 && iPreco > 0, "âncoras não encontradas");
  assert.ok(iProibicao < iPreco, "a proibição tem de vir antes da instrução de preço");
});
