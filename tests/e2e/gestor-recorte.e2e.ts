// ── Integração REAL: cada gerente vê só os números dela ──────────────────────
// "A Michele vê os números derivados dela, e a Vitória os dela — não uma conta
// para as duas."
//
// Recorte de visibilidade que vive só na tela não é recorte: é decoração. Este
// teste bate nas rotas como a outra gerente bateria, com sessão VÁLIDA, e exige
// que o servidor recuse.
//
//   npx tsx --test tests/e2e/gestor-recorte.e2e.ts

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

const MICHELE = "michele.recorte@teste.local";
const VITORIA = "vitoria.recorte@teste.local";
const ATENDENTE = "ana.recorte@teste.local";

const marca = Date.now();
let clientId = "", token = "";
let cookieM = "", cookieV = "", cookieA = "";
let contatoDaMichele = "", contatoDaVitoria = "";
let numeroDaMichele = "", numeroDaVitoria = "";

const H = (c: string) => ({ cookie: c, "content-type": "application/json" });
const get = async (c: string, rota: string) =>
  fetch(`${BASE}/api/portal/${token}/${rota}`, { headers: { cookie: c }, cache: "no-store" });

async function numeroCom(nome: string, gestor: string | null, dono: string) {
  return db.waConnection.create({
    data: {
      clientId, wabaId: `w-${marca}`, phoneNumberId: `pn-${nome}-${marca}`,
      accessToken: "fake", name: nome, ownerEmail: dono, gestorEmail: gestor,
      equipe: gestor === MICHELE ? "consultoria" : "captacao",
    },
  });
}

async function conversaEm(connectionId: string, sufixo: string) {
  const c = await db.waContact.create({
    data: { connectionId, waId: `5551${marca}${sufixo}`.slice(0, 15), displayName: `Lead ${sufixo}`, lastMessageAt: new Date() },
  });
  await db.waConversation.create({
    data: { connectionId, contactId: c.id, funnelStage: "recebido", lastInboundAt: new Date(), lastMessageAt: new Date() },
  });
  await db.waMessage.create({
    data: { connectionId, contactId: c.id, waMessageId: `m-${sufixo}-${marca}`, direction: "in", type: "text", text: "oi", timestamp: new Date() },
  });
  return c.id;
}

before(async () => {
  const r = await fetch(`${BASE}/api/health`).catch(() => null);
  assert.ok(r?.ok, `servidor não está no ar em ${BASE}`);
  await db.rateBucket.deleteMany({ where: { scope: { startsWith: "portal:" } } });

  clientId = (await db.client.create({ data: { name: `Recorte ${marca}`, slug: `recorte-${marca}` } })).id;
  token = `rc${marca}${Math.random().toString(36).slice(2, 8)}`.slice(0, 24);
  await db.clientPortal.create({ data: { clientId, token, requireLogin: true, active: true } });

  const hash = await hashPassword("SenhaE2E#2026");
  await db.portalAccess.createMany({
    data: [
      { clientId, email: MICHELE, name: "Michele", role: "gestor", passwordHash: hash },
      { clientId, email: VITORIA, name: "Vitória", role: "gestor", passwordHash: hash },
      { clientId, email: ATENDENTE, name: "Ana", role: "attendant", passwordHash: hash },
    ],
  });

  const nM = await numeroCom("Numero da Michele", MICHELE, ATENDENTE);
  const nV = await numeroCom("Numero da Vitoria", VITORIA, "bruno.recorte@teste.local");
  numeroDaMichele = nM.id; numeroDaVitoria = nV.id;
  contatoDaMichele = await conversaEm(nM.id, "11");
  contatoDaVitoria = await conversaEm(nV.id, "22");

  cookieM = `vp_session=${await createSession(clientId, MICHELE)}`;
  cookieV = `vp_session=${await createSession(clientId, VITORIA)}`;
  cookieA = `vp_session=${await createSession(clientId, ATENDENTE)}`;
});

after(async () => {
  await db.portalSession.deleteMany({ where: { clientId } });
  await db.portalAccess.deleteMany({ where: { clientId } });
  await db.clientPortal.deleteMany({ where: { clientId } });
  await db.client.deleteMany({ where: { id: clientId } });
  await db.$disconnect();
  await pool.end();
});

test("a caixa de cada gerente traz só as conversas dela", async () => {
  const m = await (await get(cookieM, "conversations?limit=50")).json();
  const v = await (await get(cookieV, "conversations?limit=50")).json();

  assert.deepEqual(m.conversations.map((c: { contactId: string }) => c.contactId), [contatoDaMichele]);
  assert.deepEqual(v.conversations.map((c: { contactId: string }) => c.contactId), [contatoDaVitoria]);
});

