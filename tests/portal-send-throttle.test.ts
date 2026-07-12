import { test } from "node:test";
import assert from "node:assert/strict";
import { allowSend } from "../lib/portal-send-throttle";

test("primeira mensagem passa; a imediatamente seguinte (rápido demais) é barrada", () => {
  const id = "c-" + Math.random();
  const t = 1_000_000;
  assert.equal(allowSend(id, t), true);
  assert.equal(allowSend(id, t + 100), false); // < intervalo mínimo
  assert.equal(allowSend(id, t + 2000), true); // respeitou o intervalo
});

test("conversas diferentes não interferem entre si", () => {
  const t = 2_000_000;
  assert.equal(allowSend("a-" + Math.random(), t), true);
  assert.equal(allowSend("b-" + Math.random(), t), true);
});

test("teto por janela: barra após o máximo, e libera quando a janela passa", () => {
  const id = "c-" + Math.random();
  let t = 5_000_000;
  let allowed = 0;
  for (let i = 0; i < 40; i++) { if (allowSend(id, t)) allowed++; t += 1600; } // ~64s de tentativas
  assert.ok(allowed >= 10 && allowed <= 20, `esperado teto por janela, permitidas=${allowed}`);
  // Bem depois, a janela esvazia e volta a permitir.
  assert.equal(allowSend(id, t + 120_000), true);
});
