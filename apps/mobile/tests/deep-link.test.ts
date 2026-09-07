import { test } from "node:test";
import assert from "node:assert/strict";
import { contatoDaNotificacao, rotaDaNotificacao } from "../src/core/deep-link";

// O payload de push vem de fora do app. Tratar `route` como caminho confiável
// seria deixar uma notificação decidir para onde o app navega.

test("notificação de conversa abre a conversa certa", () => {
  assert.equal(rotaDaNotificacao("conversas/clx123abc"), "/(app)/conversas/clx123abc");
});

test("notificação de revisão e fechamento abrem suas telas", () => {
  assert.equal(rotaDaNotificacao("revisao"), "/(app)/revisao");
  assert.equal(rotaDaNotificacao("fechamento"), "/(app)/fechamento");
});

test("barra inicial e espaços não atrapalham", () => {
  assert.equal(rotaDaNotificacao("  /conversas  "), "/(app)/conversas");
});

test("rota desconhecida NÃO navega", () => {
  assert.equal(rotaDaNotificacao("configuracoes"), null);
  assert.equal(rotaDaNotificacao("admin"), null);
  assert.equal(rotaDaNotificacao(""), null);
  assert.equal(rotaDaNotificacao("   "), null);
});

test("payload que não é texto é ignorado", () => {
  assert.equal(rotaDaNotificacao(undefined), null);
  assert.equal(rotaDaNotificacao(null), null);
  assert.equal(rotaDaNotificacao(42), null);
  assert.equal(rotaDaNotificacao({ route: "conversas" }), null);
});

test("travessia de caminho no id da conversa é recusada", () => {
  assert.equal(rotaDaNotificacao("conversas/../../perfil"), null);
  assert.equal(rotaDaNotificacao("conversas/abc/def"), "/(app)/conversas/abc", "segmento extra é ignorado");
  assert.equal(rotaDaNotificacao("conversas/id com espaço"), null);
  assert.equal(rotaDaNotificacao("conversas/" + "x".repeat(65)), null);
});

test("tentativa de abrir URL externa é recusada", () => {
  assert.equal(rotaDaNotificacao("https://malicioso.test"), null);
  assert.equal(rotaDaNotificacao("javascript:alert(1)"), null);
});

// ── Responder pela notificação ────────────────────────────────────────────────
// O contactId vem de FORA (payload do push). Se ele entrasse cru numa URL, um
// payload forjado escolheria a conversa para onde a resposta vai.

test("contatoDaNotificacao aceita cuid e recusa o resto", () => {
  assert.equal(contatoDaNotificacao("cmtr6qc2t0000ub2c9k3x91nc"), "cmtr6qc2t0000ub2c9k3x91nc");
  assert.equal(contatoDaNotificacao(" abc123 "), "abc123");
  assert.equal(contatoDaNotificacao("../outra"), null);
  assert.equal(contatoDaNotificacao("abc/def"), null);
  assert.equal(contatoDaNotificacao(""), null);
  assert.equal(contatoDaNotificacao(42), null);
  assert.equal(contatoDaNotificacao("a".repeat(65)), null);
});
