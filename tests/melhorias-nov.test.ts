import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { perguntaJaFeita } from "../lib/ai-agent/naturalidade";
import { REGRAS_JR } from "../scripts/jr-roteador-regras";

// ── 1. Pergunta já feita ────────────────────────────────────────────────────
// "Você já esteve em nossa loja alguma vez ou é o primeiro contato conosco?"
// saiu DUAS vezes para o mesmo lead no fim de semana de 31/10. O corte de frase
// repetida olha só as últimas 6 respostas, e quando cortar deixaria a resposta
// vazia uma trava devolve o original.

const LOJA = "Você já esteve em nossa loja alguma vez ou é o primeiro contato conosco?";

test("pega a pergunta repetida — o caso real", () => {
  assert.equal(perguntaJaFeita(`Ótima escolha! ${LOJA}`, [`Prazer, Edison! ${LOJA}`]), LOJA);
});

test("pega mesmo reescrita com outras palavras", () => {
  // O modelo raramente repete literal; ele reescreve. Comparação exata só não
  // basta, por isso a semelhança de 80%.
  const quase = "Você já esteve em nossa loja alguma vez ou este é o primeiro contato conosco?";
  assert.ok(perguntaJaFeita(quase, [LOJA]), "variação mínima tem de contar como repetição");
});

test("olha a conversa INTEIRA, não uma janela", () => {
  // O defeito era justamente este: a janela de 6 deixava passar o que foi
  // perguntado no começo da conversa.
  const longe = ["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => `Mensagem ${x}.`);
  assert.equal(perguntaJaFeita(LOJA, [LOJA, ...longe]), LOJA);
});

test("pergunta curta pode repetir", () => {
  // "Qual seu nome?" se repete legitimamente em contextos diferentes. Tratar
  // como erro geraria nova tentativa à toa em todo turno.
  assert.equal(perguntaJaFeita("Qual seu nome?", ["Qual seu nome?"]), null);
});

test("pergunta nova passa", () => {
  assert.equal(perguntaJaFeita("Qual a cidade de entrega para o orçamento?", [LOJA]), null);
});

test("sem histórico não acusa", () => {
  assert.equal(perguntaJaFeita(LOJA, []), null);
  assert.equal(perguntaJaFeita(null, [LOJA]), null);
});

// ── 2. "Vendedor" sempre escala ─────────────────────────────────────────────
// Medido: o lead escreveu só "Vendedor" e a IA perguntou o nome dele. Dois
// turnos depois ele pediu "o link de pagamento", ela desviou, e ele sumiu.
// Na mesma bateria "Quero um vendedor" escalou — dependia da formulação.

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const regra = REGRAS_JR.find((r) => r.id === "pediu_humano")!;
const escala = (t: string) => {
  const s = semAcento(t);
  return new RegExp(regra.quando, "i").test(s) && !new RegExp(regra.excetoSe!, "i").test(s);
};

test("escalar é AÇÃO, não texto imposto", () => {
  // Impor uma frase não transfere ninguém. O que resolve é a ferramenta rodar.
  assert.equal(regra.garantirFerramenta, "escalar_humano");
  assert.equal(regra.responder, "");
});

test("pedido de gente escala, em qualquer formulação", () => {
  for (const t of ["Vendedor", "quero um vendedor", "Quero falar com um atendente",
                   "me passa pra um humano", "quero falar com alguém", "me liga por favor"]) {
    assert.ok(escala(t), `deveria escalar: "${t}"`);
  }
});

test("elogio e menção de passagem NÃO escalam", () => {
  // Sem a exceção, "o vendedor me atendeu bem" transferiria quem está satisfeito.
  for (const t of ["o vendedor me atendeu bem", "obrigado pelo atendimento do vendedor",
                   "Já estou em conversa com a Maria, prefiro falar com ela",
                   "já conversei com o vendedor de vocês", "valeu vendedor",
                   "Quero o link de pagamento", "quero uma churrasqueira"]) {
    assert.ok(!escala(t), `NÃO deveria escalar: "${t}"`);
  }
});

test('a exceção não usa \\b no fim', () => {
  // "obrigad\b" não casa "obrigado" — armadilha que a regra do fogão já
  // documenta e que fez este teste falhar na primeira tentativa.
  assert.doesNotMatch(regra.excetoSe!, /obrigad\)?\\\\b/, "\\b no fim quebra o prefixo");
});

// ── 3. O plantão mede abandono ──────────────────────────────────────────────
// Os 47% de leads que sumiram na saudação só apareceram porque fui procurar.
// Nenhum guardrail marca "o cliente parou de responder".
test("o plantão mede abandono por tipo de resposta", () => {
  const mon = readFileSync(join(process.cwd(), "scripts", "jr-monitor.ts"), "utf8");
  assert.match(mon, /abandono/i, "o plantão precisa medir abandono");
  assert.match(mon, /decision/, "abandono tem de ser quebrado por tipo de resposta");
});
