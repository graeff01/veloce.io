import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTabelaMedidas, produtoNaFrase, medidasErradasDoProduto } from "../lib/ai-agent/medidas-produto";

// A tabela real do acervo da JR, como ela está escrita.
const TABELA_TXT = `
Fonte única de medidas. Formato: largura x profundidade x altura, em CENTÍMETROS.
• Linha Prime 7 espetos ....... 60 x 60 x 220
• Linha Prime 9 espetos ....... 74 x 60 x 230
• Linha Prime 11 espetos ...... 81 x 60 x 230
• Linha Prime 16 espetos ...... 105 x 60 x 250
• Prime Parrilla 81 ........... 81 x 60 x 240
• Prime Parrilla 105 .......... 105 x 60 x 260
• Tradição .................... 105 x 60 x 250
• Tradição Gourmet ............ 105 x 60 x 260
• Gourmet ..................... 105 x 60 x 260
A PROFUNDIDADE é 60 cm em TODOS estes modelos.`;

const T = lerTabelaMedidas(TABELA_TXT);

test("lê os 9 modelos da tabela", () => {
  assert.equal(T.length, 9);
  const p9 = T.find((x) => x.produto.includes("9 espetos"))!;
  assert.deepEqual([p9.largura, p9.profundidade, p9.altura], [74, 60, 230]);
});

test("não confunde texto solto com linha de tabela", () => {
  assert.equal(lerTabelaMedidas("A PROFUNDIDADE é 60 cm em TODOS estes modelos.").length, 0);
});

test("acha o produto na frase, preferindo o nome mais específico", () => {
  assert.match(produtoNaFrase("a Prime 9 espetos é ótima", T)!.produto, /9 espetos/);
  // "Tradição Gourmet" tem que vencer "Tradição" e "Gourmet".
  assert.match(produtoNaFrase("a Tradição Gourmet tem lado aberto", T)!.produto, /Tradição Gourmet/);
});

// ── O buraco que este módulo fecha ─────────────────────────────────────────
// O guarda anterior conferia se o NÚMERO existia no acervo. "Prime 9 tem 84 cm"
// passava, porque 84 é medida legítima de outra peça.
test("pega a medida certa atribuída ao produto ERRADO", () => {
  const e = medidasErradasDoProduto("A Prime 9 espetos tem 84 cm de largura.", T);
  assert.equal(e.length, 1);
  assert.match(e[0], /84cm de largura, é 74cm/);
});

test("pega os erros reais do histórico", () => {
  for (const [t, esperado] of [
    ["A Prime 9 espetos tem 90 cm de largura, 60 cm de profundidade e 2,30 m de altura.", /90cm de largura, é 74cm/],
    ["a churrasqueira Prime 7 espetos tem 70 cm de largura", /70cm de largura, é 60cm/],
  ] as [string, RegExp][]) {
    const e = medidasErradasDoProduto(t, T);
    assert.ok(e.length > 0, `passou batido: ${t}`);
    assert.match(e[0], esperado);
  }
});

test("a medida CERTA passa, inclusive em metros", () => {
  assert.deepEqual(medidasErradasDoProduto("A Prime 9 tem 74 cm de largura, 60 cm de profundidade e 2,30 m de altura.", T), []);
  assert.deepEqual(medidasErradasDoProduto("A Tradição Gourmet tem 105 cm de largura e 2,60 m de altura.", T), []);
});

test("não reclama de medida que não é do produto", () => {
  // O pé-direito do cliente, a conta de blocos — nada disso é dimensão da peça.
  for (const t of [
    "Com 3 metros de altura no pé-direito, a Prime 9 vai encaixar super bem.",
    "Como você precisa de 7 blocos, que são 1,4 metros, excede o limite.",
    "A Prime 9 custa R$ 1.447 e sai em 15 dias.",
  ]) assert.deepEqual(medidasErradasDoProduto(t, T), [], `alarme falso: ${t}`);
});

test("sem tabela, não opina", () => {
  assert.deepEqual(medidasErradasDoProduto("A Prime 9 tem 84 cm de largura.", []), []);
});
