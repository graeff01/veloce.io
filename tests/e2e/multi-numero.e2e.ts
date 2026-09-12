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
let contatoDaAna = "";
let contatoDoBruno = "";
const criados: string[] = [];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const agora = new Date();
const marca = Date.now();
const dozeDiasAtras = new Date(Date.now() - 12 * 86_400_000);

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

  contatoDaAna = await conversa(nAna.id, `55549${marca}01`, { stage: "convertido", venda: 1000, respostas: 3 });
  await conversa(nAna.id, `55549${marca}02`, { stage: "qualificado", respostas: 1 });
  // O SEGUNDO número: é a conversa que, antes, o portal não conseguia abrir.
  contatoDoBruno = await conversa(nBruno.id, `55549${marca}03`, { stage: "negociacao", respostas: 2 });
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

// ── o portal atravessa os números ────────────────────────────────────────────
// A lista de conversas já somava os números; abrir, marcar funil, contar badge e
// baixar mídia ainda procuravam o contato dentro de "a" conexão do cliente — a
// primeira. Toda conversa dos outros cinco números respondia "não encontrada".

test("a caixa lista conversas de TODOS os números", async () => {
  const r = await fetch(`${BASE}/api/portal/${token}/conversations?limit=50`, { headers: { cookie } });
  assert.equal(r.status, 200);
  const d = await r.json();
  const ids = new Set(d.conversations.map((c: { contactId: string }) => c.contactId));
  assert.ok(ids.has(contatoDaAna), "conversa do primeiro número");
  assert.ok(ids.has(contatoDoBruno), "conversa do SEGUNDO número");
});

test("abrir uma conversa do segundo número responde 200", async () => {
  for (const [rotulo, contactId] of [["primeiro", contatoDaAna], ["segundo", contatoDoBruno]] as const) {
    const r = await fetch(`${BASE}/api/portal/${token}/conversations/${contactId}`, { headers: { cookie } });
    assert.equal(r.status, 200, `conversa do ${rotulo} número`);
  }
});

test("mudar a etapa do funil funciona em qualquer número", async () => {
  const r = await fetch(`${BASE}/api/portal/${token}/funnel/${contatoDoBruno}`, {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ stage: "qualificado" }),
  });
  assert.equal(r.status, 200);
});

test("o contador da barra soma os números", async () => {
  const r = await fetch(`${BASE}/api/portal/${token}/badges`, { headers: { cookie }, cache: "no-store" });
  assert.equal(r.status, 200);
  const d = await r.json();
  // Toda conversa criada aqui tem eco de SAÍDA como última mensagem, menos a do
  // número da casa — que não tem mensagem nenhuma. Ninguém está aguardando.
  assert.equal(typeof d.waiting, "number", "o badge não pode virar nulo com vários números");
});

test("conversa de OUTRO cliente continua fora de alcance", async () => {
  const intruso = await db.client.create({ data: { name: `Intruso ${marca}`, slug: `intruso-${marca}` } });
  criados.push(intruso.id);
  const conn = await db.waConnection.create({
    data: { clientId: intruso.id, wabaId: `waba-x-${marca}`, phoneNumberId: `pn-x-${marca}`, accessToken: "fake" },
  });
  const alheio = await db.waContact.create({
    data: { connectionId: conn.id, waId: `5554900${marca}`, displayName: "Lead alheio", lastMessageAt: agora },
  });
  const r = await fetch(`${BASE}/api/portal/${token}/conversations/${alheio.id}`, { headers: { cookie } });
  assert.equal(r.status, 404, "abrir por contato não pode virar porta para outro cliente");
});

// ── o filtro por número ──────────────────────────────────────────────────────
// A caixa junta os números; o filtro é o que deixa olhar um de cada vez (abas no
// desktop, seletor no celular). O filtro é do SERVIDOR de propósito: filtrar na
// tela mentiria assim que a lista passasse de uma página.

test("a resposta traz os números do cliente, com equipe", async () => {
  const r = await fetch(`${BASE}/api/portal/${token}/conversations?limit=5`, { headers: { cookie } });
  const d = await r.json();
  assert.equal(d.conexoes.length, 3, "três números, mesmo os que não têm conversa nesta página");
  const equipes = d.conexoes.map((c: { equipe: string | null }) => c.equipe);
  assert.deepEqual(equipes, ["consultoria", "captacao", null]);
});

