import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePassword, validEmail, slotsLeft, canRegister, MIN_PASSWORD } from "../lib/portal-password";

test("validatePassword: mínimo de caracteres", () => {
  assert.equal(validatePassword("1234567").ok, false);      // 7 < 8
  assert.equal(validatePassword("12345678").ok, true);      // 8 ok
  assert.equal(validatePassword(undefined).ok, false);
  assert.equal(validatePassword("a".repeat(201)).ok, false); // longa demais
  assert.equal(MIN_PASSWORD, 8);
});

test("validEmail", () => {
  assert.equal(validEmail("joao@loja.com"), true);
  assert.equal(validEmail("joao@loja"), false);
  assert.equal(validEmail("sem-arroba.com"), false);
  assert.equal(validEmail(""), false);
});

test("teto de usuários: slotsLeft/canRegister", () => {
  assert.equal(slotsLeft(0, 3), 3);
  assert.equal(slotsLeft(3, 3), 0);
  assert.equal(slotsLeft(5, 3), 0);   // nunca negativo
  assert.equal(canRegister(2, 3), true);
  assert.equal(canRegister(3, 3), false);
});
