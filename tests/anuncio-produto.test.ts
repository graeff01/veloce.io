import { test } from "node:test";
import assert from "node:assert/strict";
import { produtoDoAnuncio, tokensDistintivos } from "../lib/ai-agent/anuncio-produto";

// O contexto injeta no prompt, com toda a confiança: "VEÍCULO DE INTERESSE (o
// lead entrou por ESTE anúncio): <item>" — e o prompt manda mandar a FOTO e o
// PREÇO desse item quando o lead só sinaliza interesse. O item vinha do PRIMEIRO
// resultado de uma busca fuzzy, sem conferir se era o mesmo produto.
//
// Os três casos abaixo foram medidos em PRODUÇÃO em 23/09/2026.

test("Taos Highline não pode virar T-Cross Highline", () => {
  // Boqueirão, caso real. O prompt automotivo proíbe isto em caixa alta
  // ("Tera ≠ Taos, Nivus ≠ Virtus"), e era o MOTOR que fazia a troca.
  const achados = [
    { title: "Volkswagen T-cross 1.4 HIGHLINE TSI 16V 2021" },
    { title: "Volkswagen Taos 1.4 Highline TSI 2022" },
  ];
  const r = produtoDoAnuncio("Taos Highline", achados);
  assert.ok(r, "deveria achar a Taos");
  assert.match(r!.title, /Taos/, "pegou o carro errado");
  assert.doesNotMatch(r!.title, /T-cross/i);
});

test("sem a Taos no catálogo, não injeta nada em vez de injetar o parecido", () => {
  const r = produtoDoAnuncio("Taos Highline", [{ title: "Volkswagen T-cross 1.4 HIGHLINE TSI 16V 2021" }]);
  assert.equal(r, null, "melhor nada do que o carro errado");
});

test("anúncio institucional não escolhe produto", () => {
  // JR: 191 dos 200 leads vêm deste título, e ele injetava uma Parrilla 81x60.
  const catalogo = [
    { title: "Churrasqueira Parrilla 81x60" },
    { title: "Churrasqueira Gourmet" },
    { title: "Churrasqueira Linha Prime 7 espetos" },
  ];
  assert.equal(produtoDoAnuncio("JR Churrasqueiras Pre moldadas", catalogo), null);
});

test("origem sem produto nenhum não escolhe produto", () => {
  // "fb.com" injetava "Pia Simples com Cuba Inox".
  assert.equal(produtoDoAnuncio("fb.com", [{ title: "Pia Simples com Cuba Inox" }]), null);
  assert.equal(produtoDoAnuncio("Anúncio no Status", [{ title: "Churrasqueira Gourmet" }]), null);
});

test("o caso legítimo continua funcionando", () => {
  // Quando o anúncio nomeia o produto e o catálogo tem, injeta normalmente.
  assert.match(produtoDoAnuncio("Churrasqueira Gourmet", [{ title: "Churrasqueira Gourmet" }])!.title, /Gourmet/);
  assert.match(produtoDoAnuncio("Gourmet Supreme", [{ title: "Churrasqueira Gourmet" }, { title: "Churrasqueira Gourmet Supreme" }])!.title, /Supreme/);
});

test("palavra de campanha e conversa capturada não exigem casamento", () => {
  // O extrator de adModel às vezes leva conversa junto ("Taos Highline. Bom dia
  // qual o ano"). As palavras funcionais não podem impedir o match do modelo.
  const r = produtoDoAnuncio("Taos Highline - Teu SUV premium tá aqui!", [{ title: "Volkswagen Taos 1.4 Highline 2022" }]);
  assert.ok(r, "palavra de campanha não pode barrar o modelo certo");
});

test("tokensDistintivos descarta marca de campanha e mantém modelo", () => {
  assert.deepEqual(tokensDistintivos("fb.com"), []);
  assert.deepEqual(tokensDistintivos("Anúncio no Status"), []);
  assert.ok(tokensDistintivos("Taos Highline").includes("taos"));
  assert.ok(!tokensDistintivos("Taos Highline promoção nova").includes("promocao"));
});

test("sem itens, ou termo vazio, devolve null sem explodir", () => {
  assert.equal(produtoDoAnuncio("Taos", []), null);
  assert.equal(produtoDoAnuncio("", [{ title: "x" }]), null);
});