test("filtrar por um número devolve só as conversas dele", async () => {
  const lista = await (await fetch(`${BASE}/api/portal/${token}/conversations?limit=50`, { headers: { cookie } })).json();
  const daAna = lista.conexoes[0].id;
  const r = await fetch(`${BASE}/api/portal/${token}/conversations?limit=50&conexao=${daAna}`, { headers: { cookie } });
  const d = await r.json();
  assert.ok(d.conversations.length > 0);
  for (const c of d.conversations) assert.equal(c.conexaoId, daAna, "conversa de outro número vazou pelo filtro");
  assert.ok(d.conversations.length < lista.conversations.length, "o filtro precisa filtrar de verdade");
});

test("filtro apontando para número de outro cliente é ignorado, não obedecido", async () => {
  const outro = await db.waConnection.findFirst({ where: { clientId: { not: clientId } }, select: { id: true } });
  if (!outro) return; // base sem outro cliente: nada a provar aqui
  const r = await fetch(`${BASE}/api/portal/${token}/conversations?limit=50&conexao=${outro.id}`, { headers: { cookie } });
  const d = await r.json();
  assert.ok(d.conversations.length > 0, "cair num filtro alheio não pode esvaziar a caixa");
  const meus = new Set(d.conexoes.map((c: { id: string }) => c.id));
  for (const c of d.conversations) assert.ok(meus.has(c.conexaoId), "só números deste cliente");
});

// ── o formato da Jardim do Lago ──────────────────────────────────────────────
// Um perfil, três abas: WhatsApp, Funil e Equipe (as métricas individuais e
// gerais). Isso é CONFIGURAÇÃO — `ClientPortal.sections` —, não código; este
// teste prova que a configuração produz o que se espera dela.

test("com três seções, o portal mostra três abas e nada mais", async () => {
  await db.clientPortal.update({ where: { clientId }, data: { sections: "conversas,funil,equipe" } });

  const html = await (await fetch(`${BASE}/r/${token}/conversas`, { headers: { cookie } })).text();
  for (const caminho of ["/conversas", "/funil", "/equipe"]) {
    assert.ok(html.includes(`/r/${token}${caminho}`), `a aba ${caminho} precisa estar no menu`);
  }
  for (const fora of ["/anuncios", "/consumo", "/frete", "/aprendizado", "/objecoes"]) {
    assert.ok(!html.includes(`/r/${token}${fora}`), `${fora} não foi configurada e não pode aparecer`);
  }
});

test("as três páginas da configuração respondem", async () => {
  for (const caminho of ["/conversas", "/funil", "/equipe"]) {
    const r = await fetch(`${BASE}/r/${token}${caminho}`, { headers: { cookie } });
    assert.equal(r.status, 200, `página ${caminho}`);
  }
});

test("a barra do celular leva as três, não duas", async () => {
  // A regra vive em lib/portal/modulos.ts e é testada lá; aqui o que se prova é
  // que ela chega na página com as seções certas — Equipe entra na barra porque
  // este cliente tem poucas seções, e acompanhar é o trabalho das gerentes.
  const html = await (await fetch(`${BASE}/r/${token}/equipe`, { headers: { cookie } })).text();
  assert.ok(html.includes("Navegação principal"), "a barra inferior precisa existir na página");
});

test("responsável SEM acesso ao portal ainda vira linha de métrica", async () => {
  // O caso real: os seis funcionários da Jardim do Lago atendem pelo próprio
  // celular e nunca entram na plataforma. Se só quem tem acesso pudesse ser
  // dono de um número, as métricas individuais delas não existiriam.
  const externo = "carla.sem.acesso@teste.local";
  const conn = await numero(externo, "captacao", `externa${Date.now()}`);
  await conversa(conn.id, `55549${marca}09`, { stage: "qualificado", respostas: 2 });

  const r = await fetch(`${BASE}/api/portal/${token}/team-metrics?p=month`, { headers: { cookie }, cache: "no-store" });
  const d = await r.json();
  const linha = d.rows.find((x: { email: string }) => x.email === externo);
  assert.ok(linha, "quem atende num número é dono das conversas dele, tendo acesso ou não");
  assert.equal(linha.owned, 1);
  assert.equal(linha.replies, 2);
  assert.equal(linha.name, "carla.sem.acesso", "sem cadastro, o nome sai do e-mail");
});

