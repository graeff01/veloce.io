import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStablePrompt } from "../lib/ai-agent/orchestrator";

const base = {
  language: "pt-BR", assistantName: "BV", storeName: "Boqueirão",
  persona: null, goals: null, rules: null, timezone: "America/Sao_Paulo", playbook: null,
};

// Substrings do prompt AUTOMOTIVO atual (proibições reativas de financiamento).
const OLD_REATIVO = "FINANCIAMENTO é REATIVO";
const OLD_NAO_PERGUNTE = "NÃO pergunte prazo, número de parcelas nem valor de entrada";
// Substrings novas da variante.
const NEW_PAGAMENTO = "PAGAMENTO é parte da qualificação";
const NEW_LIMITE = "LIMITE ABSOLUTO: no máximo 1 pergunta";

test("CONTROLE byte-idêntico: sem variante e variante 'control' produzem o MESMO prompt", () => {
  const semVariante = buildStablePrompt({ ...base, variantKey: null });
  const controle = buildStablePrompt({ ...base, variantKey: "control" });
  assert.equal(controle, semVariante, "control deve ser idêntico ao sem-variante");
  // E mantêm as regras automotivas atuais (não foram derrubadas).
  assert.ok(semVariante.includes(OLD_REATIVO));
  assert.ok(semVariante.includes(OLD_NAO_PERGUNTE));
  // E NÃO têm o conteúdo da variante.
  assert.ok(!semVariante.includes(NEW_PAGAMENTO));
  assert.ok(!semVariante.includes(NEW_LIMITE));
});

test("VARIANTE qual-fin-v1: substitui as regras reativas e adiciona os blocos 1b/1c", () => {
  const v = buildStablePrompt({ ...base, variantKey: "qual-fin-v1" });
  // As proibições reativas somem.
  assert.ok(!v.includes(OLD_REATIVO), "regra 'FINANCIAMENTO é REATIVO' deve sair");
  assert.ok(!v.includes(OLD_NAO_PERGUNTE), "proibição de perguntar entrada deve sair");
  // O novo conteúdo entra.
  assert.ok(v.includes(NEW_PAGAMENTO), "permissão de perguntar pagamento/entrada deve entrar");
  assert.ok(v.includes(NEW_LIMITE), "bloco 1b (máx 1 pergunta) deve entrar");
  assert.ok(v.includes("sinal de compra"), "bloco 1c deve entrar");
  // Mantém as regras universais críticas (veracidade/handoff intactos).
  assert.ok(v.includes("VERACIDADE"));
  assert.ok(v.includes("Você é BV"));
});

test("Com PLAYBOOK, a variante qual-fin-v1 NÃO transforma (playbook vence; sem regex automotivo)", () => {
  const pb = { objetivo: "x", stages: [{ label: "a", goal: "b" }] };
  const comPb = buildStablePrompt({ ...base, playbook: pb, variantKey: "qual-fin-v1" });
  assert.ok(!comPb.includes(NEW_PAGAMENTO), "sem prompt automotivo, não há o que transformar");
  assert.ok(!comPb.includes(OLD_REATIVO));
});
