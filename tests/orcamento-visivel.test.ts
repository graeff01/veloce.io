import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

// ── O orçamento que ninguém via ──────────────────────────────────────────────
// Encontrado na JR: a IA monta o orçamento (status `draft`) e ele só chega à
// fila de aprovação se ela chamar a SEGUNDA ferramenta. Quando não chama, o
// orçamento some: a fila de revisão busca só `pending_review` e a aba de
// orçamentos buscava só enviados. Nove orçamentos, R$ 27 mil, com o lead ainda
// conversando em todos os nove casos.

test("a aba de orçamentos mostra os montados e os que aguardam aval", () => {
  const rota = ler("app", "api", "portal", "[token]", "quotes", "route.ts");
  const m = rota.match(/status: \{ in: \[([^\]]+)\] \}/);
  assert.ok(m, "não achei o filtro de status");
  const estados = m[1].split(",").map((s) => s.trim().replace(/"/g, ""));
  for (const e of ["sent", "approved", "rejected", "draft", "pending_review"]) {
    assert.ok(estados.includes(e), `"${e}" precisa aparecer na aba — senão fica invisível`);
  }
});

test("todo status buscado tem rótulo na tela", () => {
  // Sem rótulo, o StatusPill cai no nome cru do banco ("draft") — que não diz
  // nada para quem vende.
  const rota = ler("app", "api", "portal", "[token]", "quotes", "route.ts");
  const tela = ler("components", "portal", "portal-quotes.tsx");
  const estados = (rota.match(/status: \{ in: \[([^\]]+)\] \}/) ?? [])[1]
    .split(",").map((s) => s.trim().replace(/"/g, ""));
  const mapa = tela.slice(tela.indexOf("const STATUS"), tela.indexOf("function StatusPill"));
  for (const e of estados) {
    assert.ok(mapa.includes(`${e}:`), `falta rótulo para "${e}"`);
  }
});

test("o rótulo do montado fala de venda, não de banco de dados", () => {
  const tela = ler("components", "portal", "portal-quotes.tsx");
  const linha = tela.split("\n").find((l) => l.trim().startsWith("draft:")) ?? "";
  assert.ok(!/rascunho/i.test(linha), "'rascunho' faz parecer descartável — é orçamento pronto");
  assert.match(linha, /não enviado/i, "precisa dizer o que falta acontecer");
});
