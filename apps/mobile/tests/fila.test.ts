import { strict as assert } from "node:assert";
import { test } from "node:test";
import { comTentativa, daConversa, esperaMs, expiradas, podeTentar, proximo, semItem, VALIDADE_MS, type Pendente } from "../src/core/fila";

const p = (id: string, contactId: string, criadoEm: number, tentativas = 0): Pendente =>
  ({ id, contactId, especie: "texto", texto: `msg ${id}`, criadoEm, tentativas });

test("recuo cresce e para no teto", () => {
  assert.equal(esperaMs(1), 2_000);
  assert.equal(esperaMs(2), 4_000);
  assert.equal(esperaMs(3), 8_000);
  assert.equal(esperaMs(10), 30_000, "não passa de 30s");
});

test("primeira tentativa é imediata; as seguintes esperam", () => {
  assert.ok(podeTentar(p("a", "c1", 1000), 1000));
  assert.ok(!podeTentar(p("a", "c1", 1000, 1), 1500), "1,5s < 2s de recuo");
  assert.ok(podeTentar(p("a", "c1", 1000, 1), 3500), "3,5s > 2s de recuo");
});

test("a ordem de digitação é preservada", () => {
  const fila = [p("b", "c1", 200), p("a", "c1", 100), p("c", "c1", 300)];
  assert.equal(proximo(fila, 1000)?.id, "a");
  assert.deepEqual(daConversa(fila, "c1").map((x) => x.id), ["a", "b", "c"]);
});

test("só entra na vez quem já pode tentar", () => {
  const fila = [p("a", "c1", 1000, 5), p("b", "c1", 2000)];
  assert.equal(proximo(fila, 2000)?.id, "b", "o que ainda está no recuo cede a vez");
});

test("conversa filtra por contato", () => {
  const fila = [p("a", "c1", 1), p("b", "c2", 2)];
  assert.deepEqual(daConversa(fila, "c2").map((x) => x.id), ["b"]);
});

test("remover e contar tentativa", () => {
  const fila = [p("a", "c1", 100), p("b", "c1", 200)];
  assert.deepEqual(semItem(fila, "a").map((x) => x.id), ["b"]);
  const depois = comTentativa(fila, "a", 999);
  assert.equal(depois[0]!.tentativas, 1);
  assert.equal(depois[0]!.criadoEm, 999, "o relógio do recuo reinicia");
  assert.equal(depois[1]!.tentativas, 0, "não mexe nos outros");
});

test("mensagem velha demais expira", () => {
  const agora = 10_000_000;
  const fila = [p("velha", "c1", agora - VALIDADE_MS - 1), p("nova", "c1", agora - 1000)];
  assert.deepEqual(expiradas(fila, agora).map((x) => x.id), ["velha"]);
});

test("mídia tem validade maior que texto", () => {
  const foto: Pendente = {
    id: "f", contactId: "c1", especie: "imagem", texto: "",
    arquivo: { uri: "file:///x.jpg", nome: "x.jpg", tipo: "image/jpeg" },
    criadoEm: 0, tentativas: 0,
  };
  const texto = p("t", "c1", 0);
  const duasHoras = 2 * 60 * 60 * 1000;
  assert.deepEqual(expiradas([texto], duasHoras).map((x) => x.id), ["t"], "texto de 2h já venceu");
  assert.deepEqual(expiradas([foto], duasHoras).map((x) => x.id), [], "foto ainda vale");
  assert.deepEqual(expiradas([foto], 4 * duasHoras).map((x) => x.id), ["f"], "mas não para sempre");
});
