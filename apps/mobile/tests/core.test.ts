import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiBase, portalPath, ApiConfigError } from "../src/core/api-base";
import { apiErrorFrom, kindForStatus, parseRetryAfter, ApiError } from "../src/core/errors";
import { redactPhone, redactEmail, redactSecrets, redactMessageBody, safeForLog } from "../src/core/redact";
import { parseInviteLink, describeInvite, InviteLinkError } from "../src/core/link";
import { parseMe, parseConversation, parseConversationList, ContractError } from "../src/core/contracts";

// ── api-base: a trava contra falar com produção sem querer ────────────────────

test("resolveApiBase: sem configuração, falha em vez de assumir um padrão", () => {
  assert.throws(() => resolveApiBase(undefined, "development"), ApiConfigError);
  assert.throws(() => resolveApiBase("", "production"), ApiConfigError);
});

test("resolveApiBase: DEV apontando para produção é BLOQUEADO", () => {
  assert.throws(() => resolveApiBase("https://veloceio-production.up.railway.app", "development"), ApiConfigError);
  assert.throws(() => resolveApiBase("https://app.veloce.io", "staging"), ApiConfigError);
});

test("resolveApiBase: aceita localhost e rede local no desenvolvimento", () => {
  assert.equal(resolveApiBase("http://localhost:3000", "development"), "http://localhost:3000");
  assert.equal(resolveApiBase("http://192.168.0.42:3000", "development"), "http://192.168.0.42:3000");
  assert.equal(resolveApiBase("http://10.0.0.5:3000", "development"), "http://10.0.0.5:3000");
});

test("resolveApiBase: HTTP sem TLS fora da rede local é recusado", () => {
  assert.throws(() => resolveApiBase("http://exemplo.com", "development"), ApiConfigError);
});

test("resolveApiBase: produção exige HTTPS", () => {
  assert.throws(() => resolveApiBase("http://algum-host.com", "production"), ApiConfigError);
});

test("resolveApiBase: normaliza barra final", () => {
  assert.equal(resolveApiBase("http://localhost:3000/", "development"), "http://localhost:3000");
});

test("resolveApiBase: recusa texto que não é URL", () => {
  assert.throws(() => resolveApiBase("localhost:3000", "development"), ApiConfigError);
  assert.throws(() => resolveApiBase("ftp://x.com", "development"), ApiConfigError);
});

test("portalPath: usa o sentinela de sessão, nunca um token", () => {
  assert.equal(portalPath("/conversations"), "/api/portal/_session/conversations");
  assert.equal(portalPath("me"), "/api/portal/_session/me");
});

// ── errors ────────────────────────────────────────────────────────────────────

test("kindForStatus: mapeia os códigos que o portal usa", () => {
  assert.equal(kindForStatus(401), "unauthorized");
  assert.equal(kindForStatus(403), "forbidden");
  assert.equal(kindForStatus(404), "not_found");
  assert.equal(kindForStatus(429), "rate_limited");
  assert.equal(kindForStatus(500), "server");
  assert.equal(kindForStatus(418), "unknown");
});

test("apiErrorFrom: prefere a mensagem que o servidor escreveu para o atendente", () => {
  const e = apiErrorFrom(401, { error: "Faça login para acessar." });
  assert.equal(e.message, "Faça login para acessar.");
  assert.equal(e.requiresLogout, true);
});

test("apiErrorFrom: sem mensagem do servidor, usa texto genérico em português", () => {
  const e = apiErrorFrom(403, null);
  assert.equal(e.message, "Você não tem acesso a esta área.");
});

test("apiErrorFrom: 429 carrega o Retry-After", () => {
  const e = apiErrorFrom(429, { error: "Muitas requisições." }, "30");
  assert.equal(e.retryAfterMs, 30_000);
  assert.equal(e.isRetryable, true);
});

test("parseRetryAfter: tolera lixo e limita o teto", () => {
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter("abc"), null);
  assert.equal(parseRetryAfter("-5"), null);
  assert.equal(parseRetryAfter("99999"), 3_600_000);
});

