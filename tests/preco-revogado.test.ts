import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, extrairPrecosOficiais, extrairPrecosRevogados, precosRevogadosNaResposta } from "../lib/ai-agent/grounding";

// ── Por que isto existe ──────────────────────────────────────────────────────
// A JR trocou a tabela em nov/2026 (Prime 9: R$ 1.447 → R$ 1.517). O grounding
// aceita como fonte qualquer valor que esteja na CONVERSA — então o lead que
// recebeu o preço velho na semana passada pergunta de novo, o número está no
// histórico, e a IA repete R$ 1.447 com o grounding aprovando.

const REGRAS = {
  base: [
    { key: "prime9", label: "Prime 9 espetos", amount: 1517 },
    { key: "parrilla105", label: "Parrilla 105", amount: 3757 },
  ],
  // 3757 era a Tradição na tabela velha e é a Parrilla 105 na nova.
  precosRevogados: [1447, 3757],
};

test("o preço velho que está no histórico passa no grounding — é o furo", () => {
  const r = checkGrounding("A Prime 9 sai por R$ 1.447,00.", "IA: a Prime 9 sai por R$ 1.447,00", extrairPrecosOficiais(REGRAS));
  assert.equal(r.grounded, true, "se isto falhar, o furo foi fechado em outro lugar — reveja este teste");
});

test("o preço revogado é pego, com e sem centavos", () => {
  const rev = extrairPrecosRevogados(REGRAS);
  const of = extrairPrecosOficiais(REGRAS);
  assert.deepEqual(precosRevogadosNaResposta("A Prime 9 sai por R$ 1.447,00.", rev, of), ["R$ 1.447,00"]);
  assert.deepEqual(precosRevogadosNaResposta("Fica R$1447 à vista", rev, of), ["R$1447"]);
});

test("o preço novo passa", () => {
  const rev = extrairPrecosRevogados(REGRAS);
  assert.deepEqual(precosRevogadosNaResposta("A Prime 9 sai por R$ 1.517,00.", rev, extrairPrecosOficiais(REGRAS)), []);
});

test("valor que voltou a ser oficial em outro produto NÃO é barrado", () => {
  const rev = extrairPrecosRevogados(REGRAS);
  assert.deepEqual(precosRevogadosNaResposta("A Parrilla 105 sai por R$ 3.757,00.", rev, extrairPrecosOficiais(REGRAS)), []);
});

test("a lista de revogados não vira preço oficial por engano", () => {
  // `extrairPrecosOficiais` lê toda chave com "preco" no nome.
  const of = extrairPrecosOficiais(REGRAS);
  assert.ok(!of.has("1447"), "o preço revogado entrou na tabela oficial");
});

test("sem lista, nada muda", () => {
  assert.deepEqual(precosRevogadosNaResposta("R$ 1.447,00", extrairPrecosRevogados({ base: [] })), []);
  assert.deepEqual(precosRevogadosNaResposta("R$ 1.447,00", extrairPrecosRevogados(null)), []);
});

test("pedaço de número não é preço revogado", () => {
  const rev = extrairPrecosRevogados(REGRAS);
  assert.deepEqual(precosRevogadosNaResposta("Fica R$ 14.470,00", rev), []);
  assert.deepEqual(precosRevogadosNaResposta("Fica R$ 144,00", rev), []);
});
