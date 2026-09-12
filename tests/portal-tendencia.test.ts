import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── O sentido da tendência ───────────────────────────────────────────────────
// A armadilha mais fácil desta tela: em TEMPO, cair é melhorar. Usar o verde de
// "subiu" para um tempo que subiu diria exatamente o contrário do que aconteceu
// — e a gestora comemoraria uma piora.

const tela = readFileSync(join(process.cwd(), "components", "portal", "portal-team.tsx"), "utf8");

test("tempo que CAIU é ganho, não perda", () => {
  const bloco = tela.slice(tela.indexOf("const tendencia ="), tela.indexOf("const rota ="));
  assert.match(bloco, /dif < 0[\s\S]{0,120}mais rápido/, "diminuir o tempo tem que ser lido como melhora");
  assert.match(bloco, /mais rápido[\s\S]{0,80}"up"/, "e pintado com o tom de melhora");
  assert.match(bloco, /mais lento[\s\S]{0,80}"down"/, "aumentar o tempo é piora");
});

test("sem base de comparação, não inventa número", () => {
  const bloco = tela.slice(tela.indexOf("const tendencia ="), tela.indexOf("const rota ="));
  assert.match(bloco, /antes == null[\s\S]{0,40}return null/,
    "cliente novo não pode ver '0%' e achar que está estável");
});

test("a cor nunca é o único sinal", () => {
  // Status colorido sozinho exclui quem não distingue as cores — e some na
  // impressão. A palavra vai junto, sempre.
  assert.match(tela, /p-chip \$\{tendencia\.classe\}`\}>\{tendencia\.texto\}/,
    "o chip carrega o texto, não só a classe de cor");
  assert.match(tela, /1ª resposta \{f\.rotulo\}/, "a legenda do gráfico diz o que cada cor significa");
  assert.match(tela, /aria-label=\{descricao\}/, "cada barra descreve seus números para quem não vê a cor");
});

test("duas variáveis diferentes, não a mesma duas vezes", () => {
  // Altura = leads; cor = tempo de resposta. Pintar a barra conforme a própria
  // altura gastaria o único canal livre repetindo o que a altura já diz.
  assert.match(tela, /ALTURA = quantos leads/, "a intenção fica registrada no código");
  assert.match(tela, /faixaDe\(h\.primeiraRespostaSec\)/, "a cor vem do TEMPO, não do volume");
});
