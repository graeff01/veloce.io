import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesBlockedPhone } from "../lib/ai-agent/blocklist";

// A lista global bloqueia números tolerando o 9º dígito e o código de país do BR
// (a Cloud API às vezes entrega SEM o 9; o cadastro pode estar COM).
test("matchesBlockedPhone: casa o mesmo número BR mesmo com variação de formato", () => {
  const blocked = ["5551991597229"]; // cadastrado com 9 e código de país
  assert.equal(matchesBlockedPhone(blocked, "5551991597229"), true); // idêntico
  assert.equal(matchesBlockedPhone(blocked, "555191597229"), true);  // SEM o 9 (como a Meta entrega)
  assert.equal(matchesBlockedPhone(blocked, "51991597229"), true);   // sem código de país
  assert.equal(matchesBlockedPhone(blocked, "5191597229"), true);    // sem país e sem o 9
});

test("matchesBlockedPhone: cadastro sem o 9 casa a mensagem com o 9", () => {
  const blocked = ["555191597229"]; // cadastrado SEM o 9
  assert.equal(matchesBlockedPhone(blocked, "5551991597229"), true);
});

test("matchesBlockedPhone: número diferente NÃO casa; lista vazia nunca casa", () => {
  assert.equal(matchesBlockedPhone(["5551991597229"], "5551988887777"), false);
  assert.equal(matchesBlockedPhone([], "5551991597229"), false);
});

test("matchesBlockedPhone: acha o número certo dentro de uma lista", () => {
  const blocked = ["5511999990000", "5551991597229", "5541988887777"];
  assert.equal(matchesBlockedPhone(blocked, "555191597229"), true);
  assert.equal(matchesBlockedPhone(blocked, "5599123456789"), false);
});
