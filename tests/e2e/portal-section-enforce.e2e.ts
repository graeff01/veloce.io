// ── Permissão por SEÇÃO: medir a lacuna e provar a correção ───────────────────
// Hoje `effectiveSections` só PINTA O MENU. A API registra o evento A-04 e deixa
// passar, salvo com PORTAL_SECTION_ENFORCE=1 (lib/portal-guard.ts, passo 5).
//
// No PWA isso é disfarçado: quem não vê o botão não clica. Com um segundo cliente
// — ou com qualquer requisição direta — vira acesso indevido de verdade.
//
// Este arquivo roda nos DOIS modos, para a decisão de ligar a trava ser baseada em
// evidência e não em fé:
//
//   npx tsx --test tests/e2e/portal-section-enforce.e2e.ts
//     → estado ATUAL (observação): documenta a lacuna
//
//   PORTAL_SECTION_ENFORCE=1 npm run dev   (noutro terminal)
//   E2E_SECTION_ENFORCE=1 npx tsx --test tests/e2e/portal-section-enforce.e2e.ts
//     → estado ALVO: prova que a trava fecha a lacuna sem quebrar o legítimo

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createSession, hashPassword } from "@/lib/portal-auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ENFORCE = process.env.E2E_SECTION_ENFORCE === "1";
const ADMIN = "admin.sec@teste.local";
const RESTRITA = "restrita.sec@teste.local";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

let clientId = "";
let contactId = "";
let sessaoAdmin = "";
let sessaoRestrita = "";

const H = (t: string) => ({ authorization: `Bearer ${t}` });

// A rota de Funil só expõe POST. Um GET devolveria 405 SEM sequer chamar o
// guardPortal — o teste passaria sem provar nada. (Foi o que aconteceu na
// primeira versão deste arquivo.)
const moverFunil = (sessao: string) =>
  fetch(`${BASE}/api/portal/_session/funnel/${contactId}`, {
    method: "POST",
    headers: { ...H(sessao), "content-type": "application/json" },
    body: JSON.stringify({ stage: "qualificado" }),
  });

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE}`);
  await db.rateBucket.deleteMany({ where: { scope: { startsWith: "portal:" } } });

  const c = await db.client.create({ data: { name: "Loja Seções", slug: `secoes-${Date.now()}` } });
  clientId = c.id;
  await db.clientPortal.create({
    data: { clientId, token: `sec${Date.now()}${Math.random().toString(36).slice(2, 8)}`.slice(0, 24), requireLogin: true },
  });

  // Admin: `sections = null` → herda todas as seções do cliente.
  await db.portalAccess.create({
    data: { clientId, email: ADMIN, name: "Admin", role: "admin", sections: null, passwordHash: await hashPassword("AdminSec#2026") },
  });
  // Atendente restrita: `sections = ""` → SÓ conversas (a seção obrigatória).
  await db.portalAccess.create({
    data: { clientId, email: RESTRITA, name: "Restrita", role: "attendant", sections: "", passwordHash: await hashPassword("RestritaSec#2026") },
  });

  const conn = await db.waConnection.create({
    data: { clientId, wabaId: `w-${Date.now()}`, phoneNumberId: `p-${Date.now()}`, accessToken: "x" },
  });
  const ct = await db.waContact.create({ data: { connectionId: conn.id, waId: "5551900000", displayName: "Lead Seções" } });
  contactId = ct.id;
  await db.waConversation.create({ data: { connectionId: conn.id, contactId: ct.id, funnelStage: "recebido" } });
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: ct.id, waMessageId: `m-${Date.now()}`,
      direction: "in", type: "text", text: "oi", timestamp: new Date(),
    },
  });

  sessaoAdmin = await createSession(clientId, ADMIN, { id: "device-sec-admin", platform: "ios" });
  sessaoRestrita = await createSession(clientId, RESTRITA, { id: "device-sec-restrita", platform: "ios" });
});

after(async () => {
  if (clientId) {
    await db.portalSession.deleteMany({ where: { clientId } });
    await db.portalAccess.deleteMany({ where: { clientId } });
    await db.clientPortal.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
  }
  await db.$disconnect();
  await pool.end();
});

// ── o menu já respeita a permissão ────────────────────────────────────────────

test("/me: a restrita recebe SÓ conversas; o admin recebe tudo", async () => {
  const meR = await (await fetch(`${BASE}/api/portal/_session/me`, { headers: H(sessaoRestrita) })).json();
  const meA = await (await fetch(`${BASE}/api/portal/_session/me`, { headers: H(sessaoAdmin) })).json();
  assert.deepEqual(meR.sections, ["conversas"], "o menu dela só pode ter Conversas");
  assert.ok(meA.sections.length > 1, "o admin herda todas as seções do cliente");
});

// ── o que a trava muda ────────────────────────────────────────────────────────

test(`seção NÃO concedida: API ${ENFORCE ? "BLOQUEIA (403)" : "hoje deixa passar"}`, async () => {
  const r = await moverFunil(sessaoRestrita);

  if (ENFORCE) {
    assert.equal(r.status, 403, "com a trava ligada, seção fora da permissão precisa dar 403");
    const d = await r.json();
    assert.match(String(d.error), /não tem acesso/i);
  } else {
    // Documenta a LACUNA: o menu esconde Funil, mas a rota responde.
    assert.notEqual(r.status, 403, "estado atual: a API só observa, não bloqueia (achado A-04)");
    assert.ok(r.status < 500, `resposta inesperada: ${r.status}`);
  }
});

test("seção CONCEDIDA continua funcionando nos dois modos", async () => {
  const r = await fetch(`${BASE}/api/portal/_session/conversations`, { headers: H(sessaoRestrita) });
  assert.equal(r.status, 200, "Conversas é a seção dela — ligar a trava não pode quebrar isso");
  const d = await r.json();
  assert.equal(d.me, RESTRITA);
});

test("admin não é afetado pela trava", async () => {
  const funil = await moverFunil(sessaoAdmin);
  assert.notEqual(funil.status, 403, "admin herda todas as seções; a trava não pode barrá-lo");
  const conv = await fetch(`${BASE}/api/portal/_session/conversations`, { headers: H(sessaoAdmin) });
  assert.equal(conv.status, 200);
});

test("o evento de segurança A-04 é registrado nos dois modos", async () => {
  await moverFunil(sessaoRestrita);
  // A emissão é assíncrona (emitSecurityEventAsync); dá um instante para gravar.
  await new Promise((r) => setTimeout(r, 800));
  const ev = await db.aiSecurityEvent.findFirst({
    where: { clientId, control: "A-04" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(ev, "sem trilha não há como medir antes de ligar a trava");
  assert.equal(ev.action, ENFORCE ? "blocked" : "observed");
  assert.equal(ev.shadow, !ENFORCE);
});
