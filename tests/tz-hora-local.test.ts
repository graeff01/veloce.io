import { test } from "node:test";
import assert from "node:assert/strict";
import { criarHoraLocal } from "@/lib/tz";

// ── A hora tem que ser a do cliente, não a do servidor ───────────────────────
// Em Brasília a diferença para UTC é de três horas. Um lead que chegou às 20h
// apareceria como 23h — e alguém mudaria a escala da equipe por causa de um
// pico noturno que não existe.

const hora = criarHoraLocal("America/Sao_Paulo");

test("converte para o fuso de São Paulo, não UTC", () => {
  // 2026-03-10T23:30Z = 20:30 em Brasília (UTC-3).
  assert.equal(hora(new Date("2026-03-10T23:30:00Z")), 20);
  // 2026-03-11T02:00Z = 23:00 do dia ANTERIOR em Brasília.
  assert.equal(hora(new Date("2026-03-11T02:00:00Z")), 23);
});

test("meia-noite é 0, não 24", () => {
  // Intl devolve "24" para meia-noite em alguns ambientes; um balde 24 sumiria
  // do gráfico de 0 a 23 sem deixar rastro.
  assert.equal(hora(new Date("2026-03-11T03:00:00Z")), 0);
});

test("cobre o dia inteiro sem buraco nem repetição", () => {
  const vistas = new Set<number>();
  for (let h = 0; h < 24; h++) {
    vistas.add(hora(new Date(Date.UTC(2026, 5, 15, h, 30))));
  }
  assert.equal(vistas.size, 24, "24 instantes distintos têm que dar 24 horas distintas");
  for (const h of vistas) assert.ok(h >= 0 && h <= 23, `hora fora da faixa: ${h}`);
});
