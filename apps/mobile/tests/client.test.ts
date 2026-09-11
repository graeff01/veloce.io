import { test } from "node:test";
import assert from "node:assert/strict";
import { VeloceClient, type SessionStore, type StoredSession } from "../src/core/client";
import { ApiError } from "../src/core/errors";

// Store em memória: espelha o contrato do Keychain sem depender de nativo.
class MemoryStore implements SessionStore {
  session: StoredSession | null = null;
  clears = 0;
  async read() { return this.session; }
  async write(s: StoredSession) { this.session = s; }
  async clear() { this.clears++; this.session = null; }
}

interface Call { url: string; init: RequestInit }

function stubFetch(responder: (call: Call) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    const r = responder(call);
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const build = (
  responder: (call: Call) => { status: number; body?: unknown; headers?: Record<string, string> },
  store = new MemoryStore(),
  onSessionLost?: () => void,
) => {
  const { impl, calls } = stubFetch(responder);
  const client = new VeloceClient({
    baseUrl: "http://localhost:3000",
    store,
    device: { id: "AAAA-BBBB-CCCC-DDDD", name: "iPhone de teste", platform: "ios" },
    fetchImpl: impl,
    onSessionLost,
  });
  return { client, calls, store };
};

const authOf = (c: Call) => (c.init.headers as Record<string, string> | undefined)?.authorization;

// ── credencial ────────────────────────────────────────────────────────────────

test("toda chamada autenticada leva Authorization: Bearer", async () => {
  const store = new MemoryStore();
  store.session = { token: "token-de-sessao", expiresAt: null };
  const { client, calls } = build(() => ({ status: 200, body: { conversations: [] } }), store);
  await client.conversations();
  assert.equal(authOf(calls[0]!), "Bearer token-de-sessao");
});

test("o app NUNCA usa cookie — nenhum header de cookie é enviado", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client, calls } = build(() => ({ status: 200, body: { conversations: [] } }), store);
  await client.conversations();
  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.ok(!Object.keys(headers).some((h) => h.toLowerCase() === "cookie"));
});

test("chamadas do dia a dia usam o sentinela, nunca o token do portal", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client, calls } = build(() => ({ status: 200, body: { conversations: [] } }), store);
  await client.conversations();
  await client.me();
  for (const c of calls) {
    assert.ok(c.url.includes("/api/portal/_session/"), `rota fora do escopo de sessão: ${c.url}`);
  }
});

// ── login e vínculo ───────────────────────────────────────────────────────────

test("login manda o device e guarda o sessionToken devolvido", async () => {
  const { client, calls, store } = build((c) =>
    c.url.includes("/auth/login")
      ? { status: 200, body: { ok: true, sessionToken: "novo-token", expiresAt: "2026-10-02T00:00:00.000Z" } }
      : { status: 200, body: {} },
  );
  const s = await client.login("Xk9dL2mQ8vTn4wR1pY7s", "maria@loja.com", "senha");
  assert.equal(s.token, "novo-token");
  assert.equal(store.session?.token, "novo-token");
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.equal(body.device.id, "AAAA-BBBB-CCCC-DDDD");
  assert.equal(body.device.platform, "ios");
});

test("o token do PORTAL só aparece na chamada de login e nunca é gravado", async () => {
  const portalToken = "Xk9dL2mQ8vTn4wR1pY7s";
  const { client, calls, store } = build((c) =>
    c.url.includes("/auth/login") ? { status: 200, body: { sessionToken: "s1" } } : { status: 200, body: {} },
  );
  await client.login(portalToken, "m@l.com", "x");
  await client.me();

  assert.ok(calls[0]!.url.includes(portalToken), "login usa o token do portal para achar o tenant");
  assert.ok(!calls[1]!.url.includes(portalToken), "depois do vínculo o token não é mais usado");
  assert.equal(store.session?.token, "s1");
  assert.ok(!JSON.stringify(store.session).includes(portalToken), "token do portal jamais persistido");
});

test("backend sem suporte a sessão de aparelho falha explicitamente", async () => {
  const { client, store } = build(() => ({ status: 200, body: { ok: true } })); // sem sessionToken
  await assert.rejects(() => client.login("Xk9dL2mQ8vTn4wR1pY7s", "m@l.com", "x"), (e: unknown) => {
    assert.ok(e instanceof ApiError);
    assert.match((e as ApiError).message, /não suporta login pelo aplicativo/);
    return true;
  });
  assert.equal(store.session, null, "nada é gravado numa autenticação incompleta");
});

// ── sessão revogada ───────────────────────────────────────────────────────────

