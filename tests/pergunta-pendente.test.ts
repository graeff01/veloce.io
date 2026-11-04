import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const orq = readFileSync(join(process.cwd(), "lib", "ai-agent", "orchestrator.ts"), "utf8");

// ── A pergunta que o lead traz junto com o "oi" ─────────────────────────────
// No 1º turno de quem tem saudação-que-pede-nome (JR), a saudação volta sem o
// modelo rodar. A pergunta do lead fica só no registro, e no 2º turno o modelo
// segue o roteiro e ela evapora.
//
// Caso real: "quais são os modelos de churrasqueiras disponíveis?" → "qual seu
// nome?" → "Mariza" → "você procura churrasqueira, fogão ou lareira?".
//
// Medido no fim de semana de 31/10: 32 dos 68 leads receberam só a saudação e
// nunca mais voltaram.
//
// A SAUDAÇÃO NÃO MUDA. A loja quer a apresentação e o aviso como estão.

const bloco = /let perguntaPendente = "";([\s\S]*?)\n  \/\/ Saudação na 1ª mensagem/.exec(orq)?.[1] ?? "";

test("a pergunta pendente é levada para o turno seguinte", () => {
  assert.ok(bloco, "o bloco da pergunta pendente sumiu");
  assert.match(orq, /perguntaPendente \|\| ""/, "precisa entrar no contexto dinâmico");
  assert.match(bloco, /RESPONDA ISSO AGORA/, "não basta mostrar: tem de mandar responder");
});

test("só vale quando o turno anterior foi a saudação curto-circuitada", () => {
  // Se o modelo JÁ rodou naquele turno, ele viu a mensagem. Repetir seria ruído
  // e faria a IA responder duas vezes a mesma coisa.
  assert.match(bloco, /decision === "saudacao"/, "a guarda do turno anterior sumiu");
  assert.match(bloco, /orderBy: \{ createdAt: "desc" \}/, "tem de ser o turno IMEDIATAMENTE anterior");
});

test("um 'oi' não conta como pergunta pendente", () => {
  // Sem isto, todo lead que abre com "oi" carregaria um bloco inútil no prompt
  // mandando responder "oi" — ruído em todo turno 2.
  assert.match(bloco, /sóCumprimento/, "falta descartar cumprimento puro");
  assert.match(bloco, /bom dia\|boa tarde\|boa noite/, "a lista de cumprimentos sumiu");
});

test("mensagem sem conteúdo entregue não conta", () => {
  // O webhook grava "[O lead enviou uma imagem]" e afins. Mandar a IA
  // "responder" isso produz resposta sobre um conteúdo que ela não tem.
  assert.match(bloco, /semConteudo/, "falta descartar placeholder do WhatsApp");
  assert.match(bloco, /\/\^\\\[\//, "o teste de colchete inicial sumiu");
});

test("não roda em modo teste nem no primeiro turno", () => {
  // `turns > 0` porque no 1º turno não existe anterior. `mode === "live"` porque
  // a simulação não tem histórico no banco.
  assert.match(bloco, /mode === "live" && turns > 0/,
    "sem essas duas guardas, a consulta roda à toa (ou quebra no replay)");
});

test("a saudação em si continua intocada", () => {
  // O pedido da loja é manter a apresentação, o aviso de teste e a pergunta do
  // nome. Este conserto não encosta nisso — e um teste registra a promessa.
  assert.match(orq, /if \(isFirst && disclosureText && cfg\?\.customPrompt\?\.trim\(\)/,
    "o curto-circuito da saudação não pode ser removido por este conserto");
});
