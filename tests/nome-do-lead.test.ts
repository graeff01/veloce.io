import { test } from "node:test";
import assert from "node:assert/strict";
import { nomeInvalido, sanitizeIntake, type IntakeField } from "../lib/ai-agent/intake";

// Caso real (Willian Ribeiro, 21/09/2026, produção): a IA perguntou o nome, o
// lead respondeu "Dia" — o fim de "bom dia" — e ela gravou na ficha e passou a
// conversa inteira chamando ele de "Dia": "Prazer, Dia!", "Ótima escolha, Dia!".

const spec: IntakeField[] = [
  { key: "nome", label: "Nome do cliente" },
  { key: "modelo", label: "Modelo desejado", required: true },
  { key: "cidade_entrega", label: "Cidade de entrega", required: true },
];

test("saudação respondida à pergunta do nome não é nome", () => {
  for (const s of ["Dia", "dia", "Bom dia", "boa tarde", "Noite", "Oi", "olá", "Opa", "alô"]) {
    assert.ok(nomeInvalido(s), `deveria recusar: ${s}`);
  }
});

test("confirmação e cortesia também não são nome", () => {
  for (const s of ["sim", "Ok", "beleza", "Obrigado", "valeu", "por favor", "tudo bem", "isso", "Certo"]) {
    assert.ok(nomeInvalido(s), `deveria recusar: ${s}`);
  }
});

test("nome de gente passa — inclusive os que lembram outra palavra", () => {
  // A lista é fechada de propósito: recusar nome legítimo é pior que aceitar
  // ruído, porque a IA voltaria a perguntar e pareceria surda.
  for (const s of [
    "Valdinei Souza da Silva", "Rochelly", "Luis Ademir", "Cristofer Lenz", "Rose",
    "Maria", "Jefferson Madeira", "Bill Barbosa", "Lucas", "Hamilton",
    "Zé", "Ana", "Dias", "Diana", "Oliveira", "Salomé", "JR", "Tarde Silva",
  ]) {
    assert.ok(!nomeInvalido(s), `não deveria recusar: ${s}`);
  }
});

test("uma letra só não é nome; duas podem ser iniciais", () => {
  assert.ok(nomeInvalido("a"));
  assert.ok(nomeInvalido(" b "));
  assert.ok(!nomeInvalido("JR"));
});

test("vazio/nulo é recusado sem explodir", () => {
  for (const v of [null, undefined, "", "   ", 0, false]) assert.ok(nomeInvalido(v));
});

test("o campo não é gravado e a IA é avisada", () => {
  const r = sanitizeIntake(spec, { nome: "Dia" });
  assert.equal(r.data.nome, undefined, '"Dia" não pode entrar na ficha');
  assert.equal(r.nomeRecusado, "Dia", "a IA precisa saber, senão segue chamando o lead assim");
});

test("os outros campos do mesmo turno continuam entrando", () => {
  // O descarte é cirúrgico: só o nome cai, o resto da coleta segue.
  const r = sanitizeIntake(spec, { nome: "boa tarde", modelo: "tradicao", cidade_entrega: "Canoas" });
  assert.equal(r.data.nome, undefined);
  assert.equal(r.data.modelo, "tradicao");
  assert.equal(r.data.cidade_entrega, "Canoas");
  assert.equal(r.nomeRecusado, "boa tarde");
});

test("nome válido passa e não gera aviso", () => {
  const r = sanitizeIntake(spec, { nome: "Willian Ribeiro" });
  assert.equal(r.data.nome, "Willian Ribeiro");
  assert.equal(r.nomeRecusado, null);
});