test("403 e 404 NÃO são repetíveis (repetir só castiga o servidor)", () => {
  assert.equal(new ApiError("forbidden", 403, "x").isRetryable, false);
  assert.equal(new ApiError("not_found", 404, "x").isRetryable, false);
  assert.equal(new ApiError("server", 500, "x").isRetryable, true);
});

test("só 401 desloga — 403 não pode derrubar a sessão", () => {
  assert.equal(new ApiError("forbidden", 403, "x").requiresLogout, false);
  assert.equal(new ApiError("unauthorized", 401, "x").requiresLogout, true);
});

// ── redaction: dados de lead e credenciais nunca em log ───────────────────────

test("redactPhone: preserva só os 4 últimos dígitos", () => {
  const out = redactPhone("lead 5554999887766 respondeu");
  assert.ok(!out.includes("5554999887766"));
  assert.ok(out.includes("7766"));
});

test("redactEmail: esconde a pessoa e mantém o domínio", () => {
  const out = redactEmail("maria@jrchurrasqueiras.com.br entrou");
  assert.ok(!out.includes("maria@"));
  assert.ok(out.includes("jrchurrasqueiras.com.br"));
});

test("redactSecrets: Bearer nunca aparece", () => {
  const out = redactSecrets("authorization: Bearer aBcD1234SegredoLongo");
  assert.ok(!out.includes("aBcD1234SegredoLongo"));
});

test("redactSecrets: token do portal some da URL, mas o sentinela permanece", () => {
  assert.ok(!redactSecrets("GET /api/portal/Xk9dL2mQ8vTn4wR1pY7s/me").includes("Xk9dL2mQ8vTn4wR1pY7s"));
  assert.ok(redactSecrets("GET /r/Xk9dL2mQ8vTn4wR1pY7s/conversas").includes("/r/[token]"));
  assert.ok(redactSecrets("GET /api/portal/_session/me").includes("_session"));
});

test("redactSecrets: campos de credencial em JSON são cortados", () => {
  const out = redactSecrets('{"sessionToken":"abc123","password":"segredo"}');
  assert.ok(!out.includes("abc123"));
  assert.ok(!out.includes("segredo"));
});

test("redactMessageBody: conteúdo de conversa NUNCA é logado, nem truncado", () => {
  const out = redactMessageBody("Oi, quero saber o preço da churrasqueira");
  assert.ok(!out.includes("churrasqueira"));
  assert.ok(out.includes("caracteres omitidos"));
});

test("safeForLog: aplica tudo junto e sobrevive a objeto circular", () => {
  const circular: Record<string, unknown> = { a: 1 };
  circular.self = circular;
  assert.ok(safeForLog(circular).length > 0);
  const out = safeForLog({ authorization: "Bearer segredo123", email: "x@y.com" });
  assert.ok(!out.includes("segredo123"));
});

// ── vínculo pelo link do portal ───────────────────────────────────────────────

test("parseInviteLink: aceita o link do painel e o de uma seção", () => {
  const a = parseInviteLink("https://portal.exemplo.test/r/Xk9dL2mQ8vTn4wR1pY7s");
  assert.equal(a.baseUrl, "https://portal.exemplo.test");
  assert.equal(a.token, "Xk9dL2mQ8vTn4wR1pY7s");
  const b = parseInviteLink("https://portal.exemplo.test/r/Xk9dL2mQ8vTn4wR1pY7s/conversas");
  assert.equal(b.token, "Xk9dL2mQ8vTn4wR1pY7s");
});

test("parseInviteLink: aceita deep link do próprio app", () => {
  const i = parseInviteLink("veloce://vincular?url=https%3A%2F%2Fportal.exemplo.test%2Fr%2FXk9dL2mQ8vTn4wR1pY7s");
  assert.equal(i.token, "Xk9dL2mQ8vTn4wR1pY7s");
});

