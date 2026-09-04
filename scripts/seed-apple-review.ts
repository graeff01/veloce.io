/**
 * Conta de DEMONSTRAÇÃO para a revisão da App Store.
 *
 * O revisor da Apple precisa entrar no app e ver as telas funcionando. Ele não
 * pode receber acesso a um cliente real: as conversas são de pessoas de verdade.
 * Este script cria um cliente FICTÍCIO, isolado, com dados inventados.
 *
 * Roda contra o banco que o DATABASE_URL apontar. Em produção, é uma execução
 * consciente e única — feita por você, no deploy.
 *
 *   npx tsx scripts/seed-apple-review.ts            # cria/atualiza
 *   npx tsx scripts/seed-apple-review.ts --clean    # remove tudo que criou
 *
 * O que ele NÃO faz: não toca em nenhum cliente existente, não cria conexão de
 * WhatsApp com token real (o campo fica inválido de propósito, então nada é
 * enviado para fora), e não liga anúncios.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })) } as never);

const SLUG = "apple-review-demo";
const EMAIL = "review@apple.veloce.io";
const SENHA = process.env.APPLE_REVIEW_PASSWORD || "Review@Veloce2026";
const CONN = "apple-review-demo-conn";

const DIA = 86_400_000;
const atras = (n: number) => new Date(Date.now() - n * DIA);

// Pessoas e conversas inventadas. Nomes genéricos de propósito.
const LEADS = [
  { nome: "Ana Ribeiro",   etapa: "qualificado", espera: true,  texto: "Bom dia! Qual o prazo de entrega?" },
  { nome: "Bruno Cardoso", etapa: "negociacao",  espera: true,  texto: "Consegue fazer por 4 mil?" },
  { nome: "Carla Dias",    etapa: "recebido",    espera: true,  texto: "Vi o anúncio de vocês" },
  { nome: "Diego Moura",   etapa: "convertido",  espera: false, texto: "Fechado, pode agendar" },
  { nome: "Elisa Prado",   etapa: "perdido",     espera: false, texto: "Achei mais barato em outro lugar" },
];

async function limpar(clientId: string) {
  const wa = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });
  if (wa) {
    await prisma.leadProfile.deleteMany({ where: { connectionId: wa.id } });
    await prisma.waConnection.delete({ where: { clientId } }); // cascata: contatos, mensagens, conversas
  }
  await prisma.quote.deleteMany({ where: { clientId } });
  await prisma.portalSession.deleteMany({ where: { clientId } });
  await prisma.portalAccess.deleteMany({ where: { clientId } });
  await prisma.clientPortal.deleteMany({ where: { clientId } });
  await prisma.aiAgentConfig.deleteMany({ where: { clientId } });
}

async function main() {
  const limpando = process.argv.includes("--clean");
  const existente = await prisma.client.findUnique({ where: { slug: SLUG }, select: { id: true } });

  if (limpando) {
    if (!existente) { console.log("nada a remover"); return; }
    await limpar(existente.id);
    await prisma.client.delete({ where: { id: existente.id } });
    console.log("✅ conta de revisão removida");
    return;
  }

  const client = existente ?? await prisma.client.create({
    data: { name: "Veloce Demo", slug: SLUG, status: "ACTIVE", city: "São Paulo", niche: "Demonstração" },
    select: { id: true },
  });
  await limpar(client.id);

  // Token novo a cada execução: o anterior deixa de valer.
  const token = randomBytes(18).toString("base64url");
  await prisma.clientPortal.create({
    data: {
      clientId: client.id, token, active: true, requireLogin: true, maxUsers: 3,
      accentColor: "#2563EB", mode: "light",
      // Só o que o app usa. O revisor não precisa ver o portal inteiro.
      sections: "conversas,revisao",
    },
  });
  await prisma.portalAccess.create({
    data: {
      clientId: client.id, email: EMAIL, name: "Revisão Apple", role: "attendant",
      passwordHash: await bcrypt.hash(SENHA, 10),
    },
  });
  await prisma.aiAgentConfig.create({ data: { clientId: client.id, quotesEnabled: true } });

  // Conexão de WhatsApp com credencial INVÁLIDA de propósito: as telas
  // funcionam, e nenhuma mensagem consegue sair para o mundo.
  const conn = await prisma.waConnection.create({
    data: {
      clientId: client.id, phoneNumberId: "000000000000000",
      accessToken: "DEMO_SEM_CREDENCIAL", wabaId: "demo",
      name: "Veloce Demo", displayPhone: "+55 11 90000-0000",
    },
    select: { id: true },
  });

  for (const [i, l] of LEADS.entries()) {
    const contato = await prisma.waContact.create({
      data: { connectionId: conn.id, waId: `5511900000${String(i).padStart(3, "0")}`, name: l.nome },
      select: { id: true },
    });
    const quando = atras(i);
    await prisma.waMessage.create({
      data: {
        connectionId: conn.id, contactId: contato.id, waMessageId: `demo-${i}`,
        direction: "in", type: "text", text: l.texto, timestamp: quando,
      },
    });
    await prisma.waConversation.create({
      data: {
        // A prévia da lista vem da ÚLTIMA mensagem, por junção — a conversa não
        // guarda texto. Por isso só as datas e a etapa entram aqui.
        connectionId: conn.id, contactId: contato.id,
        lastMessageAt: quando, lastInboundAt: quando,
        inboundCount: 1, funnelStage: l.etapa, status: "open",
      },
    });
  }

  // Um orçamento aguardando revisão, para a aba Orçamentos ter conteúdo.
  const primeiro = await prisma.waContact.findFirst({ where: { connectionId: conn.id }, select: { id: true } });
  if (primeiro) {
    await prisma.quote.create({
      data: {
        clientId: client.id, contactId: primeiro.id, number: 1, status: "pending_review",
        subtotal: 3900, fees: 300, total: 4200, currency: "BRL", submittedAt: atras(0),
        items: [{ label: "Produto de demonstração", qty: 1, unit: 3900, amount: 3900 },
                { label: "Entrega", qty: 1, unit: 300, amount: 300 }],
        intake: { cidade_entrega: "São Paulo" },
        summary: "Orçamento de demonstração",
      },
    });
  }

  console.log("\n✅ Conta de revisão pronta — informe estes dados no App Store Connect:\n");
  console.log(`   Link do painel: <sua-url>/r/${token}`);
  console.log(`   E-mail:         ${EMAIL}`);
  console.log(`   Senha:          ${SENHA}\n`);
  console.log("   Envio de WhatsApp está desativado nesta conta (credencial inválida de propósito).");
  console.log("   Para remover depois: npx tsx scripts/seed-apple-review.ts --clean\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
