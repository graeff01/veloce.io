import { test } from "node:test";
import assert from "node:assert/strict";
import { brKey, sameBrazilNumber, brVariants } from "../lib/phone-br";

test("brKey reduz formas BR à mesma chave (com/sem 9, com/sem país)", () => {
  assert.equal(brKey("5551991597229"), "5191597229"); // país + 9
  assert.equal(brKey("555191597229"), "5191597229");  // país, sem 9
  assert.equal(brKey("51991597229"), "5191597229");   // sem país, com 9
  assert.equal(brKey("5191597229"), "5191597229");    // só DDD + assinante
  assert.equal(brKey("+55 (51) 99159-7229"), "5191597229"); // com máscara
});

test("sameBrazilNumber casa o caso real do canário (9º dígito)", () => {
  assert.ok(sameBrazilNumber("5551991597229", "555191597229"));
  assert.ok(sameBrazilNumber("51991597229", "555191597229"));
  assert.ok(!sameBrazilNumber("5551991597229", "5551888887777"));
});

test("brVariants gera as formas com e sem 9 (e com país)", () => {
  const v = brVariants("5551991597229");
  assert.ok(v.includes("555191597229")); // sem 9, com país
  assert.ok(v.includes("5551991597229")); // com 9, com país
  assert.ok(v.includes("5191597229"));   // sem 9, sem país
  assert.ok(v.includes("51991597229"));  // com 9, sem país
});
