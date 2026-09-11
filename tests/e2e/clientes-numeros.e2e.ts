// ── Integração REAL: vários números de WhatsApp no mesmo cliente ──────────────
// Painel interno. Antes o cliente tinha NO MÁXIMO um número (índice único em
// `WaConnection.clientId`), o GET devolvia um objeto só e o DELETE apagava todas
// as conexões do cliente de uma vez. Com seis números no mesmo perfil — o caso
// da Jardim do Lago — cada um desses detalhes vira um defeito sério.
//
// Exige infra, como os demais `.e2e.ts` (fora de `npm test`):
//
//   npx tsx --test tests/e2e/clientes-numeros.e2e.ts

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { encode } from "next-auth/jwt";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

let cookie = "";
let clientId = "";
let outroId = "";
const H = () => ({ cookie, "Content-Type": "application/json" });
const url = () => `${BASE}/api/clients/${clientId}/whatsapp`;
const lista = async () => (await (await fetch(url(), { headers: { cookie } })).json()) as {
  id: string; ownerEmail: string | null; equipe: string | null;
}[];

async function criarNumero(sufixo: string, equipe: string) {
  const r = await fetch(url(), {
    method: "POST", headers: H(),
    body: JSON.stringify({
      wabaId: "waba-e2e", phoneNumberId: `pn-e2e-${sufixo}-${Date.now()}`,
      accessToken: "token-fake-e2e", name: `Número ${sufixo}`, equipe,
    }),
  });
  assert.equal(r.status, 201, `POST do número ${sufixo}`);
}

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE} — suba com "npm run dev"`);

  // Sessão interna assinada pelo mesmo segredo do NextAuth (estratégia JWT).
  const admin = await db.user.findFirst({ where: { role: "ADMIN" }, select: { id: true, email: true, name: true, role: true } });
  assert.ok(admin, "a base precisa de um usuário ADMIN");
  const jwt = await encode({
    token: { sub: admin.id, id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    secret: process.env.NEXTAUTH_SECRET!,
  });
  cookie = `next-auth.session-token=${jwt}`;

  const marca = Date.now();
  clientId = (await db.client.create({ data: { name: `Números E2E ${marca}`, slug: `numeros-e2e-${marca}` } })).id;
  outroId = (await db.client.create({ data: { name: `Outro E2E ${marca}`, slug: `outro-e2e-${marca}` } })).id;
});

after(async () => {
  await db.client.deleteMany({ where: { id: { in: [clientId, outroId] } } }); // cascata leva as conexões
  await db.$disconnect();
  await pool.end();
});

test("cliente sem WhatsApp devolve lista vazia, não nulo", async () => {
  const r = await fetch(url(), { headers: { cookie } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), []);
});

test("dois números convivem no mesmo cliente", async () => {
  await criarNumero("ana", "consultoria");
  await criarNumero("bruno", "captacao");
  const d = await lista();
  assert.equal(d.length, 2);
  assert.equal(d[0].equipe, "consultoria");
  assert.equal(d[1].equipe, "captacao");
});

test("a resposta nunca carrega o token nem o app secret", async () => {
  const d = await lista();
  for (const c of d) {
    assert.ok(!("accessToken" in c), "access token não pode sair da API");
    assert.ok(!("appSecret" in c), "app secret não pode sair da API");
  }
});

test("PATCH define o dono do número sem re-colar a credencial", async () => {
  const [primeiro] = await lista();
  const r = await fetch(url(), {
    method: "PATCH", headers: H(),
    body: JSON.stringify({ connectionId: primeiro.id, ownerEmail: "ana@teste.local" }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.ownerEmail, "ana@teste.local");
  assert.ok(!("accessToken" in d));
});

test("PATCH não alcança número de outro cliente", async () => {
  const [primeiro] = await lista();
  const r = await fetch(`${BASE}/api/clients/${outroId}/whatsapp`, {
    method: "PATCH", headers: H(),
    body: JSON.stringify({ connectionId: primeiro.id, equipe: "invadida" }),
  });
  assert.equal(r.status, 404);
});

test("DELETE sem dizer QUAL número é recusado — e não apaga nada", async () => {
  const r = await fetch(url(), { method: "DELETE", headers: { cookie } });
  assert.equal(r.status, 400);
  assert.equal((await lista()).length, 2, "o DELETE antigo apagaria a operação inteira aqui");
});

test("DELETE remove só o número indicado", async () => {
  const antes = await lista();
  const r = await fetch(`${url()}?connectionId=${antes[0].id}`, { method: "DELETE", headers: { cookie } });
  assert.equal(r.status, 200);
  const depois = await lista();
  assert.equal(depois.length, 1);
  assert.equal(depois[0].id, antes[1].id);
});

test("DELETE não alcança número de outro cliente", async () => {
  const [resto] = await lista();
  const r = await fetch(`${BASE}/api/clients/${outroId}/whatsapp?connectionId=${resto.id}`, {
    method: "DELETE", headers: { cookie },
  });
  assert.equal(r.status, 404);
  assert.equal((await lista()).length, 1);
});

test("sem sessão interna, nada disso responde", async () => {
  const [resto] = await lista();
  const r = await fetch(url(), {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId: resto.id, equipe: "x" }),
  });
  assert.equal(r.status, 401);
});
