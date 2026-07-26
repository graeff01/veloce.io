import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLeadTurns } from "../lib/ai-agent/eval/replay";

const m = (direction: string, text: string | null) => ({ direction, text });

test("agrupa mensagens consecutivas do lead em um turno; vendedor fecha o turno", () => {
  const turns = groupLeadTurns([
    m("in", "Oi"), m("in", "tudo bem?"),   // rajada → 1 turno
    m("out", "Olá!"),                       // vendedor fecha
    m("in", "quero uma churrasqueira"),
    m("out", "temos várias"),
    m("in", "a de 8 espetos"),
  ]);
  assert.deepEqual(turns, ["Oi\ntudo bem?", "quero uma churrasqueira", "a de 8 espetos"]);
});

test("ignora vendedor e mensagens vazias; mídia (placeholder) entra", () => {
  const turns = groupLeadTurns([
    m("in", "Olá"), m("out", "oi"), m("in", ""), m("in", "[O lead enviou uma imagem]"), m("in", null),
  ]);
  assert.deepEqual(turns, ["Olá", "[O lead enviou uma imagem]"]);
});

test("conversa só do lead (vendedor nunca respondeu) = 1 turno", () => {
  assert.deepEqual(groupLeadTurns([m("in", "a"), m("in", "b"), m("in", "c")]), ["a\nb\nc"]);
});

test("conversa vazia / só vendedor = nenhum turno", () => {
  assert.deepEqual(groupLeadTurns([m("out", "x"), m("out", "y")]), []);
});
