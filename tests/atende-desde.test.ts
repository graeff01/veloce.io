import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const respond = readFileSync(join(process.cwd(), "lib", "ai-agent", "respond.ts"), "utf8");
const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

// ── Corte por data: "só os leads que chegarem a partir de hoje" ──────────────
// Pedido da JR ao ligar o automático num sábado, com a equipe voltando só na
// terça: a IA devia pegar os leads NOVOS e não encostar nos 2.623 contatos que
// já estavam na base.
//
// Sem isto, trocar answerMode para "always" faria a IA responder qualquer lead
// antigo que voltasse a escrever — que é exatamente o que a Maria não quer.

test("a configuração tem o campo, e ele é opcional", () => {
  // Opcional de propósito: cliente sem a regra atende todo mundo, como antes.
  // Se virasse obrigatório com default, mudaria o comportamento de quem já roda.
  assert.match(schema, /atendeDesde\s+DateTime\?/,
    "sem o campo opcional, clientes existentes mudariam de comportamento");
});

test("o corte compara a chegada do CONTATO, não a mensagem de agora", () => {
  // A distinção é o coração da regra. Comparar com a mensagem atual faria todo
  // lead antigo virar "novo" no instante em que escrevesse — o oposto do pedido.
  assert.match(respond, /cfg\?\.atendeDesde && contact\.createdAt < cfg\.atendeDesde/,
    "o corte tem de olhar contact.createdAt");
  assert.match(respond, /select: \{[^}]*createdAt: true[^}]*\}/,
    "sem createdAt no select, o campo chega indefinido e o corte nunca aplica");
});

test("lead antigo vira AVISO para humano, não silêncio", () => {
  // O risco de uma regra de corte é o lead sumir: a IA não atende e ninguém
  // fica sabendo. Aqui ele segue o mesmo caminho de quando a IA está fora do ar.
  const bloco = /atendeDesde && contact\.createdAt < cfg\.atendeDesde\) \{([\s\S]*?)\n  \}/.exec(respond)?.[1] ?? "";
  assert.ok(bloco, "bloco do corte sumiu");
  assert.match(bloco, /avisarHumanoDeVez/, "lead antigo não pode ser descartado em silêncio");
  assert.match(bloco, /return "skipped"/);
});

test("o corte vem DEPOIS do gatekeeper e ANTES do canário", () => {
  // Ordem importa. Antes do gatekeeper, gastaria trabalho com a IA desligada.
  // Depois do canário, um número de teste antigo passaria a ser atendido.
  const iGate = respond.indexOf("const gate = shouldRespond");
  const iCorte = respond.indexOf("cfg?.atendeDesde && contact.createdAt");
  const iCanario = respond.indexOf("if (cfg?.testMode)");
  assert.ok(iGate > 0 && iCorte > 0 && iCanario > 0, "âncoras não encontradas");
  assert.ok(iGate < iCorte, "o corte não pode rodar antes do gatekeeper");
  assert.ok(iCorte < iCanario, "o corte tem de valer também para número de teste");
});

test("sem a regra configurada, nada muda", () => {
  // `cfg?.atendeDesde &&` curto-circuita quando o campo é nulo. É o que garante
  // que Boqueirão e os outros sigam exatamente como hoje.
  assert.match(respond, /if \(cfg\?\.atendeDesde &&/,
    "a guarda precisa curto-circuitar em nulo, senão quebra quem não usa a regra");
});

// ── O furo: o cron de auto-resposta não passava pelo corte ───────────────────
// `autoReplyStalled` chama runAgent DIRETO — não passa por handleInbound, onde
// o corte mora. Ele confere canário, opt-out, silenciado e bloqueio global, mas
// a data ficou de fora.
//
// Medido em 03/11, pelo plantão, no primeiro uso do sinal novo: dois leads
// antigos (criados em 25/07 e 10/09) foram atendidos em 02/11 e 03/11 — depois
// de a JR pedir "só os que chegarem de hoje". Nada mais olhava para isso.
test("o cron de auto-resposta também respeita o corte", () => {
  const cron = /export async function autoReplyStalled[\s\S]*?\n\}/.exec(respond)?.[0] ?? "";
  assert.ok(cron, "a função autoReplyStalled sumiu");
  assert.match(cron, /cfg\.atendeDesde && contact\.createdAt < cfg\.atendeDesde/,
    "sem esta guarda o cron atende lead antigo pelas costas do corte");
});

test("o cron carrega os campos que a guarda precisa", () => {
  // Guarda sem o dado no select vira `undefined < undefined` — passa batido e
  // dá falsa sensação de estar protegido.
  const cron = /export async function autoReplyStalled[\s\S]*?\n\}/.exec(respond)?.[0] ?? "";
  assert.match(cron, /atendeDesde: true/, "cfg precisa trazer atendeDesde");
  assert.match(cron, /createdAt: true/, "o contato precisa trazer createdAt");
});

test("as duas portas de entrada têm a mesma guarda", () => {
  // handleInbound e autoReplyStalled são os dois caminhos que chegam ao motor.
  // Se um tiver o corte e o outro não, a regra vale pela metade — que é
  // exatamente o defeito que isto conserta.
  const ocorrencias = (respond.match(/atendeDesde && contact\.createdAt < cfg\??\.atendeDesde/g) ?? []).length;
  assert.equal(ocorrencias, 2, `o corte tem de existir nas DUAS entradas, achei ${ocorrencias}`);
});
