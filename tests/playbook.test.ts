import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook, renderPlaybookConduct, renderPlaybookLimits, UNIVERSAL_LIMITS, PLAYBOOK_TEMPLATES, type Playbook } from "../lib/ai-agent/playbook";
import { buildStablePrompt } from "../lib/ai-agent/orchestrator";

const baseCfg = {
  language: "pt-BR", assistantName: "Helena", storeName: "Loja X",
  persona: null, goals: null, rules: null, timezone: "America/Sao_Paulo", variantKey: null,
};

test("parsePlaybook: vazio/ inválido → null; com conteúdo → objeto", () => {
  assert.equal(parsePlaybook(null), null);
  assert.equal(parsePlaybook({}), null);
  assert.equal(parsePlaybook([]), null);
  assert.equal(parsePlaybook("x"), null);
  assert.ok(parsePlaybook({ objetivo: "vender" }));
  assert.ok(parsePlaybook({ stages: [{ label: "a", goal: "b" }] }));
});

test("SEGURANÇA: sem playbook, o prompt mantém as seções automotivas atuais", () => {
  const prompt = buildStablePrompt({ ...baseCfg, playbook: null });
  // Marcadores do prompt automotivo que NÃO podem sumir (Boqueirão intocado).
  assert.ok(prompt.includes("COMO CONDUZIR A CONVERSA (você é VENDEDORA fazendo TRIAGEM"));
  assert.ok(prompt.includes("PERGUNTAS MAIS FREQUENTES"));
  assert.ok(prompt.includes("OBJETIVO: ACOLHER o lead"));
  assert.ok(prompt.includes("LIMITES — o que você pode e não pode no NEGÓCIO"));
  // A identidade/VOZ (universais) seguem presentes.
  assert.ok(prompt.includes("Você é Helena"));
});

test("COM playbook: seções automotivas são SUBSTITUÍDAS pelo playbook", () => {
  const pb: Playbook = {
    objetivo: "Vender churrasqueira sob medida",
    stages: [{ label: "descoberta", goal: "entender o projeto" }],
    objections: [{ objection: "tá caro", response: "reforce o valor" }],
    buyingSignals: ["aprovou o orçamento"],
    tactics: ["confirme as medidas antes de orçar"],
  };
  const prompt = buildStablePrompt({ ...baseCfg, playbook: pb });
  // A FAQ automotiva e a condução de carro somem.
  assert.ok(!prompt.includes("PERGUNTAS MAIS FREQUENTES"), "FAQ automotiva não deve aparecer");
  assert.ok(!prompt.includes("VENDEDORA fazendo TRIAGEM"), "condução automotiva não deve aparecer");
  // O playbook entra.
  assert.ok(prompt.includes("OBJETIVO: Vender churrasqueira sob medida"));
  assert.ok(prompt.includes("entender o projeto"));
  assert.ok(prompt.includes("tá caro"));
  assert.ok(prompt.includes("aprovou o orçamento"));
  // LIMITES viram os universais (sem palavras de carro).
  assert.ok(prompt.includes("VERACIDADE (CRÍTICO"));
  assert.ok(!prompt.includes("só fale disso se o lead trouxer"), "OBJETIVO automotivo não deve aparecer");
});

test("renderPlaybookLimits: universais sempre; extras do vertical quando houver", () => {
  assert.ok(renderPlaybookLimits({}).includes(UNIVERSAL_LIMITS.slice(0, 30)));
  const withExtra = renderPlaybookLimits({ limits: ["Não prometa prazo de entrega."] });
  assert.ok(withExtra.includes("Não prometa prazo de entrega."));
});

test("templates da biblioteca são válidos (parseáveis)", () => {
  assert.ok(parsePlaybook(PLAYBOOK_TEMPLATES.generico));
  assert.ok(parsePlaybook(PLAYBOOK_TEMPLATES.churrasqueira));
  assert.ok(renderPlaybookConduct(PLAYBOOK_TEMPLATES.churrasqueira).includes("ETAPAS"));
});
