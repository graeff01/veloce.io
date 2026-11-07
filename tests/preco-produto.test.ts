import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTabelaPrecos, precosErradosDoProduto } from "../lib/ai-agent/preco-produto";
import { T as TABELA_NOV } from "../scripts/jr-tabela-nov2026-dados";

// Tabela da JR, catálogo de nov/2026 — rótulos como um cadastro real escreveria.
const REGRAS = {
  base: [
    { key: "popular_lisa_55", label: "Popular Lisa 55cm", amount: 857 },
    { key: "popular_lisa_65", label: "Popular Lisa 65cm", amount: 977 },
    { key: "prime7", label: "Churrasqueira Linha Prime 7 espetos", amount: 1307 },
    { key: "prime9", label: "Churrasqueira Linha Prime 9 espetos", amount: 1517 },
    { key: "prime11", label: "Churrasqueira Linha Prime 11 espetos", amount: 1627 },
    { key: "prime16", label: "Churrasqueira Linha Prime 16 espetos (105x60x2,50)", amount: 2097 },
    { key: "tradicao", label: "Churrasqueira Tradição", amount: 3947 },
    { key: "tradicao_gourmet", label: "Churrasqueira Tradição Gourmet", amount: 4517 },
    { key: "gourmet", label: "Churrasqueira Gourmet", amount: 4407 },
    { key: "fogao3", label: "Fogão Campeiro 3 bocas", amount: 1697 },
    { key: "campeirinho", label: "Fogão Campeirinho", amount: 1167 },
    { key: "napoli", label: "Forno Napoli", amount: 1637 },
    { key: "ff3", label: "Forno e Fogão Campeiro 3 bocas", amount: 2687 },
    { key: "p9_f3", label: "Prime 9 espetos + Fogão 3 bocas", amount: 3214 },
    { key: "p9_ff3", label: "Prime 9 espetos + Forno e Fogão 3 bocas", amount: 4204 },
    { key: "p9_nap_camp", label: "Prime 9 espetos + Forno Napoli + Fogão Campeirinho", amount: 4321 },
    { key: "bancada", label: "Bancada Gourmet", amount: 2307 },
  ],
};
const T = lerTabelaPrecos(REGRAS);
const erros = (r: string) => precosErradosDoProduto(r, T).map((e) => e.disse);

// ── O que TEM de barrar ──────────────────────────────────────────────────────
test("preço real de OUTRO modelo é barrado — o furo que o grounding deixava", () => {
  assert.deepEqual(erros("A Prime 9 sai por R$ 1.627,00."), ["R$ 1.627,00"]);
});

test("preço da Tradição Gourmet dado para a Gourmet (e vice-versa)", () => {
  assert.deepEqual(erros("A Gourmet fica R$ 4.517,00."), ["R$ 4.517,00"]);
  assert.deepEqual(erros("A Tradição Gourmet fica R$ 4.407,00."), ["R$ 4.407,00"]);
});

test("conjunto com o preço de uma peça só", () => {
  assert.deepEqual(erros("O conjunto Prime 9 + Fogão 3 bocas sai por R$ 1.517,00."), ["R$ 1.517,00"]);
});

test("soma na mão no lugar do preço do conjunto", () => {
  // R$ 4.111 é a Prime 7 + Napoli + Campeirinho. Dado para a Prime 9, é erro.
  assert.deepEqual(erros("A Prime 9 com Forno Napoli e Fogão Campeirinho fica R$ 4.321,00."), []);
  assert.deepEqual(erros("A Prime 9 com Forno Napoli e Fogão Campeirinho fica R$ 4.111,00."), ["R$ 4.111,00"]);
});

test("preço VELHO de tabela também cai aqui, se for de produto nomeado", () => {
  assert.deepEqual(erros("A Prime 9 espetos está R$ 1.447,00."), ["R$ 1.447,00"]);
});

test("sem centavos, sem espaço, em lista", () => {
  assert.deepEqual(erros("Prime 11: R$1627\nPrime 9: R$1627"), ["R$1627"]);
});

test("o erro sai explicado", () => {
  const [e] = precosErradosDoProduto("A Prime 9 sai por R$ 1.627,00.", T);
  assert.equal(e.produto, "Churrasqueira Linha Prime 9 espetos");
  assert.deepEqual(e.esperado, [1517]);
});

// ── O que NÃO pode barrar (resposta certa) ───────────────────────────────────
test("preço certo passa, nas formas que a IA escreve", () => {
  for (const r of [
    "A Prime 9 sai por R$ 1.517,00.",
    "A churrasqueira Linha Prime 9 espetos custa R$ 1.517.",
    "Prime 9 espetos: R$ 1.517,00 😊",
    "A Tradição Gourmet sai R$ 4.517,00 e a Gourmet R$ 4.407,00.",
    "O trio padrão é a Prime 9 com Forno e Fogão de 3 bocas, por R$ 4.204,00.",
    "A Prime 9 + Fogão 3 bocas fica R$ 3.214,00.",
    "Temos a Popular Lisa de 55cm por R$ 857,00 e a de 65cm por R$ 977,00.",
    "A Bancada Gourmet sai R$ 2.307,00.",
  ]) assert.deepEqual(erros(r), [], r);
});

test("dois preços na mesma frase: cada um julga o seu trecho", () => {
  assert.deepEqual(erros("A Prime 9 sai R$ 1.517,00 e a Prime 11 sai R$ 1.627,00."), []);
  assert.deepEqual(erros("A Prime 9 sai R$ 1.517,00 e a Prime 11 sai R$ 1.517,00."), ["R$ 1.517,00"]);
});