test("o atalho oferece só os números dela", async () => {
  const m = await (await get(cookieM, "numeros")).json();
  assert.deepEqual(m.numeros.map((n: { id: string }) => n.id), [numeroDaMichele]);
  const v = await (await get(cookieV, "numeros")).json();
  assert.deepEqual(v.numeros.map((n: { id: string }) => n.id), [numeroDaVitoria]);
});

test("abrir a conversa DA OUTRA pela URL responde 404", async () => {
  // O teste que separa recorte de decoração: sessão válida, conversa do mesmo
  // cliente, e ainda assim fora de alcance.
  assert.equal((await get(cookieM, `conversations/${contatoDaVitoria}`)).status, 404);
  assert.equal((await get(cookieV, `conversations/${contatoDaMichele}`)).status, 404);
  // E a dela continua abrindo — o recorte não pode virar um muro para tudo.
  assert.equal((await get(cookieM, `conversations/${contatoDaMichele}`)).status, 200);
});

test("filtrar pelo número da outra não devolve nada da outra", async () => {
  // Cair num id alheio não pode virar porta: o filtro é ignorado, e o que sai
  // continua sendo só o dela.
  const d = await (await get(cookieM, `conversations?limit=50&conexao=${numeroDaVitoria}`)).json();
  for (const c of d.conversations) {
    assert.equal(c.conexaoId, numeroDaMichele, "vazou conversa de outro número");
  }
});

test("as métricas somam só o pedaço dela", async () => {
  const m = await (await get(cookieM, "equipe-insights?p=month")).json();
  assert.equal(m.numeros.length, 1, "uma gerente não pode ver o número da outra no diagnóstico");
  assert.equal(m.numeros[0].id, numeroDaMichele);
  const v = await (await get(cookieV, "equipe-insights?p=month")).json();
  assert.equal(v.numeros[0].id, numeroDaVitoria);
});

test("o contador da barra conta só o dela", async () => {
  const m = await (await get(cookieM, "badges")).json();
  assert.equal(m.waiting, 1, "a Michele tem uma conversa aguardando, não duas");
});

test("quem ATENDE continua vendo a caixa inteira", async () => {
  // O recorte é de quem acompanha. Dividir a caixa de quem responde seria outra
  // coisa — e quebraria a operação de todo cliente que já existe.
  const a = await (await get(cookieA, "conversations?limit=50")).json();
  assert.equal(a.conversations.length, 2, "a atendente trabalha nos dois números");
});

test("gerente SEM número designado vê tudo, em vez de uma tela vazia", async () => {
  // É o estado de quem ainda não configurou. Tela vazia no primeiro acesso
  // faria parecer que o sistema quebrou.
  const orfa = "orfa.recorte@teste.local";
  await db.portalAccess.create({
    data: { clientId, email: orfa, name: "Sem números", role: "gestor", passwordHash: await hashPassword("SenhaE2E#2026") },
  });
  const cookie = `vp_session=${await createSession(clientId, orfa)}`;
  const d = await (await get(cookie, "conversations?limit=50")).json();
  assert.equal(d.conversations.length, 2, "sem recorte configurado, enxerga a operação toda");
});

test("e continua sem poder escrever", async () => {
  // O recorte não substitui o papel: ela vê menos E continua só acompanhando.
  const r = await fetch(`${BASE}/api/portal/${token}/funnel/${contatoDaMichele}`, {
    method: "POST", headers: H(cookieM), body: JSON.stringify({ stage: "qualificado" }),
  });
  assert.equal(r.status, 403);
});

test("conversa do número dela atribuída a outra equipe aparece — com NOME", async () => {
  // A conversa é do número da Michele, então ela precisa vê-la. Mas quem a
  // assumiu é da equipe da Vitória, e o nome dessa pessoa vem do número DELA —
  // fora do recorte. Sem cuidado, a linha aparecia como pedaço de e-mail, e só
  // aquela: a tela parecia quebrada justo onde era mais importante entender.
  const bruno = "bruno.recorte@teste.local";
  await db.waConversation.update({
    where: { contactId: contatoDaMichele },
    data: { assignedEmail: bruno, assignedAt: new Date() },
  });

  const d = await (await get(cookieM, "equipe-insights?p=month")).json();
  const linha = d.pessoas.find((p: { email: string }) => p.email === bruno);
  assert.ok(linha, "quem assumiu a conversa do número dela tem que aparecer");
  assert.ok(!linha.nome.includes("@") && !linha.nome.includes("."),
    `o nome tem que sair do cadastro, não do e-mail (veio "${linha.nome}")`);

  // E continua sem vazar o NÚMERO da outra: o que entrou foi uma pessoa numa
  // conversa dela, não a operação da Vitória.
  assert.equal(d.numeros.length, 1);
  assert.equal(d.numeros[0].id, numeroDaMichele);
});