test("401 limpa o Keychain e avisa a UI uma única vez", async () => {
  const store = new MemoryStore();
  store.session = { token: "morto", expiresAt: null };
  let avisos = 0;
  const { client } = build(() => ({ status: 401, body: { error: "Faça login para acessar." } }), store, () => { avisos++; });

  await assert.rejects(() => client.conversations());
  store.session = { token: "morto", expiresAt: null }; // simula corrida entre chamadas
  await assert.rejects(() => client.me());

  assert.equal(store.session, null, "credencial removida do aparelho");
  assert.equal(store.clears, 2, "cada 401 limpa");
  assert.equal(avisos, 1, "mas a UI é notificada uma vez só (sem N telas de login)");
});

test("403 NÃO desloga — falta de permissão não é sessão inválida", async () => {
  const store = new MemoryStore();
  store.session = { token: "vivo", expiresAt: null };
  let avisos = 0;
  const { client } = build(() => ({ status: 403, body: { error: "Você não tem acesso a esta área do painel." } }), store, () => { avisos++; });
  await assert.rejects(() => client.conversations(), (e: unknown) => (e as ApiError).kind === "forbidden");
  assert.equal(store.session?.token, "vivo", "sessão preservada");
  assert.equal(avisos, 0);
});

test("429 chega com Retry-After preservado", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client } = build(() => ({ status: 429, body: { error: "Muitas requisições." }, headers: { "retry-after": "12" } }), store);
  await assert.rejects(() => client.conversations(), (e: unknown) => {
    assert.equal((e as ApiError).retryAfterMs, 12_000);
    assert.equal((e as ApiError).isRetryable, true);
    return true;
  });
});

test("404 vira not_found (recurso de outro tenant é indistinguível de inexistente)", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client } = build(() => ({ status: 404, body: { error: "Conversa não encontrada" }, headers: {} }), store);
  await assert.rejects(() => client.conversation("de-outro-cliente"), (e: unknown) => {
    assert.equal((e as ApiError).kind, "not_found");
    assert.equal((e as ApiError).requiresLogout, false);
    return true;
  });
});

test("falha de rede vira erro offline, não crash", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const impl = (async () => { throw new TypeError("Network request failed"); }) as unknown as typeof fetch;
  const client = new VeloceClient({
    baseUrl: "http://localhost:3000", store,
    device: { id: "AAAA-BBBB-CCCC-DDDD", platform: "ios" }, fetchImpl: impl,
  });
  await assert.rejects(() => client.conversations(), (e: unknown) => {
    assert.equal((e as ApiError).kind, "offline");
    assert.equal((e as ApiError).isRetryable, true);
    return true;
  });
  assert.equal(store.session?.token, "t", "queda de rede não pode deslogar ninguém");
});

// ── ações ─────────────────────────────────────────────────────────────────────

test("busca e filtro 'só minhas' viram query da API existente", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client, calls } = build(() => ({ status: 200, body: { conversations: [] } }), store);
  await client.conversations({ q: "  joão  ", onlyMine: true, limit: 30, offset: 60 });
  const u = new URL(calls[0]!.url);
  assert.equal(u.searchParams.get("q"), "joão");
  assert.equal(u.searchParams.get("owner"), "me");
  assert.equal(u.searchParams.get("offset"), "60");
});

test("envio de texto usa a rota existente de send", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client, calls } = build(() => ({ status: 200, body: { ok: true } }), store);
  await client.sendText("c1", "bom dia");
  assert.ok(calls[0]!.url.endsWith("/api/portal/_session/conversations/c1/send"));
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(JSON.parse(String(calls[0]!.init.body)).text, "bom dia");
});

test("logout apaga a credencial mesmo se o servidor não responder", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const impl = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
  const client = new VeloceClient({
    baseUrl: "http://localhost:3000", store,
    device: { id: "AAAA-BBBB-CCCC-DDDD", platform: "ios" }, fetchImpl: impl,
  });
  await client.logout();
  assert.equal(store.session, null);
});

test("authHeaders entrega o Bearer para downloads de binário (imagem, PDF, áudio)", async () => {
  const store = new MemoryStore();
  store.session = { token: "t", expiresAt: null };
  const { client } = build(() => ({ status: 200, body: {} }), store);
  assert.deepEqual(await client.authHeaders(), { Authorization: "Bearer t" });
});

test("sem sessão, authHeaders não inventa credencial", async () => {
  const { client } = build(() => ({ status: 200, body: {} }));
  assert.deepEqual(await client.authHeaders(), {});
});
