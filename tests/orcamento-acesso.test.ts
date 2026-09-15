import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeQuote, type PricingRules } from "../lib/ai-agent/pricing";

const tools = readFileSync(join(process.cwd(), "lib", "ai-agent", "tools.ts"), "utf8");

// ── A suposição de térreo não pode ser silenciosa ────────────────────────────
// Pedido da Maria (item 4): "não perguntou se a montagem era em local térreo
// antes de montar o orçamento". A trava existente exige que o acesso seja
// INFORMADO, mas não tem como saber se foi PERGUNTADO — passando `{lances: 0}`
// ela é satisfeita sem ninguém falar com o lead.

// Mesmos valores de acesso que a JR usa em produção.
const REGRAS: PricingRules = {
  base: [{ key: "churrasqueira", label: "Churrasqueira", amount: 1000, montagem: 300 }],
  policies: { access: { spiral: 200, elevator: 100, stairPerFlight: 100 } },
};
const sel = (access: { flights?: number; spiral?: boolean; elevator?: boolean }) =>
  ({ base: ["churrasqueira"], montagem: true, access });

test("acesso vale dinheiro — é por isso que a pergunta importa", () => {
  const terreo = computeQuote(REGRAS, sel({ flights: 0 }));
  const terceiro = computeQuote(REGRAS, sel({ flights: 3 }));
  const caracol = computeQuote(REGRAS, sel({ spiral: true }));
  assert.ok(terreo.ok && terceiro.ok && caracol.ok);
  assert.equal(terceiro.quote.total - terreo.quote.total, 300, "3 lances = R$ 300");
  assert.equal(caracol.quote.total - terreo.quote.total, 200, "caracol = R$ 200");
});

test("térreo NÃO gera linha no orçamento — por isso a suposição some da vista", () => {
  const r = computeQuote(REGRAS, sel({ flights: 0 }));
  assert.ok(r.ok);
  const temAcesso = r.quote.items.some((i) => /acesso/i.test(i.label));
  assert.equal(temAcesso, false,
    "se um dia térreo virar linha visível, o aviso em tools.ts fica redundante");
});

test("quando assume térreo, o orçamento avisa", () => {
  const bloco = tools.slice(tools.indexOf("const acessoTerreo"), tools.indexOf("q = appendFeeLine"));
  assert.match(bloco, /!acesso\.elevador/);
  assert.match(bloco, /acesso\.caracol !== true/);
  assert.match(bloco, /Number\(acesso\.lances\) > 0/);
  assert.match(bloco, /considerou o local TÉRREO/);
  assert.match(bloco, /ANTES de fechar/);
});

test("o aviso NÃO bloqueia o orçamento", () => {
  // Bloquear arriscaria travar orçamento legítimo num cliente em produção —
  // remédio pior que a doença. O aviso só torna a suposição visível.
  const bloco = tools.slice(tools.indexOf("const acessoTerreo"), tools.indexOf("q = appendFeeLine"));
  assert.ok(!/return \{ result/.test(bloco), "não pode interromper a geração");
  assert.match(bloco, /notaExtra \+=/, "entra como aviso, não como bloqueio");
});

test("a trava de acesso ausente continua de pé", () => {
  // O aviso é ADICIONAL. Sem acesso nenhum, o orçamento segue sendo recusado.
  assert.match(tools, /if \(montagemAplica && !acesso\) \{[\s\S]{0,120}AINDA NÃO feche o orçamento/);
});
