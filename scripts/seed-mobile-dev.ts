// ── Seed de demonstração para testar o app no iPhone (Expo Go) ────────────────
// Cria UM cliente com login, conversas realistas e um orçamento pendente, para
// explorar o app à mão. Nada aqui vai para produção.
//
//   npx tsx scripts/seed-mobile-dev.ts
//
// TRAVA: o script se RECUSA a rodar contra qualquer banco que não seja local.
// Um seed que pudesse tocar produção é um acidente esperando acontecer.

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { hashPassword } from "@/lib/portal-auth";

const EMAIL = "vendedora@demo.local";
const SENHA = "Demo#2026veloce";

function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) {
    console.error("DATABASE_URL não definida. Este script só roda em ambiente local.");
    process.exit(1);
  }
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { host = ""; }
  const local =
    host === "localhost" || host === "127.0.0.1" || host === "::1" ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!local) {
    console.error(`RECUSADO: DATABASE_URL aponta para "${host}", que não é local.`);
    console.error("Este seed só pode rodar contra um banco de desenvolvimento.");
    process.exit(1);
  }
  console.log(`banco local confirmado (${host})`);
}

const MENSAGENS: { dir: "in" | "out"; texto: string; ia?: boolean; minAtras: number }[] = [
  { dir: "in", texto: "Oi, vi o anúncio da churrasqueira", minAtras: 180 },
  { dir: "out", texto: "Boa tarde! Que bom que se interessou 😊 A Gourmet 80 é a nossa mais procurada. Você é de qual cidade?", ia: true, minAtras: 178 },
  { dir: "in", texto: "sou de canoas", minAtras: 170 },
  { dir: "out", texto: "Perfeito, atendemos Canoas com entrega e montagem. A Gourmet 80 sai por R$ 4.390 + frete. Quer que eu monte o orçamento completo?", ia: true, minAtras: 168 },
  { dir: "in", texto: "pode mandar sim", minAtras: 20 },
];

