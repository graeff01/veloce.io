import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aguardandoResposta, campanhaDe, campanhasDe, filtrarConversas, modulosPara,
} from "../src/core/inbox";
import type { ConversationRow, Me, PortalSection } from "../src/core/contracts";

const me = (sections: PortalSection[], quotesEnabled = false): Me => ({
  user: { email: "v@loja.com", name: "V", role: "attendant" },
  requireLogin: true, sections, aiTest: false, quotesEnabled,
  brand: { name: "Loja", logoUrl: null, accentColor: "#B4231F", mode: "light" },
});

const conversa = (over: Partial<ConversationRow> = {}): ConversationRow => ({
  contactId: "c1", name: "Lead", waId: "5551999", lastText: "oi", lastType: "text",
  lastDirection: "in", lastMessageAt: new Date().toISOString(), fromAd: false, adStrong: false,
  adTitle: null, adModel: null, funnelStage: null, assignedEmail: null, assignedName: null,
  tags: [], ...over,
});

// ── Navegação: a barra lista MÓDULOS, decididos pelo tenant ───────────────────

test("barra sempre tem Conversas e Mais", () => {
  assert.deepEqual(modulosPara(me([])), ["conversas", "mais"]);
  assert.deepEqual(modulosPara(null), ["conversas", "mais"]);
});

test("cliente COM anúncios e COM orçamento vê os quatro módulos", () => {
  assert.deepEqual(
    modulosPara(me(["conversas", "anuncios", "revisao"], true)),
    ["conversas", "anuncios", "revisao", "mais"],
  );
});

test("cliente sem orçamento NÃO vê Orçamentos", () => {
  const m = modulosPara(me(["conversas", "anuncios", "revisao"], false));
  assert.ok(!m.includes("revisao"), "quotesEnabled=false precisa esconder o módulo");
  assert.deepEqual(m, ["conversas", "anuncios", "mais"]);
});

test("seção revisao sem quotesEnabled não basta, e quotesEnabled sem seção também não", () => {
  assert.ok(!modulosPara(me(["revisao"], false)).includes("revisao"));
  assert.ok(!modulosPara(me(["conversas"], true)).includes("revisao"));
});

test("Aguardando e o antigo filtro de anúncios NÃO são módulos da barra", () => {
  const m = modulosPara(me(["conversas", "anuncios", "revisao"], true)) as string[];
  assert.ok(!m.includes("aguardando"), "Aguardando virou filtro dentro de Conversas");
  assert.ok(!m.includes("conversas/aguardando"));
});

test("a ordem dos módulos é estável", () => {
  assert.deepEqual(
    modulosPara(me(["anuncios", "revisao", "conversas"], true)),
    ["conversas", "anuncios", "revisao", "mais"],
    "a ordem vem do produto, não da ordem que o servidor devolveu",
  );
});

test("no máximo quatro destinos principais", () => {
  const todas: PortalSection[] = [
    "painel", "revisao", "fechamento", "conversas", "aprendizado", "consumo",
    "frete", "equipe", "anuncios", "ia", "funil", "objecoes",
  ];
  assert.equal(modulosPara(me(todas, true)).length, 4, "o excedente vai para Mais");
});

// ── Filtros da caixa de entrada ───────────────────────────────────────────────

test("aguardando: última mensagem do LEAD conta; a nossa não", () => {
  assert.equal(aguardandoResposta(conversa({ lastDirection: "in" })), true);
  assert.equal(aguardandoResposta(conversa({ lastDirection: "out" })), false);
  assert.equal(aguardandoResposta(conversa({ lastDirection: null })), false);
});

test("filtro 'todas' não remove nada", () => {
  const linhas = [conversa({ contactId: "a" }), conversa({ contactId: "b", lastDirection: "out" })];
  assert.equal(filtrarConversas(linhas, "todas", null).length, 2);
});

test("filtro 'aguardando' deixa só quem espera resposta", () => {
  const linhas = [conversa({ contactId: "a" }), conversa({ contactId: "b", lastDirection: "out" })];
  const r = filtrarConversas(linhas, "aguardando", null);
  assert.deepEqual(r.map((c) => c.contactId), ["a"]);
});

test("'minhas' é filtro de SERVIDOR — não remove nada localmente", () => {
  const linhas = [conversa({ contactId: "a" }), conversa({ contactId: "b" })];
  assert.equal(filtrarConversas(linhas, "minhas", null).length, 2, "a lista já chega restrita por owner=me");
});

test("campanha filtra por origem do anúncio", () => {
  const linhas = [
    conversa({ contactId: "a", fromAd: true, adModel: "Tiguan" }),
    conversa({ contactId: "b", fromAd: true, adModel: "Tiggo" }),
    conversa({ contactId: "c", fromAd: false }),
  ];
  assert.deepEqual(filtrarConversas(linhas, "todas", "Tiguan").map((c) => c.contactId), ["a"]);
});

test("campanha e aguardando combinam", () => {
  const linhas = [
    conversa({ contactId: "a", fromAd: true, adModel: "Tiguan", lastDirection: "in" }),
    conversa({ contactId: "b", fromAd: true, adModel: "Tiguan", lastDirection: "out" }),
  ];
  assert.deepEqual(filtrarConversas(linhas, "aguardando", "Tiguan").map((c) => c.contactId), ["a"]);
});

test("campanhaDe usa modelo, depois título, depois o rótulo neutro", () => {
  assert.equal(campanhaDe(conversa({ adModel: "Tiguan", adTitle: "Anúncio X" })), "Tiguan");
  assert.equal(campanhaDe(conversa({ adModel: null, adTitle: "Anúncio X" })), "Anúncio X");
  assert.equal(campanhaDe(conversa({ adModel: null, adTitle: null })), "Sem identificação");
});

test("campanhasDe lista só leads de anúncio, sem repetir e em ordem", () => {
  const linhas = [
    conversa({ contactId: "a", fromAd: true, adModel: "Tiguan" }),
    conversa({ contactId: "b", fromAd: true, adModel: "Allspace" }),
    conversa({ contactId: "c", fromAd: true, adModel: "Tiguan" }),
    conversa({ contactId: "d", fromAd: false, adModel: "Ignorado" }),
  ];
  assert.deepEqual(campanhasDe(linhas), ["Allspace", "Tiguan"]);
});

test("campanhasDe NÃO devolve contagem (o total parcial mentiria)", () => {
  const linhas = [conversa({ fromAd: true, adModel: "Tiguan" })];
  const r = campanhasDe(linhas);
  assert.ok(r.every((c) => typeof c === "string"), "só rótulos; número exigiria agregação no servidor");
});
