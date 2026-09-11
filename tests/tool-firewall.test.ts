import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeToolArgs } from "../lib/ai-agent/security/tool-firewall";

// ── A garantia que sustenta "não muda o comportamento" ────────────────────────
// Para argumentos LEGÍTIMOS o saneador tem que ser IDENTIDADE. Se ele alterar um
// único caso real, o atendimento muda — e o controle vira bug.

test("argumentos legítimos passam intactos (identidade)", () => {
  const casos: [string, Record<string, unknown>][] = [
    ["buscar_estoque", { termo: "Taos Highline" }],
    ["buscar_estoque", { preco_de: 20000, preco_ate: 25000 }],
    ["buscar_estoque", { termo: "Tiguan preto", preco_ate: 150000 }],
    ["enviar_foto", { termo: "Gourmet 2m", quantidade: 4, interior: true }],
    ["enviar_foto", {}],
    ["atualizar_perfil", { produto: "Churrasqueira Gourmet", tem_troca: false, forma_pagamento: "avista" }],
    ["atualizar_perfil", { pronto_para_comprar: true, urgencia: "essa semana" }],
    ["escalar_humano", { motivo: "cliente quer negociar o valor final" }],
    ["reagir", { emoji: "❤️" }],
    ["enviar_localizacao_loja", {}],
    ["enviar_catalogo", { categoria: "lareira" }],
    ["pedir_localizacao", { cidade: "Porto Alegre" }],
    ["atualizar_ficha", { campos: { modelo: "Gourmet 2m", cidade_entrega: "Canoas", largura: 200 } }],
    ["gerar_orcamento", { base: ["gourmet-2m"], opcionais: ["tampa", "grelha"], montagem: true, pagamento: "dinheiro" }],
    ["gerar_orcamento", { base: ["x"], acesso: { lances: 3, caracol: true, elevador: false } }],
    ["gerar_orcamento", { base: ["x"], retirada: true, quantidades: { "x": 2 } }],
    ["enviar_orcamento", {}],
    ["enviar_orcamento", { quoteId: "cm5xk2p9q0001abcd1234efgh" }],
    ["aprovar_orcamento", { motivo: "cliente aprovou o orçamento" }],
  ];
  for (const [tool, args] of casos) {
    const r = sanitizeToolArgs(tool, args);
    assert.deepEqual(r.args, args, `alterou ${tool}: ${JSON.stringify(r.args)}`);
    assert.equal(r.changed, false, `marcou como alterado: ${tool}`);
  }
});

test("booleano NÃO é coagido (preserva a semântica atual das tools)", () => {
  // As tools testam `typeof x === "boolean"` / `x === true`: uma string "false"
  // é IGNORADA hoje. Coagir viraria `true` e mudaria o orçamento. Deve sumir.
  const r = sanitizeToolArgs("gerar_orcamento", { base: ["x"], montagem: "false" });
  assert.equal(r.args.montagem, undefined);
  assert.deepEqual(r.args.base, ["x"]);
});

test("número em string é coagido (como o código já faz com Number())", () => {
  const r = sanitizeToolArgs("buscar_estoque", { preco_ate: "25000" });
  assert.equal(r.args.preco_ate, 25000);
});

test("chave desconhecida é removida", () => {
  const r = sanitizeToolArgs("enviar_foto", { termo: "Taos", __proto__hack: "x", extra: 1 });
  assert.deepEqual(Object.keys(r.args), ["termo"]);
  assert.equal(r.changed, true);
});

test("string gigante é truncada (anti-inflação de contexto e de banco)", () => {
  const r = sanitizeToolArgs("escalar_humano", { motivo: "A".repeat(5000) });
  assert.equal((r.args.motivo as string).length, 600);
  assert.equal(r.changed, true);
});

test("array gigante é limitado", () => {
  const base = Array.from({ length: 500 }, (_, i) => `item-${i}`);
  const r = sanitizeToolArgs("gerar_orcamento", { base });
  assert.equal((r.args.base as string[]).length, 30);
});

test("lances de escada tem teto são (o motor multiplica por lance)", () => {
  const r = sanitizeToolArgs("gerar_orcamento", { base: ["x"], acesso: { lances: 99999 } });
  assert.equal((r.args.acesso as { lances: number }).lances, 60);
});

test("mapa livre é limitado em nº de chaves e tamanho de valor", () => {
  const campos: Record<string, unknown> = {};
  for (let i = 0; i < 200; i++) campos[`k${i}`] = "v";
  campos.grande = "B".repeat(2000);
  const r = sanitizeToolArgs("atualizar_ficha", { campos });
  const out = r.args.campos as Record<string, unknown>;
  assert.ok(Object.keys(out).length <= 40);
  // Os valores que sobrarem estão truncados.
  for (const v of Object.values(out)) if (typeof v === "string") assert.ok(v.length <= 500);
});

test("entrada não-objeto vira objeto vazio (nunca lança)", () => {
  assert.deepEqual(sanitizeToolArgs("buscar_estoque", null).args, {});
  assert.deepEqual(sanitizeToolArgs("buscar_estoque", "texto").args, {});
  assert.deepEqual(sanitizeToolArgs("buscar_estoque", []).args, {});
});

test("ferramenta sem esquema passa direto (o switch fechado trata)", () => {
  const args = { qualquer: "coisa" };
  const r = sanitizeToolArgs("ferramenta_inexistente", args);
  assert.deepEqual(r.args, args);
  assert.equal(r.changed, false);
});
