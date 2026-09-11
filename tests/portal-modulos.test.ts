import { test } from "node:test";
import assert from "node:assert/strict";
import { modulosPortal } from "@/lib/portal/modulos";

// ── Barra inferior do PWA no celular ──────────────────────────────────────────
// Os MESMOS casos do teste do aplicativo (apps/mobile/tests/inbox.test.ts). Se as
// duas barras discordarem sobre o que a vendedora enxerga, ela encontra um app e
// um site diferentes — e passa a desconfiar dos dois.

const chaves = (s: string[] | null, q = true) => modulosPortal(s, q).map((m) => m.chave);

test("lista VAZIA é configuração ausente, não proibição", () => {
  // A JR ficou sem barra no celular e a Boqueirão não. A diferença era esta: uma
  // tinha `sections` configurado, a outra nulo. Lista vazia caía no mesmo buraco
  // e apagava a navegação inteira — sem erro, sem aviso.
  assert.deepEqual(chaves([]), ["conversas", "anuncios", "funil", "revisao"]);
  assert.deepEqual(chaves(null), chaves([]), "nulo e vazio significam a mesma coisa");
});

test("uma seção de verdade continua limitando", () => {
  assert.deepEqual(chaves(["conversas"]), ["conversas"]);
  assert.deepEqual(chaves(["conversas", "funil"]), ["conversas", "funil"]);
});

test("sections nulo = cliente sem configuração = tudo", () => {
  assert.deepEqual(chaves(null), ["conversas", "anuncios", "funil", "revisao"]);
});

test("a ordem vem do produto, não da ordem que o servidor devolveu", () => {
  assert.deepEqual(
    chaves(["anuncios", "revisao", "funil", "conversas"]),
    ["conversas", "anuncios", "funil", "revisao"],
  );
});

test("no máximo quatro destinos — o excedente vive dentro do módulo", () => {
  const todas = ["painel", "revisao", "fechamento", "conversas", "aprendizado", "consumo",
    "frete", "equipe", "anuncios", "ia", "funil", "objecoes"];
  assert.equal(modulosPortal(todas, true).length, 4);
});

test("orçamento desligado no cliente derruba a aba, mas o fechamento a segura", () => {
  assert.deepEqual(chaves(["conversas", "revisao"], false), ["conversas"]);
  assert.deepEqual(chaves(["conversas", "revisao", "fechamento"], false), ["conversas", "revisao"]);
});

test("quem tem só fechamento ainda alcança a tela onde ele mora", () => {
  assert.deepEqual(chaves(["conversas", "fechamento"], false), ["conversas", "revisao"]);
});

test("o caminho de cada módulo é o do portal", () => {
  const m = modulosPortal(null, true);
  assert.deepEqual(m.map((x) => x.caminho), ["/conversas", "/anuncios", "/funil", "/revisao"]);
});
