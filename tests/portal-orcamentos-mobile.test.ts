import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const revisao = ler("components", "portal", "portal-revisao.tsx");
const quotes = ler("components", "portal", "portal-quotes.tsx");
// O CSS do card mora no TEMA, não no componente: `.p-wrap` é flex column e uma
// tag <style> dentro dela vira item do flex e estica o layout — foi assim que a
// primeira tentativa de conserto quebrou a tela inteira (print do usuário).
const tema = ler("lib", "portal-theme.ts");

// ── Orçamentos no celular: dois jeitos diferentes de estourar ────────────────
// Reportado com print de um iPhone (390px de largura), nas duas abas:
//
//   "A revisar" — o card inteiro mais largo que a tela: o valor saía como
//                 "R$ 4.117…", os preços das linhas cortados na direita e o
//                 botão aparecia como "Aprovar e env…".
//
//   "Enviados"  — o selo "Montado — não enviado" passava POR CIMA do valor, que
//                 aparecia cortado como "$ 2.227,00".
//
// São causas diferentes e cada uma tem seu teste.

test("a grade de revisão não pode exigir mais largura do que a tela tem", () => {
  // A causa do primeiro print: `minmax(480px, 1fr)` reserva 480px de MÍNIMO.
  // Numa tela de 390px não existe como caber, e o card vaza para fora.
  // `min(480px, 100%)` mantém as duas colunas no desktop e vira 100% no celular.
  const grade = /\.rcards\{([^}]*)\}/.exec(revisao)?.[1] ?? "";
  assert.ok(grade, ".rcards sumiu");
  assert.match(grade, /minmax\(min\(480px,\s*100%\),\s*1fr\)/,
    "sem o min(), a grade volta a pedir 480px numa tela de 390px");
  assert.doesNotMatch(grade, /minmax\(\s*\d+px\s*,/,
    "minmax com pixel fixo é exatamente o que estourava a tela");
});

test("no celular, aprovar ocupa a linha toda em vez de disputar espaço", () => {
  const mobile = /@media \(max-width: 560px\) \{([\s\S]*?)\n        \}/.exec(revisao)?.[1] ?? "";
  assert.ok(mobile, "o bloco de celular da revisão sumiu");
  assert.match(mobile, /\.rappr\{[^}]*width:100%/, "o botão principal precisa da linha inteira");
  assert.match(mobile, /\.rline span\{[^}]*text-overflow:ellipsis/, "o nome do item trunca, o preço não");
  assert.match(mobile, /\.rline b\{[^}]*flex-shrink:0/, "o preço da linha não pode encolher");
});

test("o valor do orçamento não pode ser espremido pelo selo de status", () => {
  // A causa do segundo print: o valor tinha `white-space: nowrap` SEM
  // `flex-shrink: 0`. Espremido a zero pelo flex, o texto vazava por baixo do
  // selo — que é longo ("Montado — não enviado").
  const val = /\.qval\{([^}]*)\}/.exec(tema)?.[1] ?? "";
  assert.ok(val, ".qval sumiu");
  assert.match(val, /flex-shrink:0/, "sem isto o valor volta a ser esmagado e a transbordar");
  assert.match(val, /white-space:nowrap/, "o valor não pode quebrar no meio");
});

test("o selo longo trunca em vez de empurrar o resto para fora", () => {
  const pill = /\.qpill\{([^}]*)\}/.exec(tema)?.[1] ?? "";
  assert.ok(pill, ".qpill sumiu");
  assert.match(pill, /text-overflow:ellipsis/);
  assert.match(pill, /min-width:0/, "sem min-width:0 o flex se recusa a encolher o selo");
  assert.match(quotes, /className="qpill"/, "o selo precisa receber a classe");
});

test("número e valor ficam na mesma linha, nas pontas", () => {
  // É o que se procura numa lista de orçamentos. Antes, o valor vinha depois do
  // bloco de texto e brigava por espaço com o selo.
  assert.match(quotes, /<b className="qnum">Nº \{quote\.number\}<\/b>/);
  assert.match(quotes, /<b className="qval">\{brl\(quote\.total, quote\.currency\)\}<\/b>/);
  const l1 = /\.qlinha1\{([^}]*)\}/.exec(tema)?.[1] ?? "";
  assert.match(l1, /display:flex/);
  assert.match(/\.qval\{([^}]*)\}/.exec(tema)?.[1] ?? "", /margin-left:auto/, "o valor vai para a ponta");
});

test("alvo de toque decente no celular", () => {
  // Botão de 34px é pequeno para o dedo; no celular vai a 38.
  const mobile = /@media\(max-width:560px\)\{([^\n]*)\}/.exec(tema)?.[1] ?? "";
  assert.ok(mobile, "o bloco de celular dos orçamentos sumiu");
  assert.match(mobile, /\.qbtn\{[^}]*width:38px/);
});

test("o componente não injeta <style> dentro de .p-wrap", () => {
  // Foi exatamente isto que quebrou a tela: `.p-wrap` é flex column, e a tag
  // <style> renderizada ali vira ITEM do flex — o card esticou até o fim da
  // tela. O CSS do portal mora em PORTAL_UI_CSS, que já chega em todas as telas.
  assert.doesNotMatch(quotes, /<style/, "o CSS do card pertence a lib/portal-theme.ts");
  assert.match(tema, /\.qcard\{/, "as regras do card têm de estar no tema");
});

// ── Card com uma TELA de altura: colisão de nome de classe ───────────────────
// O print que fechou o caso: um cartão vazio ocupando a tela inteira, e rolar
// levava ao PRÓXIMO cartão — todos esticados, não só o primeiro.
//
// A causa não estava no `.qcard`, e por isso duas correções nele não resolveram:
// o bloco de texto DENTRO do card se chamava `.qmain` — o mesmo nome que a
// `<main>` da tela de orçamentos. As folhas da página e da casca dão a `.qmain`
// `min-height:100dvh`, `padding-bottom:96px` e `margin-left:236px`. CSS não
// distingue a página do filho do card: cada cartão herdou uma tela de altura.
//
// O teste vale para a classe de erro, não para o caso: nome de casca é
// `<letra>main`, e nenhum desses pode virar classe de conteúdo.
test("nenhuma classe de conteúdo pode usar nome de CASCA (<x>main)", () => {
  const casca = new Set<string>();
  for (const arquivo of ["portal-shell.tsx", "portal-mobile-nav.tsx"]) {
    for (const m of ler("components", "portal", arquivo).matchAll(/\.([a-z]main)\b/g)) casca.add(m[1]);
  }
  assert.ok(casca.size >= 5, `esperava achar os nomes de casca, achei ${[...casca]}`);

  // 1) O tema não pode declarar regra para nome de casca...
  for (const nome of casca) {
    assert.doesNotMatch(tema, new RegExp(`\\.${nome}\\s*[{,]`),
      `PORTAL_UI_CSS declara .${nome}, que é nome de casca — a regra vaza para a página`);
  }
  // 2) ...e nenhum componente do portal pode marcar conteúdo com esse nome.
  for (const nome of casca) {
    assert.doesNotMatch(quotes, new RegExp(`className="${nome}"`),
      `o card usa .${nome} (nome de casca): herda min-height:100dvh e vira uma tela de altura`);
  }
});

test("o bloco de texto do card mantém o nome próprio", () => {
  assert.match(quotes, /className="qc-texto"/, "o card perdeu a classe do bloco de texto");
  assert.match(tema, /\.qc-texto\{[^}]*flex:1/, "sem flex:1 o texto não ocupa a largura restante");
});