// ── Conectar número pelo portal ──────────────────────────────────────────────
// A escrita mais poderosa do produto, feita por quem não é da agência. Quatro
// travas, e cada uma existe por um estrago concreto que ela evita.

const conectar = (cookie: string, corpo: Record<string, unknown>) =>
  fetch(`${BASE}/api/portal/${token}/numeros`, { method: "POST", headers: H(cookie), body: JSON.stringify(corpo) });

const fichaValida = (sufixo: string) => ({
  wabaId: `waba-${marca}`, phoneNumberId: `pn-novo-${sufixo}-${marca}`,
  accessToken: "EAAG-token-de-teste-longo-o-suficiente",
  name: `Funcionário ${sufixo}`, equipe: "consultoria", ownerEmail: `func${sufixo}@teste.local`,
});

test("gerente SEM a permissão não conecta nada", async () => {
  // O padrão. Ninguém ganha esse poder por causa de um deploy.
  const r = await conectar(cookieM, fichaValida("a"));
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /permiss/i);
});

test("nem o ATENDENTE, nem por engano", async () => {
  assert.equal((await conectar(cookieA, fichaValida("b"))).status, 403);
});

test("com a permissão, ela conecta — e o número nasce no escopo dela", async () => {
  await db.portalAccess.updateMany({ where: { clientId, email: MICHELE }, data: { podeConectar: true } });

  const r = await conectar(cookieM, fichaValida("c"));
  const d = await r.json();
  assert.equal(r.status, 201, JSON.stringify(d));
  assert.equal(d.numero.name, "Funcionário c");

  // Aparece no painel DELA, sem mais nenhum passo.
  const meus = await (await get(cookieM, "numeros")).json();
  assert.ok(meus.numeros.some((n: { nome: string }) => n.nome === "Funcionário c"));
  // E NÃO no da outra.
  const dela = await (await get(cookieV, "numeros")).json();
  assert.ok(!dela.numeros.some((n: { nome: string }) => n.nome === "Funcionário c"));
});

test("o token NUNCA volta pela API", async () => {
  const r = await conectar(cookieM, fichaValida("d"));
  const bruto = await r.text();
  assert.ok(!bruto.includes("EAAG"), "o token não pode voltar na resposta da criação");
  const lista = await (await get(cookieM, "numeros")).text();
  assert.ok(!lista.includes("EAAG") && !lista.includes("accessToken"), "nem na listagem");
});

test("número de OUTRO cliente é recusado", async () => {
  // Sem esta trava, digitar o id de um número alheio sequestraria as conversas
  // dele para cá.
  const outro = await db.client.create({ data: { name: `Alheio ${marca}`, slug: `alheio-${marca}` } });
  const conn = await db.waConnection.create({
    data: { clientId: outro.id, wabaId: "w", phoneNumberId: `pn-alheio-${marca}`, accessToken: "x" },
  });

  const r = await conectar(cookieM, { ...fichaValida("e"), phoneNumberId: conn.phoneNumberId });
  assert.equal(r.status, 409);

  // E nada mudou de dono.
  const depois = await db.waConnection.findUnique({ where: { id: conn.id }, select: { clientId: true } });
  assert.equal(depois?.clientId, outro.id, "o número continua sendo do cliente dele");

  await db.waConnection.delete({ where: { id: conn.id } });
  await db.client.delete({ where: { id: outro.id } });
});

test("uma gerente não reescreve o número da outra", async () => {
  // Mesmo cliente, mesma permissão — e ainda assim não encosta no que é da
  // colega. "Corrigir" o número da outra é como isso começaria.
  const r = await conectar(cookieM, {
    ...fichaValida("f"),
    phoneNumberId: (await db.waConnection.findUnique({ where: { id: numeroDaVitoria }, select: { phoneNumberId: true } }))!.phoneNumberId,
  });
  assert.equal(r.status, 409);

  const intacto = await db.waConnection.findUnique({ where: { id: numeroDaVitoria }, select: { gestorEmail: true, name: true } });
  assert.equal(intacto?.gestorEmail, VITORIA, "o número continua sendo acompanhado por ela");
  assert.equal(intacto?.name, "Numero da Vitoria", "e nem o nome foi trocado");
});

test("conectar não vira licença para escrever o resto", async () => {
  // A permissão é de UMA coisa. Ela continua sem responder lead nem mover funil.
  const r = await fetch(`${BASE}/api/portal/${token}/funnel/${contatoDaMichele}`, {
    method: "POST", headers: H(cookieM), body: JSON.stringify({ stage: "qualificado" }),
  });
  assert.equal(r.status, 403);
});
