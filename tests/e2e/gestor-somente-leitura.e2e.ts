// ── Integração REAL: o papel de acompanhamento ───────────────────────────────
// "Ela só vai ter a opção de visualizar as conversas e acompanhar; nada de
// assumir leads." Esconder botão não é permissão — este teste bate nas rotas
// como a gestora bateria, e exige 403.
//
//   npx tsx --test tests/e2e/gestor-somente-leitura.e2e.ts

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createSession, hashPassword } from "@/lib/portal-auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const GESTORA = "gestora.e2e@teste.local";
const VENDEDORA = "vendedora.e2e@teste.local";
const SENHA = "SenhaE2E#2026";

let clientId = "", token = "", contactId = "", tagId = "";
let cookieGestora = "", cookieVendedora = "";

const marca = Date.now();

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE} — suba com "npm run dev"`);
  await db.rateBucket.deleteMany({ where: { scope: { startsWith: "portal:" } } });

  const client = await db.client.create({ data: { name: `Gestor E2E ${marca}`, slug: `gestor-e2e-${marca}` } });
  clientId = client.id;
  token = `ge${marca}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);
  await db.clientPortal.create({ data: { clientId, token, requireLogin: true, active: true } });

  const hash = await hashPassword(SENHA);
  await db.portalAccess.createMany({
    data: [
      // O papel novo: vê tudo, não muda nada.
      { clientId, email: GESTORA, name: "Michele", role: "gestor", passwordHash: hash },
      // O controle: uma atendente comum, que continua podendo trabalhar.
      { clientId, email: VENDEDORA, name: "Ana", role: "attendant", passwordHash: hash },
    ],
  });

  const conn = await db.waConnection.create({
    data: { clientId, wabaId: `w-${marca}`, phoneNumberId: `p-${marca}`, accessToken: "fake", ownerEmail: VENDEDORA, equipe: "consultoria" },
  });
  const contact = await db.waContact.create({
    data: { connectionId: conn.id, waId: `55549${marca}`.slice(0, 13), displayName: "Lead E2E", lastMessageAt: new Date() },
  });
  contactId = contact.id;
  await db.waConversation.create({
    data: { connectionId: conn.id, contactId, funnelStage: "recebido", lastInboundAt: new Date(), lastMessageAt: new Date() },
  });
  await db.waMessage.create({
    data: { connectionId: conn.id, contactId, waMessageId: `m-${marca}`, direction: "in", type: "text", text: "oi", timestamp: new Date() },
  });
  tagId = (await db.waTag.create({ data: { connectionId: conn.id, name: `etiqueta-${marca}`, color: "#64748B" } })).id;

  cookieGestora = `vp_session=${await createSession(clientId, GESTORA)}`;
  cookieVendedora = `vp_session=${await createSession(clientId, VENDEDORA)}`;
});

after(async () => {
  await db.portalSession.deleteMany({ where: { clientId } });
  await db.portalAccess.deleteMany({ where: { clientId } });
  await db.clientPortal.deleteMany({ where: { clientId } });
  await db.client.deleteMany({ where: { id: clientId } });
  await db.$disconnect();
  await pool.end();
});

const j = (cookie: string) => ({ cookie, "content-type": "application/json" });

/** Toda ação que muda alguma coisa na operação. */
const ESCRITAS = () => [
  ["responder o lead",        "POST", `conversations/${contactId}/send`,        JSON.stringify({ text: "oi" })],
  ["assumir/transferir lead", "POST", `conversations/${contactId}/assign`,      JSON.stringify({ email: GESTORA })],
  ["assumir em lote",         "POST", "conversations/bulk-assign",              JSON.stringify({ contactIds: [contactId] })],
  ["mudar etapa do funil",    "POST", `funnel/${contactId}`,                    JSON.stringify({ stage: "qualificado" })],
  ["marcar como lida",        "POST", `conversations/${contactId}/state`,       JSON.stringify({ lida: true })],
  ["etiquetar a conversa",    "POST", `conversations/${contactId}/tags`,        JSON.stringify({ tagId })],
  ["tirar a etiqueta",        "DELETE", `conversations/${contactId}/tags?tagId=${tagId}`, null],
  ["criar etiqueta",          "POST", "tags",                                   JSON.stringify({ name: `nova-${marca}` })],
  ["mandar a IA responder",   "POST", `conversations/${contactId}/ai-reply`,    JSON.stringify({})],
  ["apontar erro da IA",      "POST", `conversations/${contactId}/correction`,  JSON.stringify({ nota: "errou" })],
];

