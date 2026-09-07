import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fatiar } from "../src/core/realce";

test("sem termo, o texto fica inteiro", () => {
  assert.deepEqual(fatiar("Bancada Gourmet", ""), [{ trecho: "Bancada Gourmet", casa: false }]);
  assert.deepEqual(fatiar("Bancada", "   "), [{ trecho: "Bancada", casa: false }]);
});

test("acha ignorando maiúsculas mas devolve o original", () => {
  assert.deepEqual(fatiar("Bancada Gourmet", "gourmet"), [
    { trecho: "Bancada ", casa: false },
    { trecho: "Gourmet", casa: true },
  ]);
});

test("marca todas as ocorrências", () => {
  assert.deepEqual(fatiar("pizza e mais pizza", "pizza"), [
    { trecho: "pizza", casa: true },
    { trecho: " e mais ", casa: false },
    { trecho: "pizza", casa: true },
  ]);
});

test("termo ausente não quebra nada", () => {
  assert.deepEqual(fatiar("churrasqueira", "forno"), [{ trecho: "churrasqueira", casa: false }]);
});

test("casa no começo e no fim", () => {
  assert.deepEqual(fatiar("oi", "oi"), [{ trecho: "oi", casa: true }]);
});
