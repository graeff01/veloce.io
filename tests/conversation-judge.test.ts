import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConversationJudge } from "../lib/ai-agent/eval/conversation-judge";

test("parse do juiz: normaliza scores, status por faixa, dnaAdherence null = ausente", () => {
  const raw = `{"dnaAdherence":{"score":null,"justification":""},"conductionQuality":{"score":0.9,"justification":"conduziu bem"},"discoveryQuality":{"score":0.4,"justification":"despejou perguntas"}}`;
  const r = parseConversationJudge(raw)!;
  assert.ok(!("dnaAdherence" in r.dimensions));           // null → não entra
  assert.equal(r.dimensions.conductionQuality.score, 0.9);
  assert.equal(r.dimensions.conductionQuality.status, "bom");
  assert.equal(r.dimensions.discoveryQuality.status, "fraco");
  assert.equal(r.confidence, 0.7);
});

test("parse do juiz: DNA presente entra; clamp fora de faixa; tolera texto ao redor", () => {
  const raw = "aqui vai: {\"dnaAdherence\":{\"score\":1.5,\"justification\":\"seguiu\"},\"conductionQuality\":{\"score\":0.7,\"justification\":\"\"},\"discoveryQuality\":{\"score\":0.6,\"justification\":\"\"}} fim";
  const r = parseConversationJudge(raw)!;
  assert.equal(r.dimensions.dnaAdherence.score, 1); // clamp
});

test("parse do juiz: JSON inválido → null", () => {
  assert.equal(parseConversationJudge("não é json"), null);
});
