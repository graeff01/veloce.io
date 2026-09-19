import { test } from "node:test";
import assert from "node:assert/strict";
import { lerRegras, decidir } from "../lib/ai-agent/roteador";

// As regras reais da JR, como vão para PricingConfig.rules.roteador.
const PERGUNTA = "{nome}, só pra eu te mostrar o certo: o fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?";

const REGRAS = lerRegras({ roteador: [{
  id: "fogao_ambiguo",
  // pede churrasqueira + fogão…
  quando: "(churrasqueir|prime|gourmet|tradicao|parrilla|popular)[^.!?]{0,60}(fogao|campeir)|(fogao|campeir)[^.!?]{0,60}churrasqueir",
  // …sem dizer QUAL. Se disse, não se pergunta o que ele já respondeu.
  // Sem \b no FIM: "embutid\b" não casa "embutido" (vem um "o" depois).
  excetoSe: "\\b(\\d\\s*bocas?|campeirinho|embutid|acoplad|integrad|dentro d(a churrasqueira|ela|o forno)|por dentro|bifeteira|a gas|lado aberto|em balanco|do lado|ao lado|separad|largura|altura|profundidade|medida|\\bcano\\b|duto|chamine|peso|bucha|parafuso|chapa|grelha|espessura|quantos espetos)",
  sóSeInédito: "embutido na propria churrasqueira",
  responder: PERGUNTA,
}] });

test("as regras carregam", () => assert.equal(REGRAS.length, 1));

// ── O caso A: a falha medida em 19/09 ────────────────────────────────────────
// "churrasqueira com fogão a lenha" é a forma MAIS comum no tráfego real e a
// IA não perguntava — assumia embutido. Lenha existe nos dois tipos.
test("A · 'fogão a lenha' dispara a pergunta (antes não disparava)", () => {
  const d = decidir(REGRAS, "quero uma churrasqueira com fogão a lenha", [], "Ana");
  assert.ok(d, "não disparou");
  assert.equal(d!.id, "fogao_ambiguo");
  assert.match(d!.texto, /Ana, só pra eu te mostrar o certo/);
  assert.match(d!.texto, /embutido.*Fogão Campeiro separado/);
});

// ── O caso D: a regressão que eu mesmo criei ─────────────────────────────────
// "4 bocas" é especificação de Fogão Campeiro. Perguntar o que o cliente acabou
// de dizer irrita e gasta turno.
test("D · 'gourmet com fogão 4 bocas' NÃO dispara — ele já disse", () => {
  assert.equal(decidir(REGRAS, "quero a gourmet com fogão 4 bocas", [], "Diego"), null);
});

const JA_DISSE = [
  "quero a prime 9 com fogão 3 bocas",
  "churrasqueira com fogão campeirinho",
  "quero o fogão campeiro separado, do lado",
  "quero uma churrasqueira com fogão embutido",
  "a churrasqueira com o fogão dentro dela",
  "o modelo com fogão a gas",
  "quero a que tem bifeteira",
  "churrasqueira de lado aberto com fogão",
];
test("não pergunta a quem já especificou", () => {
  for (const f of JA_DISSE) assert.equal(decidir(REGRAS, f, [], "X"), null, `perguntou indevidamente: ${f}`);
});

// ── Não perguntar duas vezes seria trocar um erro por outro ──────────────────
test("não repete a pergunta se ela já saiu na conversa", () => {
  const jaDita = ["Ana, só pra eu te mostrar o certo: o fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?"];
  assert.equal(decidir(REGRAS, "quero uma churrasqueira com fogão a lenha", jaDita, "Ana"), null);
});

// ── Falso positivo cala atendimento bom: o risco caro ────────────────────────
const NAO_PODE_DISPARAR = [
  "quero uma churrasqueira",
  "qual o valor da prime 9?",
  "vocês têm lareira?",
  "quanto fica o frete pra Canoas?",
  "quero ver só os fogões campeiros",   // é fogão avulso, não churrasqueira+fogão
  "bom dia",
  "obrigado!",
  "tem churrasqueira de 74cm?",
  // Medidos em tráfego real: pergunta TÉCNICA que menciona os dois. O lead quer
  // resposta, não uma pergunta de volta — o prompt já dizia "NUNCA ignore a
  // pergunta do cliente pra forçar a de loja", e aqui vale igual.
  "Oii qual a largura dessa churrasqueira com o fogão?",
  "Cano para churrasqueira e fogão a lenha",
  "o duto da parte de dentro da churrasqueira onde pega o fogão pode ser preto?",
];
test("não dispara em conversa que não é pedido de conjunto", () => {
  for (const f of NAO_PODE_DISPARAR) assert.equal(decidir(REGRAS, f, [], "X"), null, `disparou à toa: ${f}`);
});

// ── Robustez: regra torta não pode derrubar o turno ──────────────────────────
test("descarta regra malformada sem quebrar", () => {
  const r = lerRegras({ roteador: [
    { id: "ok", quando: "teste", responder: "vale" },
    { id: "", quando: "x", responder: "sem id" },
    { id: "sem_quando", responder: "x" },
    { id: "regex_torto", quando: "([", responder: "x" },
    { id: "ok", quando: "dup", responder: "duplicada" },
    null, 42,
  ] });
  assert.deepEqual(r.map((x) => x.id), ["ok"]);
});

test("rules ausente/estranha devolve lista vazia", () => {
  for (const x of [null, undefined, {}, { roteador: "nao e lista" }, 7]) assert.deepEqual(lerRegras(x), []);
});

