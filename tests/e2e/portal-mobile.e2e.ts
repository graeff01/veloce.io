// ── Integração REAL: app mobile contra o backend do portal ────────────────────
// Roda contra um Next.js local e um Postgres local. NÃO entra em `npm test`
// (o glob é tests/**/*.test.ts) porque exige infraestrutura — a suíte unitária
// continua hermética.
//
//   1) Postgres local em 127.0.0.1:5433 com as migrations aplicadas
//   2) npm run dev
//   3) npx tsx --test tests/e2e/portal-mobile.e2e.ts
//
// O cenário central é o que motivou a arquitetura inteira: PortalAccess é
// @@unique([clientId, email]) — o MESMO e-mail existe em duas lojas. Estes testes
// provam que a sessão, e não o e-mail, decide o tenant.

// `tsx` não carrega .env sozinho (o Next carrega). Sem isto o Pool cai na
// porta padrão e o teste morre com ECONNREFUSED.
import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createSession, hashPassword } from "@/lib/portal-auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = "maria.e2e@teste.local";
const SENHA_A = "SenhaLojaA#2026";
const SENHA_B = "SenhaLojaB#2026";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

interface Loja {
  clientId: string;
  token: string;
  contactId: string;
  connectionId: string;
}

let lojaA: Loja;
let lojaB: Loja;

