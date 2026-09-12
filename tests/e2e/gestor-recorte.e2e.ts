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

test("o atalho de números diz se ela pode cadastrar", async () => {
  // É esse sinal que faz o "+ Conectar WhatsApp" existir na lista. Sem ele a
  // opção não aparece — que foi exatamente o que aconteceu em produção.
  const comPermissao = await (await get(cookieM, "numeros")).json();
  assert.equal(comPermissao.podeConectar, true);

  const sem = await (await get(cookieV, "numeros")).json();
  assert.equal(sem.podeConectar, false, "quem não tem a permissão não vê a opção");
});

test("o número cadastrado aparece NA MESMA lista, sem recarregar a página", async () => {
  // O cadastro acontece dentro da lista de números. Se o novo só aparecesse
  // depois de um F5, ela concluiria que não salvou e cadastraria de novo.
  const antes = await (await get(cookieM, "numeros")).json();
  await conectar(cookieM, fichaValida("g"));
  const depois = await (await get(cookieM, "numeros")).json();

  assert.equal(depois.numeros.length, antes.numeros.length + 1);
  assert.ok(depois.numeros.some((n: { nome: string }) => n.nome === "Funcionário g"));
});

// ── Assinar a WABA ───────────────────────────────────────────────────────────
// Salvar a credencial NÃO faz a mensagem chegar: a Meta só entrega os eventos
// de uma conta para os apps assinados nela. Esse passo era feito por script, e
// quem preenchia o formulário não tinha como saber que faltava — via "conectado
// com sucesso" e nunca recebia nada.

test("o cadastro diz se ficou RECEBENDO, não só se salvou", async () => {
  // O token aqui é falso, então a Meta recusa — que é justamente o caso que
  // precisa ser visível. O número fica salvo (dá para corrigir), mas a resposta
  // avisa que ainda não recebe, com um motivo que a pessoa consegue agir.
  const r = await conectar(cookieM, fichaValida("h"));
  const d = await r.json();

  assert.equal(r.status, 201, "credencial errada não desfaz o cadastro — dá para tentar de novo");
  assert.equal(d.recebendo, false, "sem assinatura confirmada, não pode dizer que está pronto");
  assert.ok(typeof d.aviso === "string" && d.aviso.length > 20,
    `o aviso precisa explicar o que fazer (veio: ${JSON.stringify(d.aviso)})`);
  assert.ok(!/undefined|null|\[object/.test(d.aviso), "e ser texto de gente, não despejo de erro");
});

test("o número salvo mesmo sem assinatura aparece na lista", async () => {
  // Ele existe e está incompleto — some da tela seria pior: a pessoa
  // cadastraria de novo e criaria duplicata.
  const d = await (await get(cookieM, "numeros")).json();
  assert.ok(d.numeros.some((n: { nome: string }) => n.nome === "Funcionário h"));
});

test("o token não vaza nem quando a assinatura falha", async () => {
  const r = await conectar(cookieM, fichaValida("i"));
  const bruto = await r.text();
  assert.ok(!bruto.includes("EAAG"), "nem no caminho de erro o token pode voltar");
  assert.ok(!bruto.includes("accessToken"));
});

// ── Corrigir e remover ───────────────────────────────────────────────────────
// O cadastro só sabia adicionar. Errar o Phone Number ID criava um fantasma
// permanente no painel dela.

test("ela corrige o que descreve o número", async () => {
  const meus = await (await get(cookieM, "numeros")).json();
  const alvo = meus.numeros.find((n: { nome: string }) => n.nome === "Funcionário c");
  const r = await fetch(`${BASE}/api/portal/${token}/numeros`, {
    method: "PATCH", headers: H(cookieM),
    body: JSON.stringify({ connectionId: alvo.id, name: "Ana Prado", equipe: "captacao" }),
  });
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.numero.nome ?? d.numero.name, "Ana Prado");
});

test("corrigir NÃO mexe em credencial", async () => {
  // Trocar token ou WABA exige cadastrar de novo. Assim um engano de digitação
  // no nome nunca passa perto do que faz a conexão funcionar.
  const meus = await (await get(cookieM, "numeros")).json();
  const alvo = meus.numeros[0];
  const antes = await db.waConnection.findUnique({ where: { id: alvo.id }, select: { accessToken: true, wabaId: true } });

  await fetch(`${BASE}/api/portal/${token}/numeros`, {
    method: "PATCH", headers: H(cookieM),
    body: JSON.stringify({ connectionId: alvo.id, name: "Renomeado", accessToken: "EAAG-tentativa", wabaId: "999" }),
  });

  const depois = await db.waConnection.findUnique({ where: { id: alvo.id }, select: { accessToken: true, wabaId: true } });
  assert.equal(depois?.accessToken, antes?.accessToken, "o token não pode ser trocado por aqui");
  assert.equal(depois?.wabaId, antes?.wabaId, "nem a WABA");
});

test("número VAZIO sai direto — é o caso do erro de digitação", async () => {
  const criado = await conectar(cookieM, fichaValida("vazio"));
  const { numero } = await criado.json();
  const r = await fetch(`${BASE}/api/portal/${token}/numeros?connectionId=${numero.id}`, {
    method: "DELETE", headers: H(cookieM),
  });
  assert.equal(r.status, 200);
  const resta = await (await get(cookieM, "numeros")).json();
  assert.ok(!resta.numeros.some((n: { id: string }) => n.id === numero.id));
});