test("sem nome, não escreve 'undefined' na cara do cliente", () => {
  const d = decidir(REGRAS, "quero churrasqueira com fogão a lenha", [], null);
  assert.ok(d);
  assert.doesNotMatch(d!.texto, /undefined|\{nome\}/);
  assert.match(d!.texto, /^Só pra eu te mostrar/);
});

// ── O outro lado: impedir a pergunta fora de hora ────────────────────────────
// Impor cobre "tem que dizer X". Metade dos erros é "não pode dizer X": em
// 19/09, com "gourmet com fogão 4 bocas" a regra corretamente NÃO disparou e o
// modelo perguntou assim mesmo.
import { suprimir } from "../lib/ai-agent/roteador";

const COM_ASSINATURA = lerRegras({ roteador: [{
  id: "fogao_ambiguo",
  quando: "(churrasqueir|prime|gourmet|tradicao|parrilla|popular)[^.!?]{0,60}(fogao|campeir)|(fogao|campeir)[^.!?]{0,60}churrasqueir",
  excetoSe: "\\b(\\d\\s*bocas?|campeirinho|embutid|acoplad|integrad|dentro d(a churrasqueira|ela|o forno)|por dentro|bifeteira|a gas|lado aberto|em balanco|do lado|ao lado|separad|largura|altura|profundidade|medida|\\bcano\\b|duto|chamine|peso|bucha|parafuso|chapa|grelha|espessura|quantos espetos)",
  sóSeInédito: "embutido na propria churrasqueira",
  responder: "{nome}, o fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?",
  assinatura: "embutid[^.?!]{0,90}(separad|do lado|ao lado|campeir)|campeir[^.?!]{0,90}embutid",
}] });

test("D · corta a pergunta quando o cliente JÁ especificou (o caso real)", () => {
  const resposta = "Ótima escolha, Diego! O fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?";
  const s = suprimir(COM_ASSINATURA, "quero a gourmet com fogão 4 bocas", resposta);
  assert.ok(s, "não suprimiu");
  assert.equal(s!.removidas.length, 1);
  assert.doesNotMatch(s!.texto, /embutido na própria churrasqueira/i);
  assert.match(s!.texto, /Ótima escolha, Diego/);
});

test("não corta quando a pergunta é legítima (cliente NÃO especificou)", () => {
  const resposta = "O fogão você quer embutido na própria churrasqueira, ou um Fogão Campeiro separado, do lado dela?";
  assert.equal(suprimir(COM_ASSINATURA, "quero uma churrasqueira com fogão", resposta), null);
});

test("não encosta em resposta de outro assunto", () => {
  for (const [inb, rep] of [
    ["quanto custa a prime 9?", "A Prime 9 custa R$ 1.447 e tem 74 cm de largura."],
    ["vocês entregam em Canoas?", "Entregamos sim! O frete para Canoas fica R$ 250."],
    ["quero a gourmet com fogão 4 bocas", "Ótima escolha! Já te mando a foto desse conjunto."],
  ] as [string, string][]) {
    assert.equal(suprimir(COM_ASSINATURA, inb, rep), null, `mexeu indevidamente: ${rep}`);
  }
});

// O parser esquecia de copiar `assinatura`: o campo existia na interface e no
// dado gravado, e sumia na leitura — a supressão nunca rodava, em silêncio.
test("lerRegras não perde nenhum campo da regra", () => {
  const completa = { id: "x", quando: "a", excetoSe: "b", sóSeInédito: "c", responder: "d", assinatura: "e", garantirFerramenta: "enviar_foto" };
  const [lida] = lerRegras({ roteador: [completa] });
  assert.deepEqual(lida, completa, "algum campo se perdeu na leitura");
});

test("assinatura com regex inválida descarta a regra, não quebra o turno", () => {
  assert.deepEqual(lerRegras({ roteador: [{ id: "x", quando: "a", responder: "b", assinatura: "([" }] }), []);
});

// ── Garantir a FERRAMENTA: o que mais custa venda ────────────────────────────
// Medido em 19/09: o cliente nomeia o modelo, o prompt usa LITERALMENTE esse
// exemplo na regra que manda mandar a foto, e a foto não sai.
import { garantir } from "../lib/ai-agent/roteador";
import { REGRAS_JR } from "../scripts/jr-roteador-regras";

const JR = lerRegras({ roteador: REGRAS_JR });

test("as regras da JR carregam todas", () => {
  assert.deepEqual(JR.map((r) => r.id), ["fogao_ambiguo", "modelo_nomeado_sem_foto"]);
});

test("modelo nomeado sem foto → garante enviar_foto com o termo certo", () => {
  const g = garantir(JR, "quero a gourmet com fogão 4 bocas", []);
  assert.ok(g, "não garantiu");
  assert.equal(g!.ferramenta, "enviar_foto");
  assert.match(g!.termo, /gourmet/);
});

test("não garante de novo se a foto já foi nesse turno", () => {
  assert.equal(garantir(JR, "quero a gourmet com fogão 4 bocas", ["enviar_foto"]), null);
});

test("pergunta sobre DADO não vira foto — ele quer resposta", () => {
  for (const f of [
    "qual a largura da prime 9?",
    "quanto custa a gourmet?",
    "qual o valor da tradição?",
    "a parrilla 105 cabe em 2,40 de pé direito?",
    "me manda o catálogo da gourmet",
    "qual o frete da prime 16 pra Canoas?",
  ]) assert.equal(garantir(JR, f, []), null, `garantiu foto indevidamente: ${f}`);
});

test("sem modelo nomeado não garante nada", () => {
  for (const f of ["quero uma churrasqueira", "bom dia", "vocês entregam?"])
    assert.equal(garantir(JR, f, []), null, `garantiu à toa: ${f}`);
});
