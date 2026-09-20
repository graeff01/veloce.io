import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PORTAL_UI_CSS, PORTAL_ACABAMENTO_CSS, PORTAL_TOQUE_CSS } from "../lib/portal-theme";

// ── O acabamento tem que chegar em todas as telas ────────────────────────────
// Cada página injeta PORTAL_UI_CSS. Se o acabamento sair de dentro dele, o
// desktop volta a ficar cru sem ninguém perceber.
test("o acabamento entra no CSS que as páginas carregam", () => {
  assert.ok(PORTAL_UI_CSS.includes(PORTAL_ACABAMENTO_CSS));
  assert.ok(PORTAL_UI_CSS.includes(PORTAL_TOQUE_CSS));
});

// ── Largura: o cliente QUER a tela inteira ───────────────────────────────────
// Foi testado com max-width 1240 centrado e ele preferiu sem. Este teste existe
// para que ninguém "conserte" isso de novo achando que é esquecimento.
test("o painel ocupa a largura toda — sem max-width", () => {
  const wrap = /\.p-wrap\{([^}]*)\}/.exec(PORTAL_UI_CSS)?.[1] ?? "";
  assert.ok(wrap, ".p-wrap sumiu");
  assert.doesNotMatch(wrap, /max-width/, "voltou o limite de largura que o cliente recusou");
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
test("nada fica invisível esperando a animação rodar", () => {
  // `both` parecia o certo ("termina visível"), mas ele também faz o elemento
  // COMEÇAR no estado inicial — opacity 0 no painel, clip-path total na barra.
  // Se a animação não rodar, a peça some. Vi a barra sumir num quadro congelado.
  assert.doesNotMatch(PORTAL_ACABAMENTO_CSS, /animation:pf[A-Za-z]+[^;}]*\b(both|backwards)\b/,
    "alguma animação usa fill-mode que esconde a peça antes de rodar");
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

// ── Crase em comentário de CSS quebra o template literal ────────────────────
// Aconteceu TRÊS vezes nesta base. O TS vê a crase e fecha a string ali; o erro
// que aparece é longe do ponto ("Expected ; but found both"), e custa um ciclo
// inteiro para achar. Varre a fonte em vez de esperar o build reclamar.
test("nenhum comentário de CSS usa crase", () => {
  const fonte = readFileSync(join(import.meta.dirname, "..", "lib", "portal-theme.ts"), "utf8");
  const ofensas: string[] = [];
  for (const c of fonte.match(/\/\*[\s\S]*?\*\//g) ?? []) {
    if (c.includes("`")) ofensas.push(c.replace(/\s+/g, " ").slice(0, 88));
  }
  assert.deepEqual(ofensas, [], `crase em comentário fecha a string:\n  ${ofensas.join("\n  ")}`);
});

// ── As barras ────────────────────────────────────────────────────────────────
test("a barra tem entrada e brilho contínuo", () => {
  assert.match(PORTAL_ACABAMENTO_CSS, /@keyframes pfBarra/);
  assert.match(PORTAL_ACABAMENTO_CSS, /@keyframes pfBrilho/);
  assert.match(PORTAL_ACABAMENTO_CSS, /animation:pfBrilho[^;}]*infinite/);
});

test("o brilho atravessa a barra toda e não some no meio do caminho", () => {
  // Ia até 220%: o reflexo saía da peça em ~1/4 do ciclo e o resto era tempo
  // morto — nos quadros congelados não aparecia nada.
  const kf = /@keyframes pfBrilho\{([^}]*\}[^}]*)\}/.exec(PORTAL_ACABAMENTO_CSS)?.[1] ?? "";
  assert.ok(kf, "keyframe do brilho sumiu");
  assert.doesNotMatch(kf, /translateX\((1[1-9]\d|[2-9]\d\d)%\)/, "o brilho passa longe da barra");
});
