import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const tools = readFileSync(join(process.cwd(), "lib", "ai-agent", "tools.ts"), "utf8");

// ── Por que este teste existe (e por que é de invariante) ─────────────────────
//
// A causa-raiz do "pede licença e nunca envia" não era o modelo desobedecendo o
// prompt: eram DUAS instruções do próprio motor mandando pedir licença, contra a
// regra do customPrompt ("é PROIBIDO perguntar 'posso te mandar o PDF?'").
// Medido na JR (7–21/09/2026): 17 pedidos de permissão, e 12 chamadas de
// gerar_orcamento contra 4 de enviar_orcamento. O Cristofer disse "Sim" três
// vezes e nunca recebeu o PDF.
//
// A VALIDAÇÃO POR REPLAY NÃO ALCANÇA ISTO. Em `mode: "test"` o gerar_orcamento
// curto-circuita: devolve "Orçamento montado e PDF enviado ao lead" e emite o
// artefato do PDF ali mesmo, para o Console mostrar o documento. Ou seja, o
// caminho LIVE — o único em que a instrução aparece — nunca roda no replay, e o
// placar de enviar_orcamento numa simulação não diz nada sobre esta correção.
// Por isso ela é travada aqui, no texto que o motor entrega ao modelo.

test("o retorno LIVE do gerar_orcamento não manda pedir licença", () => {
  const live = /return \{ result: `Orçamento Nº \$\{number\} gerado[\s\S]*?\};/.exec(tools);
  assert.ok(live, "não achei o retorno live do gerar_orcamento");

  // Lookbehind: o texto CORRETO contém "NÃO pergunte se pode enviar", então um
  // doesNotMatch ingênuo em "pergunte se pode enviar" falha sobre a própria
  // correção. O que não pode voltar é a forma AFIRMATIVA.
  assert.doesNotMatch(live[0], /(?<!N[ÃA]O )pergunte se pode enviar/i,
    'era esta frase que produzia o "posso te enviar o PDF?" — não pode voltar');
  assert.match(live[0], /CHAME enviar_orcamento/,
    "o motor tem de mandar enviar, não oferecer");
  assert.match(live[0], /NÃO pergunte se pode enviar/i);
});

test("a descrição da ferramenta não ensina a pedir confirmação", () => {
  const desc = /name: "enviar_orcamento",[\s\S]{0,1200}?description: "([^"]+)"/.exec(tools);
  assert.ok(desc, "não achei a descrição do enviar_orcamento");

  assert.doesNotMatch(desc[1], /confirmar com o lead que pode enviar/i,
    "a descrição da tool mandava pedir confirmação — é metade da causa-raiz");
  assert.match(desc[1], /N[ÃA]O peça permissão/i);
});

// ── Fora de área: o preço do produto sai, o do frete não ──────────────────────
// Antes, cidade fora da área de entrega devolvia ZERO valor — o lead pedia preço
// e recebia um pedido de CPF. Caso real (Rosi, 08/09): escolheu a Popular Lisa
// 55 (R$ 817, preço de tabela), ouviu "me passa nome completo, CPF e CEP" e saiu
// da conversa. 14 dos 19 leads pediram preço; 12 não viram número.

test("fora da área, o preço dos produtos é informado antes de pedir dados", () => {
  const bloco = /const soProdutos = computeQuote\([\s\S]{0,1800}?\n          \}/.exec(tools);
  assert.ok(bloco, "não achei o bloco de fora-de-área");

  // Recomputa SEM montagem e SEM acesso: fora da área esses serviços não
  // existem, e `q` pode ter montagem embutida se o modelo passou montagem=true
  // (foi o que aconteceu com a Rosi, numa cidade onde a JR não monta).
  assert.match(bloco[0], /montagem: false/, "montagem não existe fora da área — não pode entrar no valor");
  assert.match(bloco[0], /access: undefined/, "acesso não existe fora da área");
  assert.match(bloco[0], /PREÇO DOS PRODUTOS/, "o valor tem de ser informado");
  assert.match(bloco[0], /ANTES de pedir qualquer dado/i, "o preço vem antes do CPF/CEP");
  assert.match(bloco[0], /Valor sem o frete/, "tem de ficar claro que falta o frete");
});

test("a trava de montagem via transportadora continua de pé", () => {
  // A correção acrescentou o preço ao MESMO retorno que carrega esta trava.
  // Se ela sair, a IA volta a poder prometer "entrega com montagem" onde a JR
  // não monta.
  assert.match(tools, /NÃO EXISTE entrega com MONTAGEM/);
  assert.match(tools, /NUNCA diga que há 'entrega com montagem via transportadora'/);
});
