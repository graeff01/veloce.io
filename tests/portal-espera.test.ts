import { test } from "node:test";
import assert from "node:assert/strict";
import { corDaUrgencia, esperandoDesde, rotuloEspera, urgenciaDe } from "@/lib/portal/espera";

// ── Espera do lead, no portal web ─────────────────────────────────────────────
// As MESMAS faixas do teste do aplicativo (apps/mobile/tests/espera.test.ts).
// As duas telas mostram o mesmo lead para as mesmas pessoas: se discordarem
// sobre o que é urgente, o portal vira uma segunda opinião — e a vendedora
// deixa de confiar nas duas.

const AGORA = Date.parse("2026-09-10T12:00:00Z");
const atras = (ms: number) => new Date(AGORA - ms).toISOString();
const MIN = 60_000, HORA = 60 * MIN, DIA = 24 * HORA;

test("só espera quem falou por último foi o LEAD", () => {
  // Lead falou e ninguém respondeu → espera.
  assert.equal(esperandoDesde(atras(30 * MIN), null), AGORA - 30 * MIN);
  // Respondemos depois → não espera.
  assert.equal(esperandoDesde(atras(30 * MIN), atras(10 * MIN)), null);
  // Respondemos no mesmo instante → conta como respondido.
  assert.equal(esperandoDesde(atras(30 * MIN), atras(30 * MIN)), null);
  // Nunca escreveu → não há espera.
  assert.equal(esperandoDesde(null, atras(MIN)), null);
});

test("data inválida não vira espera nem quebra a lista", () => {
  assert.equal(esperandoDesde("não é data", null), null);
  assert.equal(esperandoDesde(atras(MIN), "não é data"), AGORA - MIN);
  assert.equal(esperandoDesde(undefined, undefined), null);
});

test("as faixas de urgência são as do aplicativo", () => {
  assert.equal(urgenciaDe(null, AGORA), "nenhuma");
  assert.equal(urgenciaDe(AGORA - 59 * MIN, AGORA), "recente");
  assert.equal(urgenciaDe(AGORA - HORA, AGORA), "atencao");
  assert.equal(urgenciaDe(AGORA - 23 * HORA, AGORA), "atencao");
  assert.equal(urgenciaDe(AGORA - DIA, AGORA), "critica");
});

test("o rótulo é curto, do jeito que se fala", () => {
  assert.equal(rotuloEspera(null, AGORA), "");
  assert.equal(rotuloEspera(AGORA - 30_000, AGORA), "agora");
  assert.equal(rotuloEspera(AGORA - 12 * MIN, AGORA), "12min");
  assert.equal(rotuloEspera(AGORA - 3 * HORA, AGORA), "3h");
  assert.equal(rotuloEspera(AGORA - 5 * DIA, AGORA), "5d");
  // Relógio do aparelho adiantado não pode virar tempo negativo na tela.
  assert.equal(rotuloEspera(AGORA + 10 * MIN, AGORA), "agora");
  // Conversa esquecida há anos não estoura a largura da linha.
  assert.equal(rotuloEspera(AGORA - 400 * DIA, AGORA), "99d+");
});

test("cada urgência tem cor própria, e a menor é o verde que o portal já usa", () => {
  assert.equal(corDaUrgencia("recente"), "#1FA855");
  assert.notEqual(corDaUrgencia("atencao"), corDaUrgencia("recente"));
  assert.notEqual(corDaUrgencia("critica"), corDaUrgencia("atencao"));
});