test("valor calculado não é julgado como preço de produto", () => {
  for (const r of [
    "A Prime 9 sai R$ 1.517,00 e o frete para Canoas fica R$ 160,00.",
    "Prime 9 com montagem: total de R$ 1.817,00.",
    "Prime 9 à vista com desconto R$ 1.441,00.",
    "Prime 9 em 10x de R$ 151,70.",
  ]) assert.deepEqual(erros(r), [], r);
});

test("combinação que a tabela não tem: não julga", () => {
  // Não existe "Prime 11 + Fogão 3 bocas" nesta tabela — não dá para saber.
  assert.deepEqual(erros("A Prime 11 com Fogão 3 bocas sai R$ 3.324,00."), []);
});

test("frase sem produto da tabela: não julga (o grounding cuida)", () => {
  assert.deepEqual(erros("O orçamento ficou em R$ 2.000,00."), []);
  assert.deepEqual(erros("A lareira de canto sai R$ 3.000,00."), []);
});

test("a frase anterior não contamina a seguinte", () => {
  assert.deepEqual(erros("Gostei da Prime 9! O Forno Napoli sai R$ 1.637,00."), []);
});

test("tabela vazia ou rótulo sem valor: nada muda", () => {
  assert.deepEqual(precosErradosDoProduto("A Prime 9 sai R$ 9,00", lerTabelaPrecos({})), []);
  assert.deepEqual(precosErradosDoProduto("A Prime 9 sai R$ 9,00", lerTabelaPrecos({ base: [{ label: "Prime 9" }] })), []);
});

// ── Bateria de estresse com a tabela INTEIRA da JR (nov/2026) ────────────────
// Rótulos como "Prime Parrilla 105" e "Prime 9 + Fogão 3 bocas"; frases do jeito
// que a IA escreve. A 1ª versão desta trava acusou 15 de 83 preços CERTOS dos
// conjuntos ("9 esp. + Fogão 3 bocas" sem a palavra Prime) — esta bateria é o
// que impede aquilo de voltar.
const JR = lerTabelaPrecos({ base: TABELA_NOV.map((m) => ({ label: m.nome, amount: m.novo })) });
const errosJR = (r: string) => precosErradosDoProduto(r, JR).map((e) => e.disse);

test("JR: respostas certas não são barradas", () => {
  for (const r of [
    "Ótima escolha! A Prime 9 espetos sai por R$ 1.517,00 🔥 E se quiser com o fogão campeirinho, o conjunto fica R$ 2.684,00.",
    "A de 9 espetos com fogão de 3 bocas sai R$ 3.214,00.",
    "Pra família grande, a Prime 16 (105 cm) é top: R$ 2.097,00. A Prime 11 é R$ 1.627,00.",
    "O Forno Napoli avulso é R$ 1.637,00, e o Forno e Fogão de 3 bocas R$ 2.687,00.",
    "A Tradição sai R$ 3.947,00 e a Tradição Gourmet R$ 4.517,00. Já a Gourmet, com bifeteira a gás, R$ 4.407,00.",
    "Tradição Gourmet com Forno Napoli: R$ 6.154,00.",
    "A Gourmet com Forno e Fogão de 4 bocas fica R$ 7.664,00.",
    "Fica R$ 1.517,00 a churrasqueira + R$ 250,00 de frete, total R$ 1.767,00.",
    "Com a montagem, a Prime 9 sai R$ 1.817,00 no total.",
    "A Popular Tijolinho de 75cm é R$ 1.297,00 e a de 65cm R$ 1.197,00.",
    "A Parrilla de 105 cm sai R$ 3.757,00, e a de 81 cm R$ 3.107,00.",
    "Pia com cuba inox R$ 1.007,00; com cuba gourmet R$ 1.107,00.",
    "Prime 9 + Forno Napoli + Campeirinho = R$ 4.321,00",
    "Seu orçamento de R$ 2.000,00 dá pra Prime 16, que sai R$ 2.097,00 — fica um pouquinho acima.",
    "PRIME COM FOGÃO: 7 esp. + Campeirinho R$ 2.474; 9 esp. + Campeirinho R$ 2.684; 9 esp. + Fogão 3 bocas R$ 3.214; 11 esp. + Fogão 4 bocas R$ 3.934.",
  ]) assert.deepEqual(errosJR(r), [], r);
});

test("JR: erros reais e prováveis são barrados", () => {
  for (const r of [
    "A Prime 9 sai por R$ 1.627,00.",                                  // preço da Prime 11
    "A Gourmet fica R$ 4.517,00.",                                     // preço da Tradição Gourmet
    "O trio, Prime 9 com Forno e Fogão 3 bocas, sai R$ 4.004,00.",     // tabela velha
    "Prime 11 com Forno Napoli: R$ 3.734,00",                          // é o da 16 + Napoli
    "A Prime 16 sai R$ 1.997,00.",
    "A Tradição sai R$ 4.517,00.",
    "A Tradição Gourmet com Forno Napoli fica R$ 6.044,00.",
    "O Forno Napoli é R$ 1.557,00.",
    "A Parrilla de 105 cm sai R$ 3.107,00.",                           // sem dizer "Prime"
    "Prime 9 + Forno Napoli + Campeirinho = R$ 4.111,00",
  ]) assert.equal(errosJR(r).length, 1, r);
});
