import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGrounding, medidasEmCm } from "../lib/ai-agent/grounding";

// ── Medida errada custa igual a preço errado ─────────────────────────────────
// O cliente compra pensando que cabe. Visto em simulação com conversa real da
// JR: perguntada sobre o tamanho da Prime 7, a IA respondeu "70 cm" — deduziu
// do NOME do modelo (7 espetos). A largura real é 60. Ela só corrigiu depois
// que o próprio cliente corrigiu.

test("a mesma medida escrita de três jeitos é a mesma medida", () => {
  // O cadastro usa "2,20 m", "2,20m" e "220 cm" — sem normalizar, a conferência
  // acusaria falso alarme em todo lugar.
  const a = medidasEmCm("altura de 2,20 m");
  const b = medidasEmCm("altura de 220 cm");
  const c = medidasEmCm("altura de 2,20m");
  assert.ok(a.has("220") && b.has("220") && c.has("220"));
});

test("medida que está na fonte não vira aviso", () => {
  const r = checkGrounding("A Prime 9 tem 74 cm de largura.", "Linha Prime 9 espetos: 74x60x2,30m");
  assert.deepEqual(r.medidaWarnings, []);
});

test("medida inventada é apontada", () => {
  // O caso real: 70 cm deduzido de "7 espetos".
  const r = checkGrounding("A Prime 7 tem 70 cm de largura.", "Linha Prime 7 espetos: 60x60x2,20m");
  assert.ok(r.medidaWarnings.includes("70cm"));
});

test("a tabela oficial dispensa a fonte do turno", () => {
  // O acervo INTEIRO do cliente é verdade, não só os 3 blocos que a busca
  // trouxe naquele turno.
  const oficiais = medidasEmCm("Prime 7: 60x60x2,20m. Parrilla 81: 81x60x2,40m.");
  const r = checkGrounding("A Parrilla 81 tem 240 cm de altura.", "conversa sem medidas", undefined, oficiais);
  assert.deepEqual(r.medidaWarnings, []);
});

test("medida que o LEAD deu não é invenção nossa", () => {
  // A conversa entra nas fontes justamente para isso.
  const r = checkGrounding("Com 2,83 m de pé-direito cabe tranquilo.",
    "lead: Tenho uma cobertura de policarbonato com 2,83m.");
  assert.deepEqual(r.medidaWarnings, []);
});

test("medida é AVISO, nunca abstenção", () => {
  // Abstenção indevida cala o atendimento — já se mostrou pior que o problema
  // que vinha resolver. Medir primeiro, endurecer depois.
  const r = checkGrounding("Tem 999 cm de largura.", "sem medidas aqui");
  assert.equal(r.grounded, true, "medida não pode derrubar a resposta");
  assert.ok(r.medidaWarnings.length > 0, "mas fica registrada");
});

test("preço continua abstendo, como antes", () => {
  const r = checkGrounding("Sai por R$ 999,00.", "sem preços aqui");
  assert.equal(r.grounded, false);
});

test("não confunde número solto com medida", () => {
  const s = medidasEmCm("temos 7 espetos e 3 bocas");
  assert.equal(s.size, 0, "sem unidade não é medida");
});

// ── Medida atribuída ao produto ────────────────────────────────────────────
// Descoberto reproduzindo a conversa do Henrique contra o motor corrigido: ela
// respondeu "a Prime 7 tem 70 cm de largura" (são 60) e o embasamento aprovou.
import { medidasInventadas, semTrechosNegados, medidasEmCm as medidas } from "../lib/ai-agent/grounding";

// O acervo da JR tem uma frase CORRETIVA que envenenava o extrator.
const ACERVO_COM_AVISO = "7 espetos (60x60x2,20m); 9 espetos (74x60x2,30m). "
  + "ATENÇÃO: o número é a quantidade de ESPETOS, não a largura: a Prime 7 NÃO tem 70 cm (tem 60), a Prime 9 NÃO tem 90 cm.";

test("trecho negado não vira fonte", () => {
  // Sem isto, o aviso escrito para IMPEDIR o erro era o que o autorizava.
  const limpo = semTrechosNegados(ACERVO_COM_AVISO);
  assert.doesNotMatch(limpo, /70 cm/);
  assert.doesNotMatch(limpo, /90 cm/);
  assert.match(limpo, /60x60/);
  const of = medidas(ACERVO_COM_AVISO);
  assert.ok(!of.has("70"), "70 entrou como oficial vindo da frase negada");
  assert.ok(!of.has("90"), "90 entrou como oficial vindo da frase negada");
  assert.ok(of.has("74") && of.has("60"), "as medidas de verdade sumiram");
});

test("barra a medida inventada de produto (os 3 erros reais do histórico)", () => {
  const of = medidas(ACERVO_COM_AVISO);
  for (const t of [
    "A Prime 9 espetos tem 90 cm de largura, 60 cm de profundidade e 2,30 m de altura.",
    "Henrique, a churrasqueira Prime 7 espetos tem as medidas de 70 cm de largura.",
    "A medida mais próxima é a Prime 9, que tem 90 cm de largura.",
  ]) assert.ok(medidasInventadas(t, of).length > 0, `passou batido: ${t}`);
});

test("não barra o eco da medida do CLIENTE nem conta de bloco", () => {
  // Medido em 538 respostas reais: estas cinco eram tudo que o aviso antigo
  // marcava, e todas legítimas. Barrá-las calaria atendimento bom.
  const of = medidas(ACERVO_COM_AVISO);
  for (const t of [
    "Com a cobertura de policarbonato a 2,83 m de altura, a chaminé precisa ultrapassar 1,50 m.",
    "Com 3 metros de altura no pé-direito, a Prime 9 vai encaixar super bem.",
    "Como você precisa de 7 blocos, que são 1,4 metros, essa quantidade excede o limite.",
    "Para a chaminé total de 6 metros, podemos incluir até 5 blocos de concreto.",
    "Para 5 metros seriam 25 blocos, mas o máximo são 5 blocos (1 metro), ok?",
  ]) assert.deepEqual(medidasInventadas(t, of), [], `alarme falso: ${t}`);
});

test("a medida CERTA passa", () => {
  const of = medidas(ACERVO_COM_AVISO);
  assert.deepEqual(medidasInventadas("A Prime 9 tem 74 cm de largura e 60 cm de profundidade.", of), []);
});
