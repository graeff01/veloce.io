import { test } from "node:test";
import assert from "node:assert/strict";
import { compilePrompt, compileOrThrow, type PolicyModule } from "../lib/ai-agent/prompt-compiler";

const kinds = (r: ReturnType<typeof compilePrompt>) => r.report.issues.map((i) => i.kind);

test("monta na ordem dos tópicos (fluxo), não na ordem de declaração", () => {
  const modules: PolicyModule[] = [
    { id: "blind", topic: "blindagem", text: "Nunca invente specs." },
    { id: "id", topic: "identidade", text: "Você é o Juninho." },
    { id: "abre", topic: "abertura", text: "Cumprimente e peça o nome." },
  ];
  const { prompt, report } = compilePrompt({ modules });
  assert.ok(report.ok);
  const iId = prompt.indexOf("Juninho");
  const iAbre = prompt.indexOf("Cumprimente");
  const iBlind = prompt.indexOf("Nunca invente");
  assert.ok(iId < iAbre && iAbre < iBlind, "identidade → abertura → blindagem");
});

test("dentro do tópico, ordena por prioridade e depois id", () => {
  const modules: PolicyModule[] = [
    { id: "b", topic: "conducao", priority: 10, text: "Segundo." },
    { id: "a", topic: "conducao", priority: 1, text: "Primeiro." },
  ];
  const { prompt } = compilePrompt({ modules });
  assert.ok(prompt.indexOf("Primeiro.") < prompt.indexOf("Segundo."));
});

test("resolve {{placeholder}} a partir dos params", () => {
  const modules: PolicyModule[] = [
    { id: "frete", topic: "orcamento", text: "Frete acima de R${{freight_assembly_threshold}} exige montagem." },
  ];
  const { prompt, report } = compilePrompt({ modules, params: { freight_assembly_threshold: 250 } });
  assert.ok(report.ok);
  assert.ok(prompt.includes("R$250"));
  assert.ok(!prompt.includes("{{"), "sem placeholder residual");
});

test("placeholder sem valor na config → unresolved-param (erro) e compileOrThrow lança", () => {
  const modules: PolicyModule[] = [
    { id: "frete", topic: "orcamento", text: "Frete acima de R${{freight_assembly_threshold}} exige montagem." },
  ];
  const res = compilePrompt({ modules, params: {} });
  assert.ok(!res.report.ok);
  assert.ok(kinds(res).includes("unresolved-param"));
  assert.throws(() => compileOrThrow({ modules, params: {} }), /unresolved-param/);
});

test("DRIFT: número de param literal no texto (sem placeholder) é erro", () => {
  const modules: PolicyModule[] = [
    { id: "frete", topic: "orcamento", text: "Frete acima de R$250 exige montagem." },
  ];
  const res = compilePrompt({ modules, params: { freight_assembly_threshold: 250 } });
  assert.ok(!res.report.ok);
  assert.ok(kinds(res).includes("drift"));
});

test("DRIFT some quando o texto usa o placeholder", () => {
  const modules: PolicyModule[] = [
    { id: "frete", topic: "orcamento", text: "Frete acima de R${{freight_assembly_threshold}} exige montagem." },
  ];
  const res = compilePrompt({ modules, params: { freight_assembly_threshold: 250 } });
  assert.deepEqual(kinds(res).filter((k) => k === "drift"), []);
});

test("DUPLICATA: dois módulos com mesmo intent sem reforço = erro", () => {
  const modules: PolicyModule[] = [
    { id: "a", topic: "conducao", intent: "uma-pergunta", text: "Uma pergunta por vez." },
    { id: "b", topic: "conducao", intent: "uma-pergunta", text: "Faça só uma pergunta." },
  ];
  const res = compilePrompt({ modules });
  assert.ok(!res.report.ok);
  assert.ok(kinds(res).includes("duplicate"));
});

test("DUPLICATA permitida: extra marcado reforco:true não falha", () => {
  const modules: PolicyModule[] = [
    { id: "a", topic: "conducao", intent: "nao-invente", text: "Nunca invente specs." },
    { id: "b", topic: "blindagem", intent: "nao-invente", reforco: true, text: "Reforço: nunca invente specs." },
  ];
  const res = compilePrompt({ modules });
  assert.ok(res.report.ok);
  assert.deepEqual(kinds(res).filter((k) => k === "duplicate"), []);
});

test("CONFLITO: conflitaCom sem desempate = erro; com desempate = ok", () => {
  const base: PolicyModule[] = [
    { id: "escalar", topic: "blindagem", conflitaCom: ["oferecer"], text: "Medida específica → escale." },
    { id: "oferecer", topic: "orcamento", text: "Ofereça a medida mais próxima." },
  ];
  assert.ok(kinds(compilePrompt({ modules: base })).includes("conflict"));

  const fixed: PolicyModule[] = [
    { id: "escalar", topic: "blindagem", conflitaCom: ["oferecer"], desempate: "Item inexistente → escala; existente → oferece próxima.", text: "Medida específica inexistente → escale." },
    { id: "oferecer", topic: "orcamento", text: "Medida existente → ofereça a mais próxima." },
  ];
  const res = compilePrompt({ modules: fixed });
  assert.ok(res.report.ok);
});

test("EXEMPLO ÓRFÃO: 'ex.:' inline no texto = warn (não bloqueia)", () => {
  const modules: PolicyModule[] = [
    { id: "a", topic: "abertura", text: "Peça o nome. ex.: 'Qual seu nome?'" },
  ];
  const res = compilePrompt({ modules });
  assert.ok(res.report.ok, "warn não bloqueia o build");
  assert.ok(kinds(res).includes("orphan-example"));
});

test("REFERÊNCIA ÓRFÃ: 'ver seção X' sem alvo = erro", () => {
  const modules: PolicyModule[] = [
    { id: "a", topic: "midia", text: "Sobre vídeo, ver seção VIDEO DE APRESENTACAO." },
  ];
  const res = compilePrompt({ modules });
  assert.ok(!res.report.ok);
  assert.ok(kinds(res).includes("orphan-ref"));
});

test("examples[] viram linhas 'ex.:' no prompt e contam nos tokens", () => {
  const modules: PolicyModule[] = [
    { id: "a", topic: "abertura", text: "Cumprimente e peça o nome.", examples: ["Olá! Qual seu nome?"] },
  ];
  const { prompt, report } = compilePrompt({ modules });
  assert.ok(prompt.includes("ex.: Olá! Qual seu nome?"));
  assert.ok(report.perModule[0].approxTokens > 0);
});

test("relatório: soma dos tokens e ponteiros de conhecimento anexados", () => {
  const modules: PolicyModule[] = [{ id: "a", topic: "identidade", text: "Você é o Juninho." }];
  const { prompt, report } = compilePrompt({ modules, knowledge: ["o lead pedir medidas de um modelo"] });
  assert.ok(prompt.includes("CONHECIMENTO — consulte quando:"));
  assert.ok(prompt.includes("- o lead pedir medidas de um modelo"));
  assert.equal(report.perModule.length, 1);
  assert.ok(report.approxTokens >= report.perModule[0].approxTokens);
});
