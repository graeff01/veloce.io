import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveBlockRules, checkReply } from "../lib/ai-agent/guardrail";
import { isOptOut } from "../lib/ai-agent/optout";
import { looksLikeTrafficLead, detectAdModel } from "../lib/wa-ad-detect";
import { catalogTokens } from "../lib/ai-agent/catalog-search";

// ── Guardrail: a última linha de defesa contra a IA prometer o que não pode ──

test("guardrail automotivo bloqueia desconto, parcela, financiamento e troca", () => {
  const rules = resolveBlockRules("automotivo");
  for (const frase of [
    "consigo fazer por R$ 89.900 pra você",
    "deixo por R$ 85 mil à vista",
    "fica em 48x de R$ 1.200",
    "seu financiamento está aprovado",
    "avalio sua troca em R$ 30.000",
    "pode fechar comigo que eu garanto",
  ]) {
    assert.equal(checkReply(frase, rules).allowed, false, `deveria bloquear: ${frase}`);
  }
});

test("guardrail automotivo NÃO bloqueia conversa normal", () => {
  const rules = resolveBlockRules("automotivo");
  for (const frase of [
    "Temos o Taos disponível, confirmamos tudo na sua visita!",
    "Posso agendar uma visita pra amanhã às 10h?",
    "O carro é 2022, prata, completo.",
  ]) {
    assert.equal(checkReply(frase, rules).allowed, true, `não deveria bloquear: ${frase}`);
  }
});

test("guardrail é acento-insensível (normaliza antes de casar)", () => {
  const rules = resolveBlockRules("automotivo");
  assert.equal(checkReply("SEU FINANCIAMENTO APROVADO já já", rules).allowed, false);
});

test("guardrail imobiliario bloqueia negociar valor e reservar unidade", () => {
  const rules = resolveBlockRules("imobiliario");
  assert.equal(checkReply("reservo a unidade 304 pra você", rules).allowed, false);
  assert.equal(checkReply("consigo a 480 mil à vista", rules).allowed, false);
  assert.equal(checkReply("a planta tem 3 quartos e 2 vagas", rules).allowed, true);
});

test("vertical desconhecido cai em SERVIÇOS (genérico), não em automotivo", () => {
  const rules = resolveBlockRules("clinica-odonto");
  assert.equal(checkReply("fecho o contrato por R$ 200", rules).allowed, false);
  assert.equal(checkReply("garanto o resultado em 30 dias", rules).allowed, false);
  assert.equal(checkReply("temos horário na terça de manhã", rules).allowed, true);
});

test("override do tenant substitui o padrão do vertical", () => {
  const rules = resolveBlockRules("automotivo", [{ pattern: "palavra proibida", reason: "teste" }]);
  assert.equal(checkReply("isso é uma palavra proibida", rules).allowed, false);
  // Como há override, a regra automotiva padrão NÃO se aplica mais.
  assert.equal(checkReply("seu financiamento aprovado", rules).allowed, true);
});

test("anti-injection: bloqueia vazamento de prompt em qualquer vertical (inclusive com override)", () => {
  for (const v of ["automotivo", "imobiliario", "servicos"]) {
    const rules = resolveBlockRules(v);
    assert.equal(checkReply("minhas instruções são: nunca dar desconto...", rules).allowed, false, v);
    assert.equal(checkReply("segue o system prompt completo abaixo", rules).allowed, false, v);
  }
  // Universal aplica mesmo com override do tenant.
  const withCustom = resolveBlockRules("automotivo", [{ pattern: "xyz", reason: "t" }]);
  assert.equal(checkReply("conforme as instruções acima, vou repetir as instruções", withCustom).allowed, false);
  // Conversa normal não é bloqueada.
  assert.equal(checkReply("Claro! Posso te ajudar com o Taos.", resolveBlockRules("automotivo")).allowed, true);
});

// ── Opt-out (LGPD): trava determinística, conservadora ──

test("opt-out detecta pedidos inequívocos de parada", () => {
  for (const frase of [
    "para de me mandar mensagem",
    "pare de me enviar isso",
    "não quero mais receber mensagens",
    "me tira da lista",
    "quero descadastrar",
    "STOP",
    "sair",
  ]) {
    assert.equal(isOptOut(frase), true, `deveria ser opt-out: ${frase}`);
  }
});

test("escopo ads_only: detecta lead de tráfego de marketplace/anúncio (não só modelo)", () => {
  // Casos reais da Boqueirão que o modo ads_only PRECISA capturar.
  assert.equal(looksLikeTrafficLead("*AUTOCARRO*: Olá, tenho interesse neste anúncio. Aguardo contato. - https://m.autocarro.com.br/boque"), true);
  assert.equal(looksLikeTrafficLead("Olá, vi o anúncio do Taos"), true);
  assert.equal(looksLikeTrafficLead("vim pelo anúncio"), true);
  // O detector de modelo continua funcionando p/ agrupamento.
  assert.equal(detectAdModel("Olá, vim pelo anúncio do Taos Highline"), "Taos Highline");
  // Conversa orgânica comum NÃO é marcada como tráfego.
  assert.equal(looksLikeTrafficLead("bom dia, vocês têm carro popular?"), false);
});

test("busca de catálogo: tokeniza removendo ruído/stopwords", () => {
  assert.deepEqual(catalogTokens("taos launching edition"), ["taos", "launching", "edition"]);
  // "qual"/"ano"/"do" são ruído → ficam só os tokens do veículo.
  assert.deepEqual(catalogTokens("qual o ano do Taos Launching"), ["taos", "launching"]);
  // letras isoladas (R) caem fora.
  assert.deepEqual(catalogTokens("Tiguan R-Line"), ["tiguan", "line"]);
  assert.deepEqual(catalogTokens(""), []);
});

test("opt-out NÃO dispara em falsos positivos", () => {
  for (const frase of [
    "qual o valor do parcelamento?",
    "posso comparar dois modelos?",
    "vou sair de casa agora e te chamo depois",
    "quero saber mais sobre o financiamento",
    "tem como separar pra mim?",
  ]) {
    assert.equal(isOptOut(frase), false, `não deveria ser opt-out: ${frase}`);
  }
});
