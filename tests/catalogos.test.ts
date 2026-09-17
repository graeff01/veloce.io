import { test } from "node:test";
import assert from "node:assert/strict";
import { lerCatalogos, resolverCatalogo, categoriasDisponiveis, descreverCatalogos } from "../lib/ai-agent/catalogos";

const JR = {
  catalogos: [
    { chave: "conjunto_fogao", rotulo: "conjuntos: churrasqueira + fogão/forno", url: "https://ex.com/a.pdf" },
    { chave: "churrasqueiras", rotulo: "churrasqueiras avulsas", url: "https://ex.com/b.pdf" },
  ],
  catalogPdfUrl: "https://ex.com/completo.pdf",
  lareirasPdfUrl: "https://ex.com/lareiras.pdf",
};

// ── Compatibilidade: quem não configurou recorte não pode mudar de comportamento ──
// Boqueirão e os demais clientes passam por aqui. Regressão silenciosa aqui
// quebraria o catálogo de todo mundo.
test("cliente SEM recortes continua igual a antes", () => {
  const semRecorte = { catalogos: [], catalogPdfUrl: "https://ex.com/completo.pdf", lareirasPdfUrl: "https://ex.com/lareiras.pdf" };
  assert.deepEqual(resolverCatalogo("churrasqueira", semRecorte), { url: "https://ex.com/completo.pdf", nome: "churrasqueiras" });
  assert.deepEqual(resolverCatalogo("lareira", semRecorte), { url: "https://ex.com/lareiras.pdf", nome: "lareiras" });
  assert.deepEqual(resolverCatalogo("", semRecorte), { url: "https://ex.com/completo.pdf", nome: "churrasqueiras" });
  assert.deepEqual(categoriasDisponiveis(semRecorte), ["churrasqueira", "lareira"]);
  assert.equal(descreverCatalogos([]), "");
});

test("cliente sem PDF nenhum devolve null (a tool avisa e segue por texto)", () => {
  assert.equal(resolverCatalogo("churrasqueira", { catalogos: [], catalogPdfUrl: null, lareirasPdfUrl: null }), null);
  assert.equal(resolverCatalogo("lareira", { catalogos: [], catalogPdfUrl: "https://ex.com/c.pdf", lareirasPdfUrl: null }), null);
});

// ── Recortes ──────────────────────────────────────────────────────────────────
test("recorte configurado tem precedência e traz o rótulo certo", () => {
  assert.deepEqual(resolverCatalogo("conjunto_fogao", JR), { url: "https://ex.com/a.pdf", nome: "conjuntos: churrasqueira + fogão/forno" });
});

test("categoria desconhecida cai no catálogo completo, não em erro", () => {
  assert.deepEqual(resolverCatalogo("inventada", JR), { url: "https://ex.com/completo.pdf", nome: "churrasqueiras" });
});

test("o enum da tool sai da config do cliente", () => {
  assert.deepEqual(categoriasDisponiveis(JR), ["churrasqueira", "lareira", "conjunto_fogao", "churrasqueiras"]);
});

test("a descrição lista os recortes pro modelo escolher", () => {
  const d = descreverCatalogos(JR.catalogos);
  assert.ok(d.includes("conjunto_fogao"));
  assert.ok(d.includes("conjuntos: churrasqueira + fogão/forno"));
});

// ── Config malformada não pode virar enum quebrado nem envio de URL inválida ──
test("descarta entrada inválida sem derrubar o resto", () => {
  const rules = { catalogos: [
    { chave: "ok_um", rotulo: "válido", url: "https://ex.com/ok.pdf" },
    { chave: "Com Espaço", rotulo: "chave inválida", url: "https://ex.com/x.pdf" },
    { chave: "sem_url", rotulo: "sem url", url: "" },
    { chave: "relativa", rotulo: "url relativa", url: "/catalogo/x.pdf" },
    { chave: "sem_rotulo", rotulo: "", url: "https://ex.com/y.pdf" },
    { chave: "ok_um", rotulo: "duplicada", url: "https://ex.com/z.pdf" },
    null,
    "lixo",
  ] };
  assert.deepEqual(lerCatalogos(rules), [{ chave: "ok_um", rotulo: "válido", url: "https://ex.com/ok.pdf" }]);
});

test("rules ausente ou de outro formato não explode", () => {
  for (const r of [null, undefined, {}, { catalogos: null }, { catalogos: "x" }, 42]) {
    assert.deepEqual(lerCatalogos(r), []);
  }
});

// URL relativa é armadilha real: a Meta busca o arquivo por conta dela, então
// "/catalogo/x.pdf" falha em silêncio no envio.
test("URL relativa é rejeitada na leitura, não no envio", () => {
  assert.deepEqual(lerCatalogos({ catalogos: [{ chave: "a", rotulo: "r", url: "/catalogo/x.pdf" }] }), []);
});
