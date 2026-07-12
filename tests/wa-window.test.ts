import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithin24h, WA_WINDOW_MS } from "../lib/wa-window";

const NOW = Date.parse("2026-07-12T12:00:00Z");

test("null/undefined/inválido → fora da janela (não pode enviar)", () => {
  assert.equal(isWithin24h(null, NOW), false);
  assert.equal(isWithin24h(undefined, NOW), false);
  assert.equal(isWithin24h("não-é-data", NOW), false);
});

test("dentro de 24h → aberta; string ISO e Date valem igual", () => {
  const oneHourAgo = new Date(NOW - 60 * 60 * 1000);
  assert.equal(isWithin24h(oneHourAgo, NOW), true);
  assert.equal(isWithin24h(oneHourAgo.toISOString(), NOW), true);
});

test("exatamente na borda de 24h → fechada (estritamente menor)", () => {
  assert.equal(isWithin24h(new Date(NOW - WA_WINDOW_MS), NOW), false);
  assert.equal(isWithin24h(new Date(NOW - WA_WINDOW_MS + 1000), NOW), true);
});

test("mais de 24h atrás → fechada", () => {
  assert.equal(isWithin24h(new Date(NOW - 25 * 60 * 60 * 1000), NOW), false);
});