// ── Equipe: o que o gestor decide ────────────────────────────────────────────
// A tela repetia convertidos, receita e qualificados — as perguntas do Funil,
// ditas de outro jeito. Ficou tempo, fila e o diagnóstico que sai deles.

test("os gargalos saem de regras, não de achismo", async () => {
  // O caso que o gargalo existe para pegar: o lead escreveu e NADA saiu. Criado
  // aqui, num número próprio, para não mexer nas contas que os testes acima já
  // afirmaram — eles rodam antes deste.
  const abandonado = await numero("gabriel.demo@teste.local", "captacao", `abandono${marca}`);
  const contact = await db.waContact.create({
    data: { connectionId: abandonado.id, waId: `55549${marca}77`, displayName: "Lead abandonado", lastMessageAt: dozeDiasAtras },
  });
  await db.waMessage.create({
    data: { connectionId: abandonado.id, contactId: contact.id, waMessageId: `abandono-${marca}`,
            direction: "in", type: "text", text: "oi, ainda tem?", timestamp: dozeDiasAtras },
  });
  await db.waConversation.create({
    data: {
      connectionId: abandonado.id, contactId: contact.id, funnelStage: "recebido", status: "waiting",
      firstInboundAt: dozeDiasAtras, lastInboundAt: dozeDiasAtras,
      lastOutboundAt: null, // NINGUÉM respondeu — é o ponto
      lastMessageAt: dozeDiasAtras, createdAt: dozeDiasAtras,
    },
  });

  const r = await fetch(`${BASE}/api/portal/${token}/equipe-insights?p=month`, { headers: { cookie }, cache: "no-store" });
  assert.equal(r.status, 200);
  const d = await r.json();

  assert.ok(d.geral.esperando > 0, "a fila tem que ser contada");
  assert.ok(d.geral.semResposta > 0, "lead sem nenhuma resposta tem que ser contado");
  const tipos = d.gargalos.map((g: { tipo: string }) => g.tipo);
  assert.ok(tipos.includes("sem_resposta"), `lead sem nenhuma resposta precisa virar gargalo (veio: ${tipos})`);

  // Todo gargalo precisa dizer o que é E o que fazer — senão é só um alarme.
  for (const g of d.gargalos) {
    assert.ok(g.titulo.length > 5, "gargalo sem título");
    assert.ok(g.detalhe.length > 20, `gargalo "${g.titulo}" sem explicação`);
    assert.ok(["alta", "media"].includes(g.gravidade));
  }
});

test("a Equipe não repete o que é do Funil", async () => {
  // Número repetido em duas telas não informa duas vezes: faz duvidar de qual
  // das duas está certa. Conversão e receita moram no Funil.
  const d = await (await fetch(`${BASE}/api/portal/${token}/equipe-insights?p=month`, { headers: { cookie } })).json();
  const bruto = JSON.stringify(d);
  for (const campo of ["revenue", "converted", "qualified", "receita", "convertidos"]) {
    assert.ok(!bruto.includes(`"${campo}"`), `"${campo}" é assunto do Funil e voltou para a Equipe`);
  }
});

test("cada pessoa tem o detalhe que abre no modal", async () => {
  const d = await (await fetch(`${BASE}/api/portal/${token}/equipe-insights?p=month`, { headers: { cookie } })).json();
  assert.ok(d.pessoas.length >= 2);
  for (const p of d.pessoas) {
    for (const campo of ["nome", "leads", "esperando", "esperaMaxMin", "semResposta", "primeiraRespostaSec", "respostaSec"]) {
      assert.ok(campo in p, `falta ${campo} em ${p.nome}`);
    }
    assert.ok(!p.nome.includes("@"), `o nome não pode ser o e-mail cru (veio "${p.nome}")`);
  }
});

