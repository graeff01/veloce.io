import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Texto que o LEAD escreve não pode quebrar a tela ─────────────────────────
// Um link de anúncio — `https://m.autocarro.com.br/boqueiraoveiculos/anuncio/
// volkswagen-t-cross-1-0-comfortline-12v-tsi-2020-prata/2036443` — não tem um
// espaço sequer. `white-space: pre-wrap` só quebra em lugares normais, então o
// texto saía do balão, criava rolagem lateral no chat e, com ela, sequestrava a
// rolagem vertical: em algumas conversas não dava para rolar.
//
// O conteúdo vem de fora e não dá para prever. A regra tem que estar na tela.

const fonte = readFileSync(join(process.cwd(), "components", "portal", "portal-conversations.tsx"), "utf8");
const linhas = fonte.split("\n");

test("todo texto de mensagem sabe quebrar palavra longa", () => {
  // Onde há `pre-wrap` há texto do lead. Cada um precisa de uma regra de quebra
  // por perto — no mesmo elemento.
  const semQuebra: number[] = [];
  linhas.forEach((l, i) => {
    if (!l.includes('whiteSpace: "pre-wrap"')) return;
    const janela = linhas.slice(i, i + 2).join(" ");
    if (!/overflowWrap|wordBreak/.test(janela)) semQuebra.push(i + 1);
  });
  assert.deepEqual(semQuebra, [],
    `texto sem regra de quebra nas linhas: ${semQuebra}`);
});

test("o balão pode encolher dentro da linha", () => {
  // `max-width` limita a CAIXA; sem `min-width: 0` o item de flex não encolhe
  // abaixo do conteúdo e empurra tudo, por mais max-width que se ponha.
  const bolha = fonte.slice(fonte.indexOf("<div data-bolha"));
  assert.match(bolha.slice(0, 400), /minWidth: 0/,
    "o balão precisa poder encolher");
});

test("o chat nunca rola para o lado", () => {
  // Rede de segurança: um elemento largo que escape no futuro é cortado em vez
  // de criar rolagem horizontal — que é o que travava a vertical no celular.
  const scroll = fonte.slice(fonte.indexOf("ref={scrollRef}"));
  assert.match(scroll.slice(0, 300), /overflowX: "hidden"/);
  assert.match(scroll.slice(0, 300), /minWidth: 0/);
});

test("a evidência do funil também quebra", () => {
  // Ela é um trecho da mensagem do lead — pode trazer a mesma URL.
  const i = fonte.indexOf("Por que nesta etapa");
  const trecho = fonte.slice(Math.max(0, i - 400), i);
  assert.match(trecho, /overflowWrap: "anywhere"/);
});
