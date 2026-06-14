import { test } from "node:test";
import assert from "node:assert/strict";
import { isAnalyzable, parseAnalysis, resolvesObjections } from "../lib/ai-agent/intelligence";

test("gate ignora mensagens triviais", () => {
  for (const t of ["ok", "kkk", "entendi", "valeu", "👍", "  ", "sim", "blz"]) {
    assert.equal(isAnalyzable(t), false, `deveria ignorar: ${t}`);
  }
});

test("gate aceita mensagens semânticas", () => {
  for (const t of ["está caro demais", "consigo visitar hoje?", "vou olhar em outras lojas"]) {
    assert.equal(isAnalyzable(t), true, `deveria analisar: ${t}`);
  }
});

test("parseAnalysis valida contra a taxonomia e descarta lixo", () => {
  const ok = parseAnalysis('{"intent":"PRICE_NEGOTIATION","intentConfidence":0.9,"sentiment":"FRUSTRATED","sentimentConfidence":0.8,"objection":"PRICE","objectionSeverity":0.85}');
  assert.equal(ok?.intent, "PRICE_NEGOTIATION");
  assert.equal(ok?.objection, "PRICE");
  assert.equal(ok?.sentiment, "FRUSTRATED");
  // Valor fora da taxonomia vira null.
  const bad = parseAnalysis('{"intent":"INVENTADO","sentiment":"ZZZ","objection":"NAO_EXISTE"}');
  assert.equal(bad, null);
  // JSON inválido -> null (nunca quebra).
  assert.equal(parseAnalysis("não é json"), null);
});

test("parseAnalysis com cercas de markdown e clamp de confiança", () => {
  const r = parseAnalysis('```json\n{"intent":"VISIT_INTENT","intentConfidence":1.5}\n```');
  assert.equal(r?.intent, "VISIT_INTENT");
  assert.equal(r?.intentConfidence, 1); // clampado em [0,1]
});

test("Cenário 1 — price objection", () => {
  const r = parseAnalysis('{"intent":"PRICE_NEGOTIATION","objection":"PRICE","sentiment":"SKEPTICAL","objectionSeverity":0.7}');
  assert.equal(r?.objection, "PRICE");
  assert.ok(["SKEPTICAL", "FRUSTRATED"].includes(r?.sentiment as string));
});

test("Cenário 2 — quente: resolução de objeção dispara", () => {
  assert.equal(resolvesObjections("VISIT_INTENT", "EXCITED"), true);
  assert.equal(resolvesObjections("BUYING_SIGNAL", null), true);
});

test("Cenário 3 — drop risk não resolve objeção", () => {
  assert.equal(resolvesObjections("DROP_RISK", "SKEPTICAL"), false);
  assert.equal(resolvesObjections("HESITATION", "CONFUSED"), false);
});

test("Cenário 4 — concorrência mapeia COMPETITOR", () => {
  const r = parseAnalysis('{"intent":"COMPARISON","objection":"COMPETITOR","objectionSeverity":0.6}');
  assert.equal(r?.objection, "COMPETITOR");
});
