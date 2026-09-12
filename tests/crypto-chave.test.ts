import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── A chave de cifra ─────────────────────────────────────────────────────────
// O que se guarda cifrado aqui é o token de WhatsApp de todo cliente, o App
// Secret e o token da Meta. Havia um fallback para uma constante escrita NESTE
// arquivo — inalcançável em produção, mas com o pior modo de falha que existe:
// um ambiente sem as variáveis passaria a cifrar tudo com uma chave pública,
// sem erro e sem aviso.

const fonte = readFileSync(join(process.cwd(), "lib", "crypto.ts"), "utf8");

test("a CIFRA nunca cai numa chave literal", () => {
  // A asserção é sobre o caminho de cifrar, e só ele. Um literal na decifragem
  // é outra coisa (ver o último teste): ler um dado antigo não põe dado novo em
  // risco. Escrever com chave pública, sim.
  const corpo = fonte.slice(fonte.indexOf("function encryptKeySecret"));
  const ateOFim = corpo.slice(0, corpo.indexOf("\n}"));
  assert.ok(!/\?\?\s*"/.test(ateOFim), "fallback para string literal voltou na cifra");
  assert.ok(!/push\("/.test(ateOFim), "nem por outro caminho");
});

test("sem chave, recusa cifrar em vez de improvisar", () => {
  const corpo = fonte.slice(fonte.indexOf("function encryptKeySecret"));
  assert.match(corpo.slice(0, 700), /throw new Error/,
    "um serviço que não sabe cifrar deve se recusar a guardar segredo");
});

test("a DECIFRAGEM continua tolerante — de propósito", () => {
  // Recusar a cifrar é segurança. Recusar a decifrar seria quebrar tudo o que
  // já está no banco — inclusive o que foi cifrado com a chave antiga.
  const corpo = fonte.slice(fonte.indexOf("function decryptKeys"));
  const ateOFim = corpo.slice(0, corpo.indexOf("\n}"));
  assert.match(ateOFim, /ENCRYPTION_KEY_OLD/, "a chave anterior tem que continuar sendo tentada");
  assert.match(ateOFim, /NEXTAUTH_SECRET/, "e a de sessão também, pelo legado");
  assert.ok(!/throw/.test(ateOFim), "decifrar não pode lançar por falta de chave");
});
