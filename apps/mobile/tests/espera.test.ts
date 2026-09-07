import { strict as assert } from "node:assert";
import { test } from "node:test";
import { esperandoDesde, rotuloEspera, urgenciaDe } from "../src/core/espera";

const iso = (ms: number) => new Date(ms).toISOString();
const AGORA = Date.parse("2026-09-07T12:00:00.000Z");
const MIN = 60_000, H = 60 * MIN, D = 24 * H;

test("só espera quem falou por último", () => {
  assert.equal(esperandoDesde(iso(AGORA - H), null), AGORA - H, "lead falou, ninguém respondeu");
  assert.equal(esperandoDesde(iso(AGORA - H), iso(AGORA - MIN)), null, "já respondemos depois");
  assert.equal(esperandoDesde(null, iso(AGORA)), null, "sem entrada não há espera");
});

test("resposta no MESMO instante conta como respondida", () => {
  assert.equal(esperandoDesde(iso(AGORA), iso(AGORA)), null);
});

test("data inválida não vira espera falsa", () => {
  assert.equal(esperandoDesde("nao-e-data", null), null);
});

test("as faixas seguem o ritmo de quem vende", () => {
  assert.equal(urgenciaDe(null, AGORA), "nenhuma");
  assert.equal(urgenciaDe(AGORA - 10 * MIN, AGORA), "recente");
  assert.equal(urgenciaDe(AGORA - 3 * H, AGORA), "atencao");
  assert.equal(urgenciaDe(AGORA - 2 * D, AGORA), "critica");
  assert.equal(urgenciaDe(AGORA - H, AGORA), "atencao", "uma hora cravada já sai de 'recente'");
});

test("rótulo curto, do jeito que se fala", () => {
  assert.equal(rotuloEspera(AGORA - 30_000, AGORA), "agora");
  assert.equal(rotuloEspera(AGORA - 12 * MIN, AGORA), "12min");
  assert.equal(rotuloEspera(AGORA - 5 * H, AGORA), "5h");
  assert.equal(rotuloEspera(AGORA - 3 * D, AGORA), "3d");
  assert.equal(rotuloEspera(AGORA - 200 * D, AGORA), "99d+", "não vira número absurdo");
  assert.equal(rotuloEspera(null, AGORA), "");
});
