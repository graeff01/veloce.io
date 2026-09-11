// ── Integração REAL: métricas com VÁRIOS números no mesmo cliente ─────────────
// O cenário da Jardim do Lago: um perfil só, seis WhatsApps, cada pessoa
// atendendo pelo próprio telefone (coexistência) e duas gerentes que só
// acompanham. Ninguém atribui conversa na mão — a atribuição vem do NÚMERO.
//
// Roda contra Next.js local + Postgres local, como `portal-mobile.e2e.ts`:
//
//   npx tsx --test tests/e2e/multi-numero.e2e.ts
//
// Fica FORA de `npm test` (o glob é tests/**/*.test.ts) porque exige infra.

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createSession } from "@/lib/portal-auth";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const GERENTE = "michele.e2e@teste.local";
const ANA = "ana.e2e@teste.local";       // consultoria, número próprio
const BRUNO = "bruno.e2e@teste.local";   // captação, número próprio

let clientId = "";
let token = "";
let cookie = "";
const criados: string[] = [];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const agora = new Date();
const marca = Date.now();

async function numero(ownerEmail: string | null, equipe: string | null, sufixo: string) {
  return db.waConnection.create({
    data: {
      clientId, wabaId: `waba-mn-${marca}`, phoneNumberId: `pn-mn-${sufixo}-${marca}`,
      accessToken: "cifrado-fake-e2e", ownerEmail, equipe, name: `Número ${sufixo}`,
    },
  });
}

/** Uma conversa nascida NESTE número, sem dono manual, com um eco de resposta. */
async function conversa(connectionId: string, waId: string, opts: {
  stage?: string; venda?: number; assignedEmail?: string; respostas?: number;
} = {}) {
  const contact = await db.waContact.create({
    data: { connectionId, waId, displayName: `Lead ${waId}`, lastMessageAt: agora },
  });
  await db.waConversation.create({
    data: {
      connectionId, contactId: contact.id, funnelStage: opts.stage ?? "respondido",
      ...(opts.venda ? { saleValue: opts.venda, saleConfirmedAt: agora } : {}),
      ...(opts.assignedEmail ? { assignedEmail: opts.assignedEmail, assignedAt: agora } : {}),
      firstResponseSec: 60, firstResponseAt: agora,
      lastInboundAt: agora, lastOutboundAt: agora, lastMessageAt: agora,
    },
  });
  // Ecos: resposta HUMANA enviada do próprio celular — sem autor, sem IA.
  for (let i = 0; i < (opts.respostas ?? 0); i++) {
    await db.waMessage.create({
      data: {
        connectionId, contactId: contact.id, waMessageId: `eco-${waId}-${i}-${marca}`,
        direction: "out", type: "text", text: "resposta pelo celular",
        aiGenerated: false, timestamp: agora,
      },
    });
  }
  return contact.id;
}

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE} — suba com "npm run dev"`);

  const client = await db.client.create({
    data: { name: `Multi E2E ${marca}`, slug: `multi-e2e-${marca}` },
  });
  clientId = client.id;
  criados.push(client.id);
  token = `mn${marca}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);
  await db.clientPortal.create({ data: { clientId, token, requireLogin: true, active: true } });
  await db.portalAccess.createMany({
    data: [
      { clientId, email: GERENTE, name: "Michele", role: "admin" },
      { clientId, email: ANA, name: "Ana", role: "user" },
      { clientId, email: BRUNO, name: "Bruno", role: "user" },
    ],
  });

  const nAna = await numero(ANA, "consultoria", "ana");
  const nBruno = await numero(BRUNO, "captacao", "bruno");
  const nLoja = await numero(null, null, "loja"); // número da casa, sem dono

  await conversa(nAna.id, `55549${marca}01`, { stage: "convertido", venda: 1000, respostas: 3 });
  await conversa(nAna.id, `55549${marca}02`, { stage: "qualificado", respostas: 1 });
  await conversa(nBruno.id, `55549${marca}03`, { stage: "negociacao", respostas: 2 });
  await conversa(nLoja.id, `55549${marca}04`, { stage: "recebido" });

  cookie = `vp_session=${await createSession(clientId, GERENTE)}`;
});