async function main() {
  exigirBancoLocal();

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  // Recria do zero para o seed ser repetível.
  const antigo = await db.client.findFirst({ where: { slug: "demo-mobile" } });
  if (antigo) {
    await db.portalSession.deleteMany({ where: { clientId: antigo.id } });
    await db.deviceToken.deleteMany({ where: { clientId: antigo.id } });
    await db.quote.deleteMany({ where: { clientId: antigo.id } });
    await db.aiAgentConfig.deleteMany({ where: { clientId: antigo.id } });
    await db.portalAccess.deleteMany({ where: { clientId: antigo.id } });
    await db.clientPortal.deleteMany({ where: { clientId: antigo.id } });
    await db.client.delete({ where: { id: antigo.id } });
    console.log("demo anterior removida");
  }

  const client = await db.client.create({
    data: { name: "Churrasqueiras Demo", slug: "demo-mobile", city: "Canoas" },
  });

  // Token gerado aleatoriamente, como em produção. NUNCA um valor fixo em código.
  const token = (await import("crypto")).randomBytes(18).toString("base64url");
  await db.clientPortal.create({
    data: { clientId: client.id, token, requireLogin: true, accentColor: "#B4231F", mode: "light", active: true },
  });
  await db.portalAccess.create({
    data: { clientId: client.id, email: EMAIL, name: "Maria", role: "admin", passwordHash: await hashPassword(SENHA) },
  });
  await db.aiAgentConfig.create({ data: { clientId: client.id, quotesEnabled: true } });

  const conn = await db.waConnection.create({
    data: {
      clientId: client.id, wabaId: "demo-waba", phoneNumberId: "demo-phone",
      accessToken: "token-falso-demo", displayPhone: "+55 51 99999-0000",
    },
  });

  const agora = Date.now();
  const min = (m: number) => new Date(agora - m * 60_000);

  // Lead 1: veio de anúncio, conversa ativa, janela ABERTA, orçamento pendente.
  const joao = await db.waContact.create({
    data: { connectionId: conn.id, waId: "5551999880001", displayName: "João Pereira", lastMessageAt: min(20) },
  });
  await db.waLead.create({
    data: {
      connectionId: conn.id, contactId: joao.id, waId: joao.waId, enteredAt: min(180),
      adTitle: "Churrasqueira Gourmet 80 — pronta entrega", adModel: "Gourmet 80",
      sourceType: "ad", adId: "demo-ad-1",
    },
  });
  await db.waConversation.create({
    data: { connectionId: conn.id, contactId: joao.id, funnelStage: "negociacao" },
  });
  for (const [i, m] of MENSAGENS.entries()) {
    await db.waMessage.create({
      data: {
        connectionId: conn.id, contactId: joao.id, waMessageId: `demo-joao-${i}`,
        direction: m.dir, type: "text", text: m.texto, aiGenerated: !!m.ia,
        timestamp: min(m.minAtras),
        ...(m.dir === "out" ? { deliveredAt: min(m.minAtras - 1), readAt: min(m.minAtras - 1) } : {}),
      },
    });
  }

  // Lead 2: aguardando resposta há pouco (aparece com o ponto verde na lista).
  const ana = await db.waContact.create({
    data: { connectionId: conn.id, waId: "5551999880002", displayName: "Ana Beatriz", lastMessageAt: min(5) },
  });
  await db.waConversation.create({ data: { connectionId: conn.id, contactId: ana.id, funnelStage: "recebido" } });
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: ana.id, waMessageId: "demo-ana-0",
      direction: "in", type: "text", text: "vocês fazem entrega em Porto Alegre?", timestamp: min(5),
    },
  });

  // Lead 3: janela FECHADA (última mensagem do lead há 3 dias) — a barra de envio
  // aparece desabilitada, que é a regra do WhatsApp vinda do servidor.
  const carlos = await db.waContact.create({
    data: { connectionId: conn.id, waId: "5551999880003", displayName: "Carlos Menezes", lastMessageAt: min(3 * 24 * 60) },
  });
  await db.waConversation.create({ data: { connectionId: conn.id, contactId: carlos.id, funnelStage: "perdido" } });
  await db.waMessage.create({
    data: {
      connectionId: conn.id, contactId: carlos.id, waMessageId: "demo-carlos-0",
      direction: "in", type: "text", text: "vou pensar e retorno", timestamp: min(3 * 24 * 60),
    },
  });

  const tagQuente = await db.waTag.create({ data: { connectionId: conn.id, name: "Quente", color: "#EF4444" } });
  await db.waContactTag.create({ data: { contactId: joao.id, tagId: tagQuente.id } });

  // Orçamento aguardando revisão — alimenta a aba Revisão do app.
  await db.quote.create({
    data: {
      clientId: client.id, contactId: joao.id, number: 1, status: "pending_review",
      subtotal: 4390.5, total: 4890.5, currency: "BRL",
      items: [
        { label: "Churrasqueira Gourmet 80", qty: 1, unit: 4390.5, amount: 4390.5 },
        { label: "Frete e montagem — Canoas", qty: 1, unit: 500, amount: 500 },
      ],
      intake: { cidade_entrega: "Canoas", local_instalacao: "área externa", opcionais: "chapa bifeteira" },
      summary: "Gourmet 80 + frete e montagem",
    },
  });

  const ip = process.env.DEV_LAN_IP ?? "SEU-IP-DA-REDE";
  console.log("\n─────────────────────────────────────────────");
  console.log("Demo pronta.\n");
  console.log(`  Link do painel:  http://${ip}:3000/r/${token}`);
  console.log(`  E-mail:          ${EMAIL}`);
  console.log(`  Senha:           ${SENHA}`);
  console.log("\nCole o link na tela de vínculo do app.");
  console.log("─────────────────────────────────────────────\n");

  await db.$disconnect();
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
