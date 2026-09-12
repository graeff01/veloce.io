import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Regras do "número mudo" ──────────────────────────────────────────────────
// O defeito mais silencioso de um painel com vários números: quando a conexão
// de alguém cai, a pessoa dela aparece como a MELHOR do time — fila zero, nada
// esperando —, porque não há o que atrasar quando nada chega.
//
// Estes testes travam as duas decisões que evitam o alerta virar ruído, e a
// que evita ele virar elogio ao contrário.

const fonte = readFileSync(join(process.cwd(), "lib", "portal", "numero-mudo.ts"), "utf8");

test("número recém-conectado NÃO é número mudo", () => {
  // Sem esta trava, todo cliente novo nasceria com um alerta vermelho: a
  // conexão existe, ainda não recebeu nada, e "não recebe há dias" seria
  // verdade e inútil ao mesmo tempo.
  assert.match(fonte, /MIN_MENSAGENS/, "precisa exigir histórico antes de desconfiar");
  assert.match(fonte, /_count/, "o histórico é medido por contagem de mensagens");
});

test("o silêncio tolerado passa de um dia", () => {
  // Menor que isso e um domingo — ou um feriado — vira alerta toda semana.
  const m = fonte.match(/WA_SILENCIO_HORAS \?\? (\d+)/);
  assert.ok(m, "o limite precisa ser configurável por ambiente");
  assert.ok(Number(m[1]) > 24, `o padrão (${m?.[1]}h) tem que passar de 24h, senão um domingo dispara`);
});

test("a tela e o alerta usam a MESMA regra", () => {
  // Duas implementações da mesma regra divergem com o tempo, e aí o aviso diz
  // uma coisa e a tela outra — a gestora deixa de confiar nas duas.
  const insights = readFileSync(join(process.cwd(), "lib", "portal", "equipe-insights.ts"), "utf8");
  const alertas = readFileSync(join(process.cwd(), "lib", "notifications", "gestor-alertas.ts"), "utf8");
  assert.match(insights, /numerosMudos/, "a tela precisa vir de lib/portal/numero-mudo");
  assert.match(alertas, /calcularInsightsEquipe/, "o alerta precisa vir do mesmo cálculo da tela");
});

test("o aviso à gestora é raro de propósito", () => {
  const alertas = readFileSync(join(process.cwd(), "lib", "notifications", "gestor-alertas.ts"), "utf8");
  // Três travas contra o painel que apita o dia inteiro e acaba desligado.
  assert.match(alertas, /gravidade === "alta"/, "só o que justifica interromper alguém");
  assert.match(alertas, /MAX_POR_RODADA/, "teto por rodada");
  assert.match(alertas, /toISOString\(\)\.slice\(0, 10\)/, "a chave de dedupe carrega o dia: 1 aviso por assunto por dia");
});
