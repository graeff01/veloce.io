import { test } from "node:test";
import assert from "node:assert/strict";
import { checkDrift, countConcepts, findOrphanRefs } from "../lib/ai-agent/eval/prompt-audit";

test("checkDrift: número da config presente/ausente no prompt", () => {
  const prompt = "frete acima de R$250 vai com montagem; desconto de 8% à vista.";
  const r = checkDrift(prompt, [
    { label: "limiar", value: 250 },
    { label: "desconto", value: 8 },
    { label: "prazo", value: 15 }, // não está no prompt → ausente
  ]);
  assert.equal(r.find((x) => x.label === "limiar")!.present, true);
  assert.equal(r.find((x) => x.label === "desconto")!.present, true);
  assert.equal(r.find((x) => x.label === "prazo")!.present, false);
});

test("checkDrift: ignora params nulos", () => {
  assert.equal(checkDrift("qualquer texto", [{ label: "x", value: null }]).length, 0);
});

test("countConcepts: conta só o que está duplicado (2+)", () => {
  const prompt = "NÃO invente preço. Nunca invente medida. Uma pergunta por vez.";
  const r = countConcepts(prompt, [
    { concept: "nao-invente", re: /n[ãa]o invent|nunca invent/ },
    { concept: "uma-pergunta", re: /uma pergunta por vez/ },
  ]);
  assert.equal(r.find((c) => c.concept === "nao-invente")!.count, 2);
  // "uma-pergunta" aparece 1× → não entra (não é duplicado)
  assert.equal(r.find((c) => c.concept === "uma-pergunta"), undefined);
});

test("findOrphanRefs: acha referência sem a seção correspondente", () => {
  const semSecao = "faça X (ver seção VÍDEO DE APRESENTAÇÃO) e siga.";
  assert.deepEqual(findOrphanRefs(semSecao), ["VÍDEO DE APRESENTAÇÃO"]);
});

test("findOrphanRefs: não acusa quando a seção existe", () => {
  const comSecao = "faça X (ver seção ORÇAMENTO).\n\nORÇAMENTO: aqui explica o orçamento.";
  assert.deepEqual(findOrphanRefs(comSecao), []);
});