test("a gestora é barrada em TODAS as ações que mudam a operação", async () => {
  for (const [oquê, metodo, rota, corpo] of ESCRITAS()) {
    const r = await fetch(`${BASE}/api/portal/${token}/${rota}`, {
      method: metodo as string, headers: j(cookieGestora), ...(corpo ? { body: corpo as string } : {}),
    });
    assert.equal(r.status, 403, `${oquê} (${metodo} ${rota}) devia ser 403 e veio ${r.status}`);
    const d = await r.json().catch(() => null);
    assert.match(String(d?.error ?? ""), /acompanhamento/i, `${oquê}: a mensagem precisa explicar o porquê`);
  }
});

test("…e nada mudou no banco depois de tudo isso", async () => {
  const conv = await db.waConversation.findUnique({
    where: { contactId }, select: { assignedEmail: true, funnelStage: true, portalReadAt: true },
  });
  assert.equal(conv?.assignedEmail, null, "o lead não podia ter ganhado dono");
  assert.equal(conv?.funnelStage, "recebido", "a etapa não podia ter mudado");
  assert.equal(conv?.portalReadAt, null, "acompanhar não marca lida para a equipe");
  assert.equal(await db.waContactTag.count({ where: { contactId } }), 0);
  assert.equal(await db.waMessage.count({ where: { contactId, direction: "out" } }), 0, "nenhuma mensagem pode ter saído");
});

test("a atendente comum continua trabalhando normalmente", async () => {
  // A trava não pode ter respingado em quem atende: este é o teste que impede
  // a correção de virar um problema maior do que resolveu.
  const r = await fetch(`${BASE}/api/portal/${token}/funnel/${contactId}`, {
    method: "POST", headers: j(cookieVendedora), body: JSON.stringify({ stage: "qualificado" }),
  });
  assert.equal(r.status, 200, "atendente tem que conseguir mover o funil");
  const t = await fetch(`${BASE}/api/portal/${token}/conversations/${contactId}/tags`, {
    method: "POST", headers: j(cookieVendedora), body: JSON.stringify({ tagId }),
  });
  assert.equal(t.status, 200, "atendente tem que conseguir etiquetar");
});

test("a gestora LÊ tudo — é para isso que ela entra", async () => {
  for (const rota of ["conversations?limit=20", `conversations/${contactId}`, "team-metrics?p=month", "badges", "tags"]) {
    const r = await fetch(`${BASE}/api/portal/${token}/${rota}`, { headers: { cookie: cookieGestora } });
    assert.equal(r.status, 200, `a gestora precisa conseguir ler ${rota}`);
  }
  const d = await (await fetch(`${BASE}/api/portal/${token}/conversations?limit=20`, { headers: { cookie: cookieGestora } })).json();
  assert.ok(d.conversations.length > 0, "e precisa enxergar a conversa da equipe");
});

test("a tela sabe que ela só acompanha", async () => {
  // Sem isto o portal ofereceria botões que o servidor vai recusar — e a pessoa
  // levaria a culpa por um erro que o produto criou.
  const d = await (await fetch(`${BASE}/api/portal/${token}/conversations?limit=5`, { headers: { cookie: cookieGestora } })).json();
  assert.equal(d.somenteLeitura, true);
  const v = await (await fetch(`${BASE}/api/portal/${token}/conversations?limit=5`, { headers: { cookie: cookieVendedora } })).json();
  assert.ok(!v.somenteLeitura, "para quem atende, nada muda");
});
