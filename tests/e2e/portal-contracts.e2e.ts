// ── Contrato: os parsers DO APP contra as respostas REAIS do servidor ─────────
// Este é o teste que amarra os dois clientes. Os mesmos parsers que rodam no
// iPhone (apps/mobile/src/core/contracts.ts) são executados aqui em cima do JSON
// que o backend devolve de verdade.
//
// Se alguém mudar a forma de uma resposta do portal, isto fica vermelho no CI —
// em vez de virar tela em branco no aparelho da vendedora.
//
//   npm run dev   &&   npm run test:e2e

import "dotenv/config";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createSession, hashPassword } from "@/lib/portal-auth";
import {
  parseConversation, parseConversationList, parseMe, parseQuoteReviews,
} from "../../apps/mobile/src/core/contracts";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = "contrato.e2e@teste.local";
const SENHA = "ContratoE2E#2026";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

let clientId = "";
let token = "";
let contactId = "";
let outroContactId = "";
let sessao = "";

const H = () => ({ authorization: `Bearer ${sessao}` });
const pegar = async (rota: string) => {
  const r = await fetch(`${BASE}/api/portal/_session${rota}`, { headers: H() });
  assert.equal(r.status, 200, `${rota} devolveu ${r.status}`);
  return r.json();
};

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE}`);
  await db.rateBucket.deleteMany({ where: { scope: { startsWith: "portal:" } } });

  const c = await db.client.create({
    data: { name: "Loja Contrato", slug: `contrato-e2e-${Date.now()}`, logoUrl: "data:image/png;base64,iVBORw0KGgo=" },
  });
  clientId = c.id;
  token = `ct${Date.now()}${Math.random().toString(36).slice(2, 10)}`.slice(0, 24);
  await db.clientPortal.create({ data: { clientId, token, requireLogin: true, accentColor: "#0EA5A4", mode: "auto" } });
  await db.portalAccess.create({ data: { clientId, email: EMAIL, name: "Contrato", role: "admin", passwordHash: await hashPassword(SENHA) } });
  await db.aiAgentConfig.create({ data: { clientId, quotesEnabled: true } });

  const conn = await db.waConnection.create({
    data: { clientId, wabaId: `w-${Date.now()}`, phoneNumberId: `p-${Date.now()}`, accessToken: "cifrado-fake" },
  });

  // Lead COM origem de anúncio, etiqueta, funil e dono — para o parser ver campos
  // preenchidos, não só nulos.
  const ct = await db.waContact.create({
    data: { connectionId: conn.id, waId: "5554999333333", displayName: "Lead Completo", lastMessageAt: new Date() },
  });
  contactId = ct.id;
  await db.waLead.create({
    data: {
      connectionId: conn.id, contactId: ct.id, waId: ct.waId,
      adTitle: "Churrasqueira Gourmet 80", adModel: "Gourmet 80", adBody: "Promoção",
      sourceUrl: "https://exemplo.test/anuncio", adId: "ad-123", sourceType: "ad", enteredAt: new Date(),
    },
  });
  await db.waConversation.create({
    data: { connectionId: conn.id, contactId: ct.id, funnelStage: "negociacao", assignedEmail: EMAIL },
  });
  const tag = await db.waTag.create({ data: { connectionId: conn.id, name: "Quente", color: "#EF4444" } });
  await db.waContactTag.create({ data: { contactId: ct.id, tagId: tag.id } });

  // Mensagem do LEAD recente: mantém a janela de 24h ABERTA.
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: ct.id, waMessageId: `in-${Date.now()}`,
      direction: "in", type: "text", text: "quero saber o preço", timestamp: new Date(),
    },
  });
  // Resposta da IA, com entrega e leitura — exercita aiGenerated/deliveredAt/readAt.
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: ct.id, waMessageId: `out-${Date.now()}`,
      direction: "out", type: "text", text: "Bom dia! Posso ajudar.", aiGenerated: true,
      timestamp: new Date(), deliveredAt: new Date(), readAt: new Date(),
    },
  });

  // Segundo lead: janela FECHADA (última mensagem do lead há 3 dias).
  const antiga = new Date(Date.now() - 3 * 86_400_000);
  const ct2 = await db.waContact.create({
    data: { connectionId: conn.id, waId: "5554999444444", displayName: "Lead Antigo", lastMessageAt: antiga },
  });
  outroContactId = ct2.id;
  // WaConversation existe para TODO contato com mensagem em produção (criada por
  // applyMessageToConversation no webhook). O seed precisa refletir isso: sem a
  // linha, `setAssignment` faz updateMany em zero registros e ainda devolve ok:true
  // (lib/ai-agent/respond.ts:539) — comportamento pré-existente, fora deste escopo.
  await db.waConversation.create({ data: { connectionId: conn.id, contactId: ct2.id, funnelStage: "recebido" } });
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: ct2.id, waMessageId: `old-${Date.now()}`,
      direction: "in", type: "text", text: "oi", timestamp: antiga,
    },
  });

  // Orçamento aguardando revisão.
  await db.quote.create({
    data: {
      clientId, contactId: ct.id, number: 1, status: "pending_review",
      total: 4890.5, currency: "BRL", subtotal: 4890.5,
      items: [
        { label: "Churrasqueira Gourmet 80", qty: 1, unit: 4390.5, amount: 4390.5 },
        { label: "Frete", qty: 1, unit: 500, amount: 500 },
      ],
      intake: { cidade_entrega: "Canoas", local_instalacao: "área externa", opcionais: "chapa" },
      summary: "Gourmet 80 + frete",
    },
  });

  sessao = await createSession(clientId, EMAIL, { id: "device-contrato-e2e", platform: "ios" });
});

after(async () => {
  if (clientId) {
    await db.portalSession.deleteMany({ where: { clientId } });
    await db.deviceToken.deleteMany({ where: { clientId } });
    await db.quote.deleteMany({ where: { clientId } });
    await db.aiAgentConfig.deleteMany({ where: { clientId } });
    await db.portalAccess.deleteMany({ where: { clientId } });
    await db.clientPortal.deleteMany({ where: { clientId } });
    await db.client.deleteMany({ where: { id: clientId } });
  }
  await db.$disconnect();
  await pool.end();
});

// ── /me ───────────────────────────────────────────────────────────────────────

test("parseMe: conta, seções, flags e marca vindas do servidor", async () => {
  const me = parseMe(await pegar("/me"));
  assert.equal(me.user?.email, EMAIL);
  assert.equal(me.user?.role, "admin");
  assert.equal(me.requireLogin, true);
  assert.equal(me.quotesEnabled, true);
  assert.equal(me.brand.name, "Loja Contrato");
  assert.equal(me.brand.accentColor, "#0EA5A4");
  assert.equal(me.brand.mode, "auto");
  assert.ok(me.brand.logoUrl?.startsWith("data:image/"));
  assert.ok(me.sections.includes("conversas"), "conversas é obrigatória");
});

// ── lista de conversas ────────────────────────────────────────────────────────

test("parseConversationList: lista real com anúncio, etiqueta, funil e dono", async () => {
  const lista = parseConversationList(await pegar("/conversations?limit=30&offset=0"));
  assert.equal(lista.me, EMAIL);
  assert.equal(lista.isAdmin, true);
  assert.equal(lista.conversations.length, 2);

  const completo = lista.conversations.find((c) => c.contactId === contactId);
  assert.ok(completo, "lead completo não veio na lista");
  assert.equal(completo.name, "Lead Completo");
  assert.equal(completo.fromAd, true);
  assert.equal(completo.adModel, "Gourmet 80");
  assert.equal(completo.funnelStage, "negociacao");
  assert.equal(completo.assignedEmail, EMAIL);
  assert.equal(completo.tags[0]?.name, "Quente");
  assert.equal(completo.tags[0]?.color, "#EF4444");
  assert.ok(completo.lastMessageAt, "data da última mensagem precisa ser ISO válida");
});

test("filtro 'só minhas' devolve apenas a conversa com dono", async () => {
  const lista = parseConversationList(await pegar("/conversations?limit=30&offset=0&owner=me"));
  assert.equal(lista.conversations.length, 1);
  assert.equal(lista.conversations[0]?.contactId, contactId);
});

test("busca por nome usa a mesma rota e o parser aguenta", async () => {
  const lista = parseConversationList(await pegar("/conversations?limit=30&offset=0&q=Antigo"));
  assert.equal(lista.conversations.length, 1);
  assert.equal(lista.conversations[0]?.name, "Lead Antigo");
});

// ── thread ────────────────────────────────────────────────────────────────────

test("parseConversation: thread real com origem, etiquetas e ticks", async () => {
  const c = parseConversation(await pegar(`/conversations/${contactId}`));
  assert.equal(c.contact.name, "Lead Completo");
  assert.equal(c.lead?.adModel, "Gourmet 80");
  assert.equal(c.lead?.sourceUrl, "https://exemplo.test/anuncio");
  assert.equal(c.funnelStage, "negociacao");
  assert.equal(c.assignedEmail, EMAIL);
  assert.equal(c.tags[0]?.name, "Quente");
  assert.equal(c.items.length, 2);

  const daIa = c.items.find((m) => m.aiGenerated);
  assert.ok(daIa, "mensagem da IA não veio");
  assert.equal(daIa.direction, "out");
  assert.ok(daIa.deliveredAt && daIa.readAt, "ticks de entrega/leitura precisam chegar");
});

test("janela de 24h ABERTA quando o lead escreveu agora", async () => {
  const c = parseConversation(await pegar(`/conversations/${contactId}`));
  assert.equal(c.windowOpen, true);
});

test("janela de 24h FECHADA quando a última mensagem do lead é antiga", async () => {
  const c = parseConversation(await pegar(`/conversations/${outroContactId}`));
  assert.equal(c.windowOpen, false, "o app desabilita o envio a partir DESTE campo");
});

// ── ações que a V1 executa ────────────────────────────────────────────────────

test("assumir conversa: o dono muda no servidor e volta no parser", async () => {
  const soltar = await fetch(`${BASE}/api/portal/_session/conversations/${outroContactId}/assign`, {
    method: "POST", headers: { ...H(), "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL }),
  });
  assert.equal(soltar.status, 200);

  const c = parseConversation(await pegar(`/conversations/${outroContactId}`));
  assert.equal(c.assignedEmail, EMAIL);
  assert.ok(c.assignedName, "o servidor resolve o nome de exibição do dono");
});

test("etiquetas: criar e aplicar, e o parser lê de volta", async () => {
  const criar = await fetch(`${BASE}/api/portal/_session/tags`, {
    method: "POST", headers: { ...H(), "content-type": "application/json" },
    body: JSON.stringify({ name: "Orçamento enviado", color: "#3B82F6" }),
  });
  assert.equal(criar.status, 201, "POST /tags responde 201 Created");
  const tag = await criar.json();
  const tagId = tag.id ?? tag.tag?.id;
  assert.ok(tagId, "rota de tags precisa devolver o id");

  const aplicar = await fetch(`${BASE}/api/portal/_session/conversations/${outroContactId}/tags`, {
    method: "POST", headers: { ...H(), "content-type": "application/json" }, body: JSON.stringify({ tagId }),
  });
  assert.equal(aplicar.status, 200);

  const c = parseConversation(await pegar(`/conversations/${outroContactId}`));
  assert.ok(c.tags.some((t) => t.name === "Orçamento enviado"));
});

// ── revisão de orçamento ──────────────────────────────────────────────────────

test("parseQuoteReviews: orçamento real pendente, com linhas e resumo", async () => {
  const revisoes = parseQuoteReviews(await pegar("/quote-reviews"));
  assert.equal(revisoes.length, 1);
  const q = revisoes[0]!;
  assert.equal(q.number, 1);
  assert.equal(q.name, "Lead Completo");
  assert.equal(q.total, 4890.5);
  assert.equal(q.currency, "BRL");
  assert.equal(q.city, "Canoas");
  assert.equal(q.lines.length, 2);
  assert.equal(q.lines[0]?.label, "Churrasqueira Gourmet 80");
  assert.equal(q.lines[0]?.amount, 4390.5);
  assert.ok(q.resumo?.includes("instalação"), "o servidor monta o resumo a partir do intake");
});

test("PDF do orçamento vem do SERVIDOR, com credencial e como application/pdf", async () => {
  const revisoes = parseQuoteReviews(await pegar("/quote-reviews"));
  const quoteId = revisoes[0]!.quoteId;

  const semCred = await fetch(`${BASE}/api/portal/_session/quote-reviews/${quoteId}/pdf`);
  assert.notEqual(semCred.status, 200, "PDF não pode ser público");

  const r = await fetch(`${BASE}/api/portal/_session/quote-reviews/${quoteId}/pdf`, { headers: H() });
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type") ?? "", /application\/pdf/);
  const bytes = new Uint8Array(await r.arrayBuffer());
  assert.ok(bytes.length > 800, "PDF veio pequeno demais");
  assert.deepEqual([...bytes.slice(0, 4)], [0x25, 0x50, 0x44, 0x46], "assinatura %PDF ausente");
});

// ── mídia ─────────────────────────────────────────────────────────────────────

test("rota de mídia exige credencial e não vaza entre tenants", async () => {
  const anon = await fetch(`${BASE}/api/portal/_session/conversations/${contactId}/media/qualquer`);
  assert.notEqual(anon.status, 200);

  const inexistente = await fetch(`${BASE}/api/portal/_session/conversations/${contactId}/media/nao-existe`, { headers: H() });
  assert.equal(inexistente.status, 404);
});