after(async () => {
  for (const id of criados) {
    await db.portalSession.deleteMany({ where: { clientId: id } });
    await db.portalAccess.deleteMany({ where: { clientId: id } });
    await db.clientPortal.deleteMany({ where: { clientId: id } });
    await db.client.deleteMany({ where: { id } }); // cascata leva conexões, contatos e mensagens
  }
  await db.$disconnect();
  await pool.end();
});

async function metricas() {
  const r = await fetch(`${BASE}/api/portal/${token}/team-metrics?p=month`, { headers: { cookie }, cache: "no-store" });
  assert.equal(r.status, 200);
  return r.json();
}

test("cada pessoa aparece pelo PRÓPRIO número, sem ninguém atribuir nada", async () => {
  const d = await metricas();
  const ana = d.rows.find((r: { email: string }) => r.email === ANA);
  const bruno = d.rows.find((r: { email: string }) => r.email === BRUNO);
  assert.ok(ana, "a dona do número precisa virar linha de métrica");
  assert.equal(ana.owned, 2);
  assert.equal(ana.converted, 1);
  assert.equal(ana.revenue, 1000);
  assert.equal(bruno.owned, 1);
  assert.equal(bruno.converted, 0);
});

test("resposta pelo celular conta como resposta da dona do número", async () => {
  const d = await metricas();
  const ana = d.rows.find((r: { email: string }) => r.email === ANA);
  const bruno = d.rows.find((r: { email: string }) => r.email === BRUNO);
  assert.equal(ana.replies, 4, "3 + 1 ecos dos dois leads dela");
  assert.equal(bruno.replies, 2);
});

test("número sem dono continua sem dono — não vai parar em ninguém", async () => {
  const d = await metricas();
  const total = d.rows.reduce((n: number, r: { owned: number }) => n + r.owned, 0);
  assert.equal(total, 3, "a conversa do número da casa não pode ser atribuída a alguém");
});

test("totais por equipe: consultoria e captação separadas", async () => {
  const d = await metricas();
  assert.ok(Array.isArray(d.teams), "cliente com equipes configuradas devolve os totais por equipe");
  const cons = d.teams.find((t: { equipe: string }) => t.equipe === "consultoria");
  const capt = d.teams.find((t: { equipe: string }) => t.equipe === "captacao");
  assert.equal(cons.owned, 2);
  assert.equal(cons.converted, 1);
  assert.equal(cons.revenue, 1000);
  assert.equal(cons.replies, 4);
  assert.equal(capt.owned, 1);
  assert.equal(capt.replies, 2);
});

test("a linha diz de que equipe a pessoa é", async () => {
  const d = await metricas();
  assert.equal(d.rows.find((r: { email: string }) => r.email === ANA).equipe, "consultoria");
  assert.equal(d.rows.find((r: { email: string }) => r.email === BRUNO).equipe, "captacao");
});

test("atribuição MANUAL continua mandando mais que o dono do número", async () => {
  // Uma conversa que chegou no número da Ana mas foi passada para o Bruno.
  const nAna = await db.waConnection.findFirst({ where: { clientId, ownerEmail: ANA }, select: { id: true } });
  const antes = await metricas();
  const anaAntes = antes.rows.find((r: { email: string }) => r.email === ANA).owned;
  const brunoAntes = antes.rows.find((r: { email: string }) => r.email === BRUNO).owned;

  await conversa(nAna!.id, `55549${marca}05`, { assignedEmail: BRUNO });

  const d = await metricas();
  assert.equal(d.rows.find((r: { email: string }) => r.email === ANA).owned, anaAntes);
  assert.equal(d.rows.find((r: { email: string }) => r.email === BRUNO).owned, brunoAntes + 1);
});
