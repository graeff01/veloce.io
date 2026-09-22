import { test } from "node:test";
import assert from "node:assert/strict";
import { lerTabelaCapacidade, capacidadesErradas, produtoNaFrase } from "../lib/ai-agent/capacidade-produto";

// Caso real (JR, replay da conversa da Rosi, 22/09/2026). A IA acertou primeiro e
// depois abandonou o dado certo para concordar com o cliente:
//
//   IA   "a churrasqueira Popular comporta 4 espetos tradicionais"   ✅
//   LEAD "Está bom com 7 espetos"
//   IA   "Te mandei uma foto da Popular com 7 espetos"               ❌
//
// O grounding aprovava, porque a CONVERSA conta como fonte legítima — e o 7 tinha
// saído do próprio cliente.

// Trecho REAL do acervo da JR (KnowledgeChunk), no formato `${title} — ${content}`.
const ACERVO = [
  "Linha Popular — churrasqueira de entrada, ótimo custo-benefício. Acabamentos Tijolinho e Lisa; acompanha KIT INOX com suporte para espetos e grelha moeda. Preços: Lisa 55cm R$ 817; Lisa 65cm R$ 927. Medidas de ~55x55x2,20m até 75x55x2,20m (LxPxA). CAPACIDADE: 4 espetos. MATERIAL — AVISE SEMPRE que o cliente escolher a Linha Popular: ela NÃO é 100% refratária.",
  "Linha Prime (espetos) — churrasqueira de tijolo à vista: 100% tijolos refratários. Modelos por nº de espetos: 7 espetos R$ 1.247 (60x60x2,20m); 9 espetos R$ 1.447 (74x60x2,30m); 11 espetos R$ 1.547 (81x60x2,30m); 16 espetos R$ 1.997 (105x60x2,50m). Medidas em LxPxA.",
].join("\n\n");

const TABELA = lerTabelaCapacidade(ACERVO);

test("a tabela sai do acervo do cliente, sem nome cravado no motor", () => {
  const pop = TABELA.find((c) => /popular/i.test(c.produto));
  assert.ok(pop, "não leu a capacidade da Linha Popular");
  assert.equal(pop!.quantidade, 4);
  assert.equal(pop!.unidade, "espeto");
});

test("linha cujo número vive no NOME do modelo fica FORA da tabela", () => {
  // A Prime tem 7, 9, 11, 16 e 32 espetos. Tratá-la como capacidade única foi o
  // defeito da primeira versão: acusou 10 de 123 respostas reais, todas corretas.
  assert.ok(!TABELA.some((c) => /prime/i.test(c.produto) && c.unidade === "espeto"),
    "a Linha Prime não pode ter capacidade única — o número é por modelo");
});

test("pega o erro real: a capacidade que veio do cliente", () => {
  for (const f of [
    "Te mandei uma foto da Popular com 7 espetos para você ver melhor 😊",
    "A churrasqueira Popular tem capacidade para 7 espetos.",
  ]) {
    const e = capacidadesErradas(f, TABELA);
    assert.equal(e.length, 1, `deveria acusar: ${f}`);
    assert.match(e[0], /disse 7 espetos, é 4/);
  }
});

test("a resposta CERTA passa", () => {
  assert.deepEqual(capacidadesErradas("Rose, a churrasqueira Popular comporta 4 espetos tradicionais.", TABELA), []);
});

test("número que vem do NOME do modelo nunca é erro", () => {
  // Estes foram os falsos positivos da primeira versão, medidos em produção.
  for (const f of [
    "A Prime 9 espetos tem 9 espetos e 74 cm de largura.",
    "Te mandei uma foto da churrasqueira Prime 11 espetos para você ver melhor 😊",
    "Trabalhamos com três modelos: Fogão Campeirinho, Fogão Campeiro 3 bocas e Fogão Campeiro 4 bocas.",
    "Henrique, temos a Linha Prime 9, 11 e 16 espetos.",
  ]) {
    assert.deepEqual(capacidadesErradas(f, TABELA), [], `não deveria acusar: ${f}`);
  }
});

test("frase sem número, ou de outra unidade, não é acusada", () => {
  for (const f of [
    "Se quiser mais espetos, a linha Prime é mais indicada.",
    "A Popular não permite o uso de lenha, só carvão.",
    "A Popular tem 55 cm de largura.",
  ]) {
    assert.deepEqual(capacidadesErradas(f, TABELA), [], `não deveria acusar: ${f}`);
  }
});

test("sem tabela (cliente sem esse dado no acervo) não opina", () => {
  assert.deepEqual(capacidadesErradas("A Popular tem 7 espetos.", []), []);
  assert.deepEqual(lerTabelaCapacidade(""), []);
});

test("produtoNaFrase acha o produto e ignora o resto", () => {
  assert.ok(produtoNaFrase("a churrasqueira Popular é ótima", TABELA));
  assert.equal(produtoNaFrase("a Gourmet tem fogão a gás embutido", TABELA), null);
});
