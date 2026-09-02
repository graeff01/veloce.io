import { test } from "node:test";
import assert from "node:assert/strict";
import { bearerFromHeader, parseDevice } from "@/lib/portal-auth";
import { rateIdentity } from "@/lib/portal-guard";
import { SESSION_SCOPED } from "@/lib/notifications/client-portal";

// ── Camada de autorização do app nativo ───────────────────────────────────────
// O app manda o MESMO sessionToken que o PWA guarda no cookie, mas em
// `Authorization: Bearer`. Estes testes cobrem as funções PURAS desse caminho —
// as que decidem se uma credencial é aceita e como ela vira chave de rate limit.

const req = (auth?: string) =>
  new Request("https://exemplo.test/api/portal/_session/conversations", {
    headers: auth ? { authorization: auth } : {},
  });

// ── bearerFromHeader ──────────────────────────────────────────────────────────

test("bearerFromHeader: extrai o token de um header bem formado", () => {
  assert.equal(bearerFromHeader("Bearer abc123"), "abc123");
});

test("bearerFromHeader: esquema é case-insensitive (RFC 7235)", () => {
  assert.equal(bearerFromHeader("bearer abc123"), "abc123");
  assert.equal(bearerFromHeader("BEARER abc123"), "abc123");
});

test("bearerFromHeader: tolera espaços em volta e tab como separador", () => {
  assert.equal(bearerFromHeader("  Bearer   abc123  "), "abc123");
  assert.equal(bearerFromHeader("Bearer\tabc123"), "abc123");
});

test("bearerFromHeader: recusa esquema diferente de Bearer", () => {
  assert.equal(bearerFromHeader("Basic dXNlcjpwYXNz"), null);
  assert.equal(bearerFromHeader("Token abc123"), null);
});

test("bearerFromHeader: recusa header ausente, vazio ou sem credencial", () => {
  assert.equal(bearerFromHeader(null), null);
  assert.equal(bearerFromHeader(undefined), null);
  assert.equal(bearerFromHeader(""), null);
  assert.equal(bearerFromHeader("Bearer"), null);
  assert.equal(bearerFromHeader("Bearer   "), null);
});

test("bearerFromHeader: não aceita credencial com espaço no meio (evita header forjado)", () => {
  assert.equal(bearerFromHeader("Bearer abc 123"), null);
});

// ── parseDevice ───────────────────────────────────────────────────────────────

test("parseDevice: aceita um aparelho bem descrito", () => {
  const d = parseDevice({ id: "A1B2C3D4-1111-2222-3333-444455556666", name: "iPhone da Maria", platform: "ios" });
  assert.equal(d?.id, "A1B2C3D4-1111-2222-3333-444455556666");
  assert.equal(d?.name, "iPhone da Maria");
  assert.equal(d?.platform, "ios");
});

test("parseDevice: sem device → sessão de navegador (comportamento atual preservado)", () => {
  assert.equal(parseDevice(undefined), null);
  assert.equal(parseDevice(null), null);
  assert.equal(parseDevice("ios"), null);
  assert.equal(parseDevice(123), null);
  assert.equal(parseDevice({}), null);
});

test("parseDevice: recusa id curto demais ou longo demais", () => {
  assert.equal(parseDevice({ id: "curto" }), null);
  assert.equal(parseDevice({ id: "x".repeat(129) }), null);
});

test("parseDevice: recusa id com caractere fora do alfabeto permitido", () => {
  assert.equal(parseDevice({ id: "abcdefgh; DROP TABLE" }), null);
  assert.equal(parseDevice({ id: "abcdefgh/../../etc" }), null);
  assert.equal(parseDevice({ id: "abcdefgh<script>" }), null);
});

test("parseDevice: plataforma desconhecida vira null em vez de ser aceita crua", () => {
  assert.equal(parseDevice({ id: "abcdefgh12345678", platform: "windows" })?.platform, null);
  assert.equal(parseDevice({ id: "abcdefgh12345678", platform: "IOS" })?.platform, "ios");
});

test("parseDevice: nome é truncado (não vira campo livre de tamanho arbitrário)", () => {
  const d = parseDevice({ id: "abcdefgh12345678", name: "N".repeat(500) });
  assert.equal(d?.name?.length, 80);
});

test("parseDevice: nome vazio vira null (não grava string vazia)", () => {
  assert.equal(parseDevice({ id: "abcdefgh12345678", name: "   " })?.name, null);
});

// ── rateIdentity ──────────────────────────────────────────────────────────────

test("rateIdentity: token de portal mantém a chave de hoje (prefixo de 24)", () => {
  const token = "T".repeat(40);
  assert.equal(rateIdentity(token, req()), "T".repeat(24));
});

test("rateIdentity: aparelhos diferentes NÃO compartilham o mesmo balde", () => {
  const a = rateIdentity(SESSION_SCOPED, req("Bearer sessao-do-aparelho-A"));
  const b = rateIdentity(SESSION_SCOPED, req("Bearer sessao-do-aparelho-B"));
  assert.notEqual(a, b, "dois aparelhos cairiam no mesmo teto de 240/min");
});

test("rateIdentity: mesma credencial gera sempre a mesma chave (janela estável)", () => {
  const a = rateIdentity(SESSION_SCOPED, req("Bearer credencial-estavel"));
  const b = rateIdentity(SESSION_SCOPED, req("Bearer credencial-estavel"));
  assert.equal(a, b);
});

test("rateIdentity: o token de sessão NUNCA aparece em claro na chave", () => {
  const segredo = "token-de-sessao-super-secreto";
  const key = rateIdentity(SESSION_SCOPED, req(`Bearer ${segredo}`));
  assert.ok(!key.includes(segredo), "segredo vazaria para a tabela RateBucket");
  assert.ok(!key.includes(segredo.slice(0, 12)), "prefixo do segredo vazaria");
  assert.ok(key.startsWith("dev:"));
});

test("rateIdentity: sentinela sem credencial não quebra (cai em balde comum)", () => {
  assert.equal(rateIdentity(SESSION_SCOPED, req()), SESSION_SCOPED);
});
