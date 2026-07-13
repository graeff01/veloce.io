import { test } from "node:test";
import assert from "node:assert/strict";
import { isTakenOver } from "../lib/takeover";

const NOW = Date.parse("2026-07-12T12:00:00Z");
const MIN = 180; // humanTakeoverMin padrão

test("assumido agora → IA pula (dentro da janela)", () => {
  assert.equal(isTakenOver(new Date(NOW - 60 * 60_000), MIN, NOW), true); // 1h atrás, janela 3h
  assert.equal(isTakenOver(new Date(NOW).toISOString(), MIN, NOW), true);
});

test("devolvido (null) → IA volta a responder", () => {
  assert.equal(isTakenOver(null, MIN, NOW), false);
  assert.equal(isTakenOver(undefined, MIN, NOW), false);
});

test("janela expirada → IA volta a responder", () => {
  assert.equal(isTakenOver(new Date(NOW - MIN * 60_000), MIN, NOW), false); // exatamente na borda
  assert.equal(isTakenOver(new Date(NOW - (MIN + 1) * 60_000), MIN, NOW), false);
  assert.equal(isTakenOver(new Date(NOW - (MIN - 1) * 60_000), MIN, NOW), true); // 1 min antes de expirar
});

test("takeoverMin<=0 (desligado) → nunca considera assumido", () => {
  assert.equal(isTakenOver(new Date(NOW), 0, NOW), false);
});

test("valor inválido → não assumido", () => {
  assert.equal(isTakenOver("nao-e-data", MIN, NOW), false);
});
