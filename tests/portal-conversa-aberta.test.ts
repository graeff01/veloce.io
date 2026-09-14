import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Dentro da conversa, no celular, o portal sai da frente ───────────────────
// A tela da conversa tem o SEU cabeçalho (voltar, nome do lead, ações) e o SEU
// compositor. Somados aos do portal viravam dois cabeçalhos empilhados e uma
// barra de atalhos flutuando por cima do campo de escrever — com o botão de
// enviar atrás dela. O usuário relatou isso duas vezes.
//
// São TRÊS peças em arquivos diferentes e só funcionam juntas: quem marca, e os
// dois que obedecem. Esta regra já se perdeu uma vez num squash de branch, e
// nada acusou — por isso o teste.

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

const conversas = ler("components", "portal", "portal-conversations.tsx");
const barra = ler("components", "portal", "portal-mobile-nav.tsx");
const cabecalho = ler("components", "portal", "portal-mobile-header.tsx");

test("a conversa aberta se anuncia no <html>", () => {
  // No <html> porque quem precisa sumir são componentes IRMÃOS, montados pela
  // página, fora da árvore da conversa.
  assert.match(conversas, /setAttribute\("data-conversa-aberta", "1"\)/);
  assert.match(conversas, /const dentro = isMobile && !!sel/,
    "só no celular e só com conversa selecionada — no computador as duas colunas convivem");
});

test("a marca é retirada ao sair", () => {
  // Sair com ela posta deixaria a PRÓXIMA página sem cabeçalho e sem barra.
  const bloco = conversas.slice(conversas.indexOf("data-conversa-aberta"));
  assert.match(bloco.slice(0, 900), /return \(\) => html\.removeAttribute\("data-conversa-aberta"\)/,
    "a limpeza tem que rodar ao desmontar, não só no else");
});

test("a barra inferior obedece", () => {
  assert.match(barra, /html\[data-conversa-aberta="1"\] \.pmobnav\{display:none\}/,
    "sem isto ela fica exatamente por cima do compositor");
});

test("o cabeçalho do portal obedece", () => {
  assert.match(cabecalho, /html\[data-conversa-aberta="1"\] \.pmhead\{display:none\}/,
    "sem isto ficam dois cabeçalhos empilhados");
});

test("o vão reservado para a barra some junto com ela", () => {
  // A lista reserva ~96px embaixo para a última conversa não ficar atrás da
  // barra. Com a barra escondida, o vão vira uma faixa morta acima do campo de
  // escrever — o tipo de detalhe que faz a tela parecer quebrada.
  assert.match(conversas, /temBarra && !\(isMobile && sel\)/,
    "o padding de compensação precisa considerar a conversa aberta");
  assert.match(barra, /html\[data-conversa-aberta="1"\] \.pmain\{padding-bottom:0\}/);
});