test("número COM conversa exige confirmar pelo nome", async () => {
  // Apagar um número em operação leva junto o histórico de leads reais. Um
  // clique distraído não pode fazer isso.
  const r = await fetch(`${BASE}/api/portal/${token}/numeros?connectionId=${numeroDaMichele}`, {
    method: "DELETE", headers: H(cookieM),
  });
  assert.equal(r.status, 409);
  const d = await r.json();
  assert.equal(d.exigeConfirmacao, true);
  assert.ok(d.conversas > 0, "e diz quantas conversas se perderiam");

  // O número continua lá.
  assert.ok(await db.waConnection.findUnique({ where: { id: numeroDaMichele } }));

  // Com o nome certo, sai.
  const ok = await fetch(`${BASE}/api/portal/${token}/numeros?connectionId=${numeroDaMichele}&confirmar=${encodeURIComponent(d.nome)}`, {
    method: "DELETE", headers: H(cookieM),
  });
  assert.equal(ok.status, 200);
});

test("ela não corrige nem remove o número da OUTRA", async () => {
  const patch = await fetch(`${BASE}/api/portal/${token}/numeros`, {
    method: "PATCH", headers: H(cookieM),
    body: JSON.stringify({ connectionId: numeroDaVitoria, name: "invadido" }),
  });
  assert.equal(patch.status, 404);

  const del = await fetch(`${BASE}/api/portal/${token}/numeros?connectionId=${numeroDaVitoria}`, {
    method: "DELETE", headers: H(cookieM),
  });
  assert.equal(del.status, 404);

  const intacto = await db.waConnection.findUnique({ where: { id: numeroDaVitoria }, select: { name: true } });
  assert.equal(intacto?.name, "Numero da Vitoria");
});

test("sem a permissão de conectar, não corrige nem remove", async () => {
  const r = await fetch(`${BASE}/api/portal/${token}/numeros`, {
    method: "PATCH", headers: H(cookieV),
    body: JSON.stringify({ connectionId: numeroDaVitoria, name: "x" }),
  });
  assert.equal(r.status, 403, "editar número é a mesma permissão de cadastrar");
});

// ── O número que recebe e não responde ───────────────────────────────────────
// O caso que nada pegava: o token morre, as mensagens continuam chegando, o
// detector de número mudo diz que está tudo bem — e a foto não abre nem a IA
// responde.

test("token recusado vira alerta, mesmo com o número recebendo normalmente", async () => {
  const conn = await db.waConnection.findFirst({ where: { clientId, gestorEmail: VITORIA }, select: { id: true } });

  // O número está ATIVO: recebeu agora há pouco. É o que engana.
  await db.waConnection.update({
    where: { id: conn!.id },
    data: { lastEventAt: new Date(), tokenFalhouEm: new Date(Date.now() - 30 * 3_600_000), tokenErro: "Token expirado ou revogado" },
  });

  const d = await (await get(cookieV, "equipe-insights?p=month")).json();

  // Número mudo NÃO pega — e é esse o ponto.
  assert.ok(!d.gargalos.some((g: { tipo: string }) => g.tipo === "numero_mudo"),
    "recebendo há pouco, ele não é mudo — por isso precisava de outro alerta");

  const alerta = d.gargalos.find((g: { tipo: string }) => g.tipo === "token_quebrado");
  assert.ok(alerta, "o token recusado tem que virar gargalo");
  assert.equal(alerta.gravidade, "alta");
  assert.match(alerta.detalhe, /continuam chegando/i, "precisa explicar por que parece que está tudo bem");
  assert.match(alerta.detalhe, /reconectar/i, "e dizer o que fazer");

  // E a tela sabe marcar a linha de QUEM ATENDE naquele número — que é outra
  // pessoa que a gerente: `dono` é ownerEmail, `gestorEmail` é quem acompanha.
  assert.equal(d.semToken.length, 1);
  assert.equal(d.semToken[0].erro, "Token expirado ou revogado");

  await db.waConnection.update({ where: { id: conn!.id }, data: { tokenFalhouEm: null, tokenErro: null } });
});

test("sem falha de credencial, nenhum alerta aparece", async () => {
  // Rede de segurança: se o teste acima falhar antes de limpar, este não pode
  // acusar o produto por sujeira do vizinho.
  await db.waConnection.updateMany({ where: { clientId }, data: { tokenFalhouEm: null, tokenErro: null } });
  const d = await (await get(cookieV, "equipe-insights?p=month")).json();
  assert.ok(!d.gargalos.some((g: { tipo: string }) => g.tipo === "token_quebrado"));
  assert.deepEqual(d.semToken, [], "número saudável não pode aparecer como quebrado");
});

test("a gerente só vê a falha dos números DELA", async () => {
  const conn = await db.waConnection.findFirst({ where: { clientId, gestorEmail: VITORIA }, select: { id: true } });
  await db.waConnection.update({
    where: { id: conn!.id },
    data: { tokenFalhouEm: new Date(), tokenErro: "Token expirado ou revogado" },
  });

  const daVitoria = await (await get(cookieV, "equipe-insights?p=month")).json();
  assert.equal(daVitoria.semToken.length, 1);

  const daMichele = await (await get(cookieM, "equipe-insights?p=month")).json();
  assert.deepEqual(daMichele.semToken, [], "problema da colega não entra no painel dela");

  await db.waConnection.update({ where: { id: conn!.id }, data: { tokenFalhouEm: null, tokenErro: null } });
});