test("o formato que o APLICATIVO consome não mudou", async () => {
  // `team-metrics` continua existindo com a forma antiga: apps/mobile lê dali.
  // Trocar a tela do portal não pode quebrar o app que ainda nem foi lançado.
  const d = await (await fetch(`${BASE}/api/portal/${token}/team-metrics?p=month`, { headers: { cookie } })).json();
  for (const campo of ["me", "isAdmin", "rows", "team", "unassigned", "periodLabel"]) {
    assert.ok(campo in d, `team-metrics perdeu "${campo}" — o app depende disso`);
  }
  const linha = d.rows[0];
  for (const campo of ["email", "name", "converted", "revenue", "replies", "avgFirstResponseSec"]) {
    assert.ok(campo in linha, `a linha de team-metrics perdeu "${campo}"`);
  }
});

// ── Número que parou de receber ──────────────────────────────────────────────
// O defeito que faz a tela MENTIR: sem nada chegando, a pessoa daquele número
// aparece impecável — fila zero, nada esperando, nenhum gargalo. A gestora lê
// "está tranquilo" quando o certo é "está fora do ar".

test("número mudo vira o PRIMEIRO alerta, e marca a pessoa", async () => {
  const conn = await db.waConnection.findFirst({ where: { clientId, ownerEmail: ANA }, select: { id: true, lastEventAt: true } });

  // Histórico: a regra só desconfia de número que JÁ TRABALHOU, e o cenário
  // deste arquivo tem poucas mensagens. Sem isto o teste passaria por engano —
  // o número não seria acusado por falta de histórico, não por estar vivo.
  const alvo = await db.waContact.findFirst({ where: { connectionId: conn!.id }, select: { id: true } });
  await db.waMessage.createMany({
    data: Array.from({ length: 25 }, (_, n) => ({
      connectionId: conn!.id, contactId: alvo!.id, waMessageId: `hist-${marca}-${n}`,
      direction: n % 2 ? "out" : "in", type: "text", text: "histórico",
      timestamp: new Date(Date.now() - (40 - n) * 86_400_000),
    })),
  });

  const antes = await (await fetch(`${BASE}/api/portal/${token}/equipe-insights?p=month`, { headers: { cookie }, cache: "no-store" })).json();
  assert.ok(!antes.gargalos.some((g: { tipo: string }) => g.tipo === "numero_mudo"), "nada mudo antes");

  // A queda: última atividade há três dias.
  await db.waConnection.update({ where: { id: conn!.id }, data: { lastEventAt: new Date(Date.now() - 3 * 86_400_000) } });

  const depois = await (await fetch(`${BASE}/api/portal/${token}/equipe-insights?p=month`, { headers: { cookie }, cache: "no-store" })).json();
  assert.equal(depois.gargalos[0]?.tipo, "numero_mudo",
    "tem que vir PRIMEIRO: é o único que faz o resto da tela mentir");
  assert.match(depois.gargalos[0].detalhe, /leads desse número não chegam/i,
    "precisa explicar por que a pessoa parece em dia");
  assert.ok(depois.mudos.some((m: { dono: string }) => m.dono === ANA),
    "a tela precisa saber de quem é, para marcar a linha dela");

  await db.waConnection.update({ where: { id: conn!.id }, data: { lastEventAt: conn!.lastEventAt } });
  await db.waMessage.deleteMany({ where: { waMessageId: { startsWith: `hist-${marca}-` } } });
});

test("número recém-conectado não vira alerta", async () => {
  // Conexão nova, sem histórico, parada há uma semana: está esperando a
  // primeira mensagem, não caiu. Sem esta distinção, todo cliente novo nasceria
  // com um alerta vermelho.
  const novo = await db.waConnection.create({
    data: {
      clientId, wabaId: `w-novo-${marca}`, phoneNumberId: `pn-novo-${marca}`, accessToken: "fake",
      name: "Recém-conectado", lastEventAt: new Date(Date.now() - 7 * 86_400_000),
    },
  });
  const d = await (await fetch(`${BASE}/api/portal/${token}/equipe-insights?p=month`, { headers: { cookie }, cache: "no-store" })).json();
  assert.ok(!d.mudos.some((m: { nome: string }) => m.nome === "Recém-conectado"),
    "número que nunca trabalhou não pode ser acusado de ter parado");
  await db.waConnection.delete({ where: { id: novo.id } });
});
