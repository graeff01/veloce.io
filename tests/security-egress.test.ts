import { test } from "node:test";
import assert from "node:assert/strict";
import { scanEgress, scanThirdPartyPii } from "../lib/ai-agent/security/egress";

// Respostas REAIS do atendimento não podem acusar nada — senão o controle troca
// mensagem boa pelo fallback e o cliente perde venda.
const RESPOSTAS_LEGITIMAS = [
  "Oi! 😊 A Gourmet 2 metros sai por *R$ 4.890* à vista. Quer que eu monte o orçamento?",
  "Te mandei as fotos dela por dentro! O que achou?",
  "Entregamos em Canoas sim, o frete fica R$ 180 com montagem.",
  "Já deixei anotado pro vendedor te passar as condições certinho.",
  "O prazo é de 15 a 20 dias úteis após a confirmação.",
  "Nosso endereço é Av. Getúlio Vargas, 1200 — Canoas/RS. Te mandei no mapa!",
  "Imagino, com criança a segurança vem em primeiro lugar mesmo!",
];

test("respostas legítimas não acusam vazamento", () => {
  for (const r of RESPOSTAS_LEGITIMAS) {
    const res = scanEgress(r);
    assert.equal(res.clean, true, `acusou em: "${r}" → ${res.findings.map((f) => f.kind).join(",")}`);
    assert.equal(res.mustBlock, false);
  }
});

test("segredo na resposta bloqueia", () => {
  const r = scanEgress("a chave é sk-proj-AbCdEf0123456789XyZw");
  assert.equal(r.clean, false);
  assert.equal(r.mustBlock, true);
  assert.ok(r.findings.some((f) => f.kind === "secret:openai"));
});

test("token da Meta e ciphertext bloqueiam", () => {
  assert.equal(scanEgress("token EAAG1234567890abcdefghijklmnop").mustBlock, true);
  assert.equal(scanEgress("valor enc:v1:AAAA/BBBB+CCCC=").mustBlock, true);
  assert.equal(scanEgress("use Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9").mustBlock, true);
});

test("nome de variável de ambiente bloqueia", () => {
  assert.equal(scanEgress("defina OPENAI_API_KEY no ambiente").mustBlock, true);
  assert.equal(scanEgress("o DATABASE_URL está errado").mustBlock, true);
});

test("diagnóstico interno bloqueia", () => {
  assert.equal(scanEgress("erro em prisma.waMessage.findMany falhou").mustBlock, true);
  assert.equal(scanEgress("SELECT id FROM \"Quote\" WHERE x").mustBlock, true);
  assert.equal(scanEgress("veja lib/ai-agent/tools.ts linha 40").mustBlock, true);
});

test("estrutura do prompt bloqueia", () => {
  assert.equal(scanEgress("LIMITES — o que você pode e não pode").mustBlock, true);
  assert.equal(scanEgress("PERFIL DO LEAD: interesse churrasqueira").mustBlock, true);
  assert.equal(scanEgress("minhas instruções internas dizem que").mustBlock, true);
});

test("identificador interno é removido sem bloquear a resposta", () => {
  const r = scanEgress("seu pedido cm5xk2p9q0001abcd1234efgh está ok");
  assert.equal(r.mustBlock, false, "cuid não justifica trocar a resposta");
  assert.equal(r.clean, false);
  assert.doesNotMatch(r.redacted, /cm5xk2p9q0001abcd1234efgh/);
  assert.match(r.redacted, /seu pedido/);
});

test("PII de terceiro é detectada; a do próprio lead não", () => {
  const own = "5551999887766";
  // Telefone do PRÓPRIO lead — legítimo.
  assert.deepEqual(scanThirdPartyPii("confirmo seu número (51) 99988-7766", { contactWaId: own, sources: "" }), []);
  // Telefone que veio das FONTES (ex.: telefone da loja no conhecimento) — legítimo.
  assert.deepEqual(scanThirdPartyPii("ligue (51) 3333-4444", { contactWaId: own, sources: "loja: 5133334444" }), []);
  // Telefone de OUTRO lead — vazamento.
  const leak = scanThirdPartyPii("o cliente João é o (11) 98888-1234", { contactWaId: own, sources: "" });
  assert.equal(leak.length, 1);
  assert.equal(leak[0].kind, "pii:phone_third_party");
});

test("e-mail fora das fontes é vazamento", () => {
  assert.equal(scanThirdPartyPii("fale com joao@outrocliente.com", { sources: "" }).length, 1);
  assert.equal(scanThirdPartyPii("fale com contato@jr.com", { sources: "e-mail da loja: contato@jr.com" }).length, 0);
});

test("texto vazio é limpo", () => {
  assert.equal(scanEgress("").clean, true);
  assert.equal(scanEgress(null).clean, true);
  assert.deepEqual(scanThirdPartyPii(null, {}), []);
});