test("parseInviteLink: recusa link que não é de painel", () => {
  assert.throws(() => parseInviteLink("https://google.com"), InviteLinkError);
  assert.throws(() => parseInviteLink("https://portal.test/r/"), InviteLinkError);
  assert.throws(() => parseInviteLink("https://portal.test/r/curto"), InviteLinkError);
  assert.throws(() => parseInviteLink(""), InviteLinkError);
  assert.throws(() => parseInviteLink("não é link"), InviteLinkError);
});

test("describeInvite: mostra o host e NUNCA o token", () => {
  const i = parseInviteLink("https://portal.exemplo.test/r/Xk9dL2mQ8vTn4wR1pY7s");
  const d = describeInvite(i);
  assert.equal(d, "portal.exemplo.test");
  assert.ok(!d.includes(i.token));
});

// ── contratos ─────────────────────────────────────────────────────────────────

test("parseMe: lê conta, seções e marca", () => {
  const me = parseMe({
    user: { email: "maria@loja.com", name: "Maria", role: "attendant" },
    requireLogin: true, sections: ["conversas", "revisao"], aiTest: false, quotesEnabled: true,
    brand: { name: "JR Churrasqueiras", logoUrl: "data:image/png;base64,AAA", accentColor: "#B4231F", mode: "dark" },
  });
  assert.equal(me.user?.email, "maria@loja.com");
  assert.deepEqual(me.sections, ["conversas", "revisao"]);
  assert.equal(me.brand.accentColor, "#B4231F");
  assert.equal(me.quotesEnabled, true);
});

test("parseMe: seção desconhecida é descartada (nada de menu morto)", () => {
  const me = parseMe({ sections: ["conversas", "secao-que-nao-existe"], brand: {} });
  assert.deepEqual(me.sections, ["conversas"]);
});

test("parseMe: sem sessão devolve user null sem explodir", () => {
  const me = parseMe({ user: null, requireLogin: true, sections: [], brand: {} });
  assert.equal(me.user, null);
  assert.equal(me.brand.mode, "light");
});

test("parseConversationList: normaliza a lista e o paginador", () => {
  const list = parseConversationList({
    conversations: [{ contactId: "c1", name: "João", waId: "5554999887766", tags: [{ id: "t1", name: "Quente", color: "#f00" }] }],
    me: "maria@loja.com", meName: "Maria", isAdmin: false, hasMore: true, attendants: [{ email: "a@b.com" }],
  });
  assert.equal(list.conversations.length, 1);
  assert.equal(list.conversations[0]!.tags[0]!.name, "Quente");
  assert.equal(list.hasMore, true);
  assert.equal(list.attendants[0]!.name, "a", "nome cai no prefixo do e-mail");
});

test("parseConversationList: conversa sem contactId derruba o contrato (não vira linha fantasma)", () => {
  assert.throws(() => parseConversationList({ conversations: [{ name: "sem id" }] }), ContractError);
});

test("parseConversation: janela de 24h AUSENTE é tratada como FECHADA (fail-safe)", () => {
  const c = parseConversation({ contact: { name: "João" }, items: [] });
  assert.equal(c.windowOpen, false, "na dúvida o app não pode liberar envio fora da janela");
});

test("parseConversation: janela aberta só quando o servidor diz explicitamente", () => {
  const c = parseConversation({ contact: { name: "João" }, windowOpen: true, items: [] });
  assert.equal(c.windowOpen, true);
});

test("parseConversation: mensagem sem timestamp válido é rejeitada", () => {
  assert.throws(
    () => parseConversation({ contact: { name: "x" }, items: [{ id: "m1", timestamp: "não-é-data" }] }),
    ContractError,
  );
});

test("parseConversation: origem do lead (anúncio) é preservada quando existe", () => {
  const c = parseConversation({
    contact: { name: "João" },
    lead: { adTitle: "Churrasqueira Gourmet", adModel: "Gourmet 80", adStrong: true },
    items: [],
  });
  assert.equal(c.lead?.adModel, "Gourmet 80");
  assert.equal(c.lead?.adStrong, true);
});
