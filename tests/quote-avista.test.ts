import { test } from "node:test";
import assert from "node:assert/strict";
import { avistaParcelado } from "../lib/ai-agent/tools";

// Trava a regra do PDF: à vista = cheio − (desconto% SÓ nos produtos); parcelado = cheio.
test("avistaParcelado: desconto incide só nos produtos", () => {
  // produtos 2650, cheio 4600 (com montagem/frete), 8% → desconto 212 → à vista 4388
  assert.deepEqual(avistaParcelado(4600, 2650, 8), { avista: 4388, desconto: 212 });
});
test("avistaParcelado: sem pct ou sem subtotal → sem comparação (avista null)", () => {
  assert.deepEqual(avistaParcelado(4600, 2650, 0), { avista: null, desconto: 0 });
  assert.deepEqual(avistaParcelado(4600, null, 8), { avista: null, desconto: 0 });
  assert.deepEqual(avistaParcelado(4600, undefined, 8), { avista: null, desconto: 0 });
});
test("avistaParcelado: desconto 0 (produtos 0) → não mostra (avista == cheio)", () => {
  assert.deepEqual(avistaParcelado(500, 0, 8), { avista: null, desconto: 0 });
});
