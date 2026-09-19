import { test } from "node:test";
import assert from "node:assert/strict";
import { PORTAL_UI_CSS, PORTAL_ACABAMENTO_CSS, PORTAL_TOQUE_CSS } from "../lib/portal-theme";

// ── O acabamento tem que chegar em todas as telas ────────────────────────────
// Cada página injeta PORTAL_UI_CSS. Se o acabamento sair de dentro dele, o
// desktop volta a ficar cru sem ninguém perceber.
test("o acabamento entra no CSS que as páginas carregam", () => {
  assert.ok(PORTAL_UI_CSS.includes(PORTAL_ACABAMENTO_CSS));
  assert.ok(PORTAL_UI_CSS.includes(PORTAL_TOQUE_CSS));
});

// ── Largura: o que estava errado no desktop ──────────────────────────────────
// Em 1440px sem limite a tabela joga o nome numa ponta e o número na outra.
test("o conteúdo tem limite de largura e fica centrado", () => {
  assert.match(PORTAL_UI_CSS, /\.p-wrap\{[^}]*max-width:\s*\d{3,4}px/);
  assert.match(PORTAL_UI_CSS, /\.p-wrap\{[^}]*margin-inline:\s*auto/);
});

// ── Hover não pode vazar para o toque ────────────────────────────────────────
// No celular hover "cola": o item fica preso aceso depois do toque.
test("todo hover está atrás de (hover:hover)", () => {
  // Recortar o bloco por regex não funciona: ele tem chaves aninhadas. Compara
  // posições — toda regra :hover tem que vir DEPOIS do @media que a protege.
  // Comentário não é regra: os comentários daqui EXPLICAM o hover e casariam.
  const css = PORTAL_ACABAMENTO_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const abre = css.indexOf("@media(hover:hover)");
  assert.ok(abre > 0, "o bloco de ponteiro fino sumiu");
  const fimCondicao = abre + "@media(hover:hover) and (pointer:fine)".length;
  for (let i = css.indexOf(":hover"); i !== -1; i = css.indexOf(":hover", i + 1)) {
    if (i >= abre && i <= fimCondicao) continue; // é a própria condição do media
    assert.ok(i > fimCondicao, `há :hover fora do bloco de ponteiro fino (posição ${i})`);
  }
});

// ── Movimento só na entrada ──────────────────────────────────────────────────
// Nada pode ficar parado em opacity:0 esperando scroll: a página precisa nascer
// legível, inclusive em print e em leitor de tela.
test("a animação de entrada termina visível (both), não fica esperando", () => {
  assert.match(PORTAL_ACABAMENTO_CSS, /animation:pfSobe[^;]*both/);
  // opacity:0 DENTRO de @keyframes é o começo da animação — legítimo. O que não
  // pode é um elemento parado em opacity:0 esperando scroll para aparecer.
  const semKeyframes = PORTAL_ACABAMENTO_CSS.replace(/@keyframes[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
  assert.doesNotMatch(semKeyframes, /opacity:\s*0\s*[;}]/, "elemento parado invisível");
});

test("o escalonamento para de crescer (ninguém espera a 12ª peça)", () => {
  assert.match(PORTAL_ACABAMENTO_CSS, /nth-of-type\(n\+6\)/);
});

// ── Movimento reduzido continua respeitado ───────────────────────────────────
test("prefers-reduced-motion zera tudo, com !important", () => {
  assert.match(PORTAL_TOQUE_CSS, /prefers-reduced-motion/);
  assert.match(PORTAL_TOQUE_CSS, /animation-duration:\.01ms!important/);
});

// ── Os dois temas ────────────────────────────────────────────────────────────
test("a sombra do painel é definida também no escuro", () => {
  assert.match(PORTAL_ACABAMENTO_CSS, /html\[data-pt="dark"\] \.p-panel\{box-shadow/);
});