async function criarLoja(sufixo: string, cor: string, senha: string): Promise<Loja> {
  const client = await db.client.create({
    data: { name: `Loja E2E ${sufixo}`, slug: `loja-e2e-${sufixo.toLowerCase()}-${Date.now()}` },
  });
  const token = `e2e${sufixo}${Date.now()}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);
  await db.clientPortal.create({
    data: { clientId: client.id, token, requireLogin: true, accentColor: cor, active: true },
  });
  await db.portalAccess.create({
    data: { clientId: client.id, email: EMAIL, name: `Maria ${sufixo}`, role: "admin", passwordHash: await hashPassword(senha) },
  });
  const conn = await db.waConnection.create({
    data: {
      clientId: client.id, wabaId: `waba-${sufixo}-${Date.now()}`,
      phoneNumberId: `pn-${sufixo}-${Date.now()}`, accessToken: "cifrado-fake-e2e",
    },
  });
  const contact = await db.waContact.create({
    data: { connectionId: conn.id, waId: `5554999${sufixo === "A" ? "111111" : "222222"}`, displayName: `Lead da ${sufixo}`, lastMessageAt: new Date() },
  });
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: contact.id, waMessageId: `msg-${sufixo}-${Date.now()}`,
      direction: "in", type: "text", text: `mensagem da loja ${sufixo}`, timestamp: new Date(),
    },
  });
  return { clientId: client.id, token, contactId: contact.id, connectionId: conn.id };
}

async function login(token: string, senha: string, device?: { id: string }) {
  const res = await fetch(`${BASE}/api/portal/${token}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: senha, ...(device ? { device: { id: device.id, platform: "ios", name: "iPhone E2E" } } : {}) }),
  });
  return { res, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const comBearer = (t: string) => ({ authorization: `Bearer ${t}` });

// Sessão criada pelo MESMO código do backend (`createSession`), sem passar pelo
// endpoint HTTP. Os testes de AUTORIZAÇÃO não são sobre o login, e fazer uma
// dezena de logins reais estoura — corretamente — a proteção contra força bruta
// (8 por identidade / 30 por IP a cada 15 min). Descobrimos isso na prática: a
// primeira versão desta suíte falhou nos 5 últimos testes exatamente por isso.
const sessaoDireta = (loja: Loja, deviceId: string) =>
  createSession(loja.clientId, EMAIL, { id: deviceId, platform: "ios", name: "iPhone E2E" });

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE} — suba com "npm run dev"`);
  // Baldes de rate limit do portal zerados: sem isto, rodar a suíte duas vezes
  // seguidas faz a segunda falhar por acúmulo da janela de 15 min.
  await db.rateBucket.deleteMany({ where: { scope: { startsWith: "portal:" } } });
  lojaA = await criarLoja("A", "#B4231F", SENHA_A);
  lojaB = await criarLoja("B", "#1E66F5", SENHA_B);
});

after(async () => {
  for (const l of [lojaA, lojaB]) {
    if (!l) continue;
    await db.portalSession.deleteMany({ where: { clientId: l.clientId } });
    await db.deviceToken.deleteMany({ where: { clientId: l.clientId } });
    await db.portalAccess.deleteMany({ where: { clientId: l.clientId } });
    await db.clientPortal.deleteMany({ where: { clientId: l.clientId } });
    await db.client.deleteMany({ where: { id: l.clientId } }); // cascata leva WaConnection
  }
  await db.$disconnect();
  await pool.end();
});

// ── o caminho do navegador não mudou ──────────────────────────────────────────

test("login SEM device: seta cookie e NÃO devolve token (PWA intacto)", async () => {
  const { res, body } = await login(lojaA.token, SENHA_A);
  assert.equal(res.status, 200);
  assert.equal(body?.ok, true);
  assert.equal(body?.sessionToken, undefined, "o segredo do PWA não pode chegar ao JavaScript");
  const cookie = res.headers.get("set-cookie") ?? "";
  assert.match(cookie, /vp_session=/);
  assert.match(cookie, /HttpOnly/i);
});

test("cookie continua autenticando as rotas do portal", async () => {
  const { res } = await login(lojaA.token, SENHA_A);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const r = await fetch(`${BASE}/api/portal/${lojaA.token}/conversations`, { headers: { cookie } });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.me, EMAIL);
});

// ── o caminho do app ──────────────────────────────────────────────────────────

test("login COM device: devolve token e NÃO seta cookie", async () => {
  const { res, body } = await login(lojaA.token, SENHA_A, { id: "device-e2e-aaaa-1111" });
  assert.equal(res.status, 200);
  assert.equal(typeof body?.sessionToken, "string");
  assert.ok((body?.sessionToken as string).length > 20);
  assert.equal(res.headers.get("set-cookie"), null, "app não usa cookie");
  assert.ok(typeof body?.expiresAt === "string");
});

test("sessão de aparelho expira ANTES da sessão de navegador (30d vs 60d)", async () => {
  const { body: app } = await login(lojaA.token, SENHA_A, { id: "device-e2e-ttl-2222" });
  const validade = Date.parse(String(app?.expiresAt));
  const dias = (validade - Date.now()) / 86_400_000;
  assert.ok(dias > 29 && dias < 31, `esperava ~30 dias, veio ${dias.toFixed(1)}`);
});

test("Bearer no sentinela _session funciona sem o token do portal na URL", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-sent-3333");
  const r = await fetch(`${BASE}/api/portal/_session/conversations`, { headers: comBearer(t) });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.me, EMAIL);
  assert.equal(d.conversations.length, 1);
  assert.equal(d.conversations[0].name, "Lead da A");
});

test("cookie e Bearer produzem a MESMA resposta", async () => {
  const nav = await login(lojaA.token, SENHA_A);
  const cookie = (nav.res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const t = await sessaoDireta(lojaA, "device-e2e-par-4444");

  const viaCookie = await (await fetch(`${BASE}/api/portal/${lojaA.token}/conversations`, { headers: { cookie } })).json();
  const viaBearer = await (await fetch(`${BASE}/api/portal/_session/conversations`, { headers: comBearer(t) })).json();

  assert.deepEqual(
    viaBearer.conversations.map((c: { contactId: string }) => c.contactId),
    viaCookie.conversations.map((c: { contactId: string }) => c.contactId),
  );
  assert.equal(viaBearer.me, viaCookie.me);
});

// ── ISOLAMENTO ENTRE TENANTS: o coração da arquitetura ────────────────────────

test("MESMO e-mail em duas lojas: cada sessão vê APENAS a sua", async () => {
  const tA = await sessaoDireta(lojaA, "device-e2e-tenant-A");
  const tB = await sessaoDireta(lojaB, "device-e2e-tenant-B");

  const dA = await (await fetch(`${BASE}/api/portal/_session/conversations`, { headers: comBearer(tA) })).json();
  const dB = await (await fetch(`${BASE}/api/portal/_session/conversations`, { headers: comBearer(tB) })).json();

  assert.equal(dA.conversations.length, 1);
  assert.equal(dB.conversations.length, 1);
  assert.equal(dA.conversations[0].name, "Lead da A");
  assert.equal(dB.conversations[0].name, "Lead da B");
  assert.notEqual(dA.conversations[0].contactId, dB.conversations[0].contactId);
});

test("a senha de uma loja NÃO entra na outra", async () => {
  const { res } = await login(lojaB.token, SENHA_A); // senha da A no portal da B
  assert.equal(res.status, 401);
});

test("sessão da loja A não alcança contato da loja B", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-cross-5555");
  const r = await fetch(`${BASE}/api/portal/_session/conversations/${lojaB.contactId}`, { headers: comBearer(t) });
  assert.equal(r.status, 404, "contato de outro tenant tem de ser indistinguível de inexistente");
});

test("Bearer da loja A com o TOKEN da loja B na URL não vaza dados", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-mix-6666");
  const r = await fetch(`${BASE}/api/portal/${lojaB.token}/conversations`, { headers: comBearer(t) });
  // O token da URL manda no tenant; a sessão é de OUTRO cliente → sem sessão válida aqui.
  assert.equal(r.status, 401);
});

// ── credencial ausente, inválida e revogada ───────────────────────────────────

test("sem credencial: 401 em painel protegido", async () => {
  const r = await fetch(`${BASE}/api/portal/${lojaA.token}/conversations`);
  assert.equal(r.status, 401);
});

test("Bearer inventado: 404 no sentinela (não existe tenant a resolver)", async () => {
  const r = await fetch(`${BASE}/api/portal/_session/conversations`, { headers: comBearer("token-que-nunca-existiu") });
  assert.equal(r.status, 404);
});

test("sessão REVOGADA no servidor deixa de funcionar imediatamente", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-revoga-7777");

  const antes = await fetch(`${BASE}/api/portal/_session/me`, { headers: comBearer(t) });
  assert.equal(antes.status, 200);

  await db.portalSession.deleteMany({ where: { sessionToken: t } });

  const depois = await fetch(`${BASE}/api/portal/_session/conversations`, { headers: comBearer(t) });
  assert.equal(depois.status, 404, "sem sessão o sentinela não resolve tenant nenhum");
});

test("logout pelo app invalida a sessão daquele aparelho", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-logout-8888");
  const out = await fetch(`${BASE}/api/portal/_session/auth/logout`, { method: "POST", headers: comBearer(t) });
  assert.equal(out.status, 200);
  assert.equal(await db.portalSession.count({ where: { sessionToken: t } }), 0);
});

// ── /me e branding ────────────────────────────────────────────────────────────

test("/me devolve a marca do cliente CERTO", async () => {
  const tA = await sessaoDireta(lojaA, "device-e2e-brand-A");
  const tB = await sessaoDireta(lojaB, "device-e2e-brand-B");

  const meA = await (await fetch(`${BASE}/api/portal/_session/me`, { headers: comBearer(tA) })).json();
  const meB = await (await fetch(`${BASE}/api/portal/_session/me`, { headers: comBearer(tB) })).json();

  assert.equal(meA.brand.name, "Loja E2E A");
  assert.equal(meA.brand.accentColor, "#B4231F");
  assert.equal(meB.brand.name, "Loja E2E B");
  assert.equal(meB.brand.accentColor, "#1E66F5");
  assert.equal(meA.user.email, EMAIL);
});

// ── registro de aparelho para push ────────────────────────────────────────────

test("push/subscribe grava o DeviceToken do app", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-push-9999");
  const apns = "a".repeat(64);
  const r = await fetch(`${BASE}/api/portal/_session/push/subscribe`, {
    method: "POST",
    headers: { ...comBearer(t), "content-type": "application/json" },
    body: JSON.stringify({ apnsToken: apns, deviceId: "device-e2e-push-9999", platform: "ios" }),
  });
  assert.equal(r.status, 200);
  const linha = await db.deviceToken.findUnique({ where: { token: apns } });
  assert.equal(linha?.clientId, lojaA.clientId);
  assert.equal(linha?.email, EMAIL);
});

test("push/subscribe recusa token APNs malformado", async () => {
  const t = await sessaoDireta(lojaA, "device-e2e-pushbad-0000");
  const r = await fetch(`${BASE}/api/portal/_session/push/subscribe`, {
    method: "POST",
    headers: { ...comBearer(t), "content-type": "application/json" },
    body: JSON.stringify({ apnsToken: "curto-demais", deviceId: "device-e2e-pushbad-0000" }),
  });
  assert.equal(r.status, 400);
});

// ── envio de mensagem passa pelo mesmo gate ───────────────────────────────────

test("send exige credencial (a rota de auth MANUAL também aceita Bearer)", async () => {
  const semCred = await fetch(`${BASE}/api/portal/${lojaA.token}/conversations/${lojaA.contactId}/send`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "oi" }),
  });
  assert.equal(semCred.status, 401, "sem sessão o envio tem de ser recusado");

  const t = await sessaoDireta(lojaA, "device-e2e-send-1234");
  const comCred = await fetch(`${BASE}/api/portal/_session/conversations/${lojaA.contactId}/send`, {
    method: "POST",
    headers: { ...comBearer(t), "content-type": "application/json" },
    body: JSON.stringify({ text: "" }),
  });
  // Texto vazio → 400 do validador de negócio. O que importa aqui é NÃO ser 401:
  // prova que o Bearer atravessou a rota de checagem manual, sem editá-la.
  assert.notEqual(comCred.status, 401, "Bearer precisa autenticar também as 22 rotas manuais");
  assert.equal(comCred.status, 400);
});
