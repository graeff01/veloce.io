import { test } from "node:test";
import assert from "node:assert/strict";
import { MemoryCounter, windowStartOf, bucketKey } from "../lib/ai-agent/security/quota";

test("windowStartOf alinha a janela", () => {
  assert.equal(windowStartOf(1_000, 60_000), 0);
  assert.equal(windowStartOf(60_000, 60_000), 60_000);
  assert.equal(windowStartOf(119_999, 60_000), 60_000);
  assert.equal(windowStartOf(120_000, 60_000), 120_000);
});

test("bucketKey isola escopo, chave e janela", () => {
  assert.equal(bucketKey("a", "x", 1_000, 60_000), "a:x:0");
  assert.notEqual(bucketKey("a", "x", 1_000, 60_000), bucketKey("b", "x", 1_000, 60_000));
  assert.notEqual(bucketKey("a", "x", 1_000, 60_000), bucketKey("a", "y", 1_000, 60_000));
  // Janela seguinte = chave nova (o contador reinicia).
  assert.notEqual(bucketKey("a", "x", 1_000, 60_000), bucketKey("a", "x", 61_000, 60_000));
});

test("MemoryCounter conta dentro da janela e reinicia depois", () => {
  const c = new MemoryCounter();
  const exp = 60_000;
  assert.equal(c.hit("k", exp, 0), 1);
  assert.equal(c.hit("k", exp, 10), 2);
  assert.equal(c.hit("k", exp, 20), 3);
  assert.equal(c.peek("k", 20), 3);
  // Após expirar, o contador zera.
  assert.equal(c.peek("k", 60_001), 0);
  assert.equal(c.hit("k", 120_000, 60_001), 1);
});

test("MemoryCounter varre entradas vencidas (sem vazamento de memória)", () => {
  const c = new MemoryCounter();
  for (let i = 0; i < 500; i++) c.hit(`k${i}`, 1_000, 0);
  assert.equal(c.size, 500);
  // Passado o intervalo de varredura, um novo hit limpa o que venceu.
  c.hit("novo", 200_000, 130_000);
  assert.ok(c.size < 500, `esperava varrer, ficou com ${c.size}`);
});

test("chaves distintas não interferem", () => {
  const c = new MemoryCounter();
  c.hit("a", 60_000, 0);
  c.hit("a", 60_000, 0);
  c.hit("b", 60_000, 0);
  assert.equal(c.peek("a", 0), 2);
  assert.equal(c.peek("b", 0), 1);
});
