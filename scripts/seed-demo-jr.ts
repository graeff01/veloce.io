/**
 * Dados de DEMONSTRAÇÃO para o cliente REAL "JR Churrasqueiras" (slug: jr-churrasqueiras).
 * Popula TODAS as abas do portal (/r/<token>): Painel, Anúncios, IA, Funil, Conversas, Equipe.
 *
 * Feito para o cliente logar e ver como o painel fica cheio. NÃO altera o perfil
 * do cliente (nome/contato) — só cria dados-filho (WhatsApp, Meta, portal, IA).
 *
 * Uso:
 *   npm run db:seed:demo:jr           # popula (idempotente: limpa o demo antigo e recria)
 *   npm run db:seed:demo:jr -- --clean   # REMOVE tudo que este script criou
 *
 * Remoção: o modo --clean apaga só o que foi semeado aqui (conexões WhatsApp/Meta demo,
 * acessos @jrchurrasqueira.demo, config de IA/bot demo) e reverte o login do portal.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);

const SLUG = process.env.SLUG || "jr-churrasqueiras";
const FALLBACK_TOKEN = "jrchurra-demo"; // token legível usado só se o cliente ainda não tiver portal
const DEMO_EMAIL_DOMAIN = "jrchurrasqueira.demo"; // marcador dos acessos criados aqui
const DEMO_PASSWORD = "Churras@2026"; // senha de todos os acessos demo (fácil de trocar)

const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const DAY = 86_400_000;
const daysSoFar = Math.max(1, Math.floor((now.getTime() - monthStart.getTime()) / DAY) + 1);
const dAgo = (n: number) => new Date(now.getTime() - n * DAY);
// coloca um lead "recente" dentro do mês atual (nunca no 1º dia futuro nem no futuro):
// recua 3h da base para que até um lead de "hoje" tenha resposta/venda no passado.
const RECENT_OFFSET = 3 * 3_600_000;
const inMonth = (daysAgo: number) => new Date(now.getTime() - Math.min(daysAgo, daysSoFar - 1) * DAY - RECENT_OFFSET);
// nunca deixa um timestamp derivado cair no futuro (o período do mês vai só até agora).
const beforeNow = (d: Date) => new Date(Math.min(d.getTime(), now.getTime() - 60_000));

// atendentes (equipe) — e-mails no domínio-marcador para limpeza segura
const TEAM = {
  dono: { email: `dono@${DEMO_EMAIL_DOMAIN}`, name: "João Ricardo", role: "admin" as const },
  marcos: { email: `marcos@${DEMO_EMAIL_DOMAIN}`, name: "Marcos Vendas", role: "attendant" as const },
  aline: { email: `aline@${DEMO_EMAIL_DOMAIN}`, name: "Aline Atendimento", role: "attendant" as const },
};
type TeamKey = keyof typeof TEAM;

async function findClient() {
  const client = await prisma.client.findUnique({ where: { slug: SLUG } });
  if (!client) throw new Error(`Cliente slug="${SLUG}" não encontrado. Ajuste a env SLUG=... e rode de novo.`);
  return client;
}

// Remove SÓ o que este script cria — seguro mesmo se o cliente já existir.
async function wipe(clientId: string) {
  const wa = await prisma.waConnection.findUnique({ where: { clientId }, select: { id: true } });
  if (wa) {
    // LeadProfile não tem cascade por conexão — apaga explicitamente antes da conexão.
    await prisma.leadProfile.deleteMany({ where: { connectionId: wa.id } });
    await prisma.waConnection.delete({ where: { clientId } }); // cascade: contatos/mensagens/leads/conversas
  }
  await prisma.metaConnection.deleteMany({ where: { clientId } }); // cascade: campanhas/ads/criativos/insights
  await prisma.leadObjection.deleteMany({ where: { clientId } });   // sem FK cascade — apaga explícito
  await prisma.messageAnalysis.deleteMany({ where: { clientId } }); // idem
  await prisma.knowledgeChunk.deleteMany({ where: { clientId } });  // conhecimento demo importado do site
  await prisma.portalAccess.deleteMany({ where: { clientId, email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
  await prisma.portalSession.deleteMany({ where: { clientId, email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` } } });
  await prisma.aiAgentConfig.deleteMany({ where: { clientId } });
  await prisma.clientBot.deleteMany({ where: { clientId } });
}

async function main() {
  const client = await findClient();
  const clientId = client.id;
  const clean = process.argv.includes("--clean");

  await wipe(clientId);

  if (clean) {
    // reverte o portal para o estado sem login (não apaga o token/link do cliente)
    await prisma.clientPortal.updateMany({ where: { clientId }, data: { requireLogin: false, sections: null } });
    console.log(`🧹 Demo removido do cliente "${client.name}" (${SLUG}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const emailOf = (k: TeamKey | null | undefined) => (k ? TEAM[k].email : null);

  // ── Portal: garante link + LIGA login (para a aba Equipe mostrar o ranking do admin) ──
  const existingPortal = await prisma.clientPortal.findUnique({ where: { clientId }, select: { token: true } });
  const portal = await prisma.clientPortal.upsert({
    where: { clientId },
    update: { accentColor: "#C0392B", mode: "light", active: true, requireLogin: true, maxUsers: 5, sections: null },
    create: { clientId, token: FALLBACK_TOKEN, accentColor: "#C0392B", mode: "light", active: true, requireLogin: true, maxUsers: 5, sections: null },
    select: { token: true },
  });

  // ── Equipe (acessos do portal) ──
  for (const t of Object.values(TEAM)) {
    await prisma.portalAccess.create({ data: { clientId, email: t.email, name: t.name, role: t.role, passwordHash, lastLoginAt: dAgo(1) } });
  }

  // ── Marca/Bot + IA ──
  await prisma.clientBot.create({ data: { clientId, active: true, brandName: "JR Churrasqueiras" } });
  await prisma.aiAgentConfig.create({ data: {
    clientId, enabled: true, status: "test", vertical: "servicos",
    assistantName: "Bruna",
    greetingMessage: "Olá! Sou a Bruna, assistente da JR Churrasqueiras 🔥 Vai construir sua área gourmet? Me conta o que você procura!",
    persona: "Simpática, direta e que entende de churrasco", goals: "Qualificar o lead, entender o espaço e agendar a visita técnica",
  } });

  // ── Anúncios (Meta) ──
  const metaConn = await prisma.metaConnection.create({ data: { clientId, adAccountId: "act_demo_jr", accessToken: "demo", accountName: "JR Churrasqueiras", currency: "BRL", lastSyncAt: now, lastAdSyncAt: now } });
  const IMG = {
    premoldada: "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1080&q=80",
    gourmet: "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&w=1080&q=80",
    bafo: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=1080&q=80",
    parrilla: "https://images.unsplash.com/photo-1558030006-450675393462?auto=format&fit=crop&w=1080&q=80",
  };
  const campaigns = [
    { campaignId: "jr_c_premold", name: "Churrasqueira Pré-Moldada · Instalada", budget: 45 },
    { campaignId: "jr_c_gourmet", name: "Área Gourmet Completa", budget: 40 },
    { campaignId: "jr_c_bafo", name: "Churrasqueira a Bafo (Gaúcha)", budget: 25 },
  ];
  for (const c of campaigns) {
    await prisma.metaCampaign.create({ data: { connectionId: metaConn.id, campaignId: c.campaignId, name: c.name, objective: "OUTCOME_LEADS", status: "ACTIVE", startedAt: dAgo(50), dailyBudget: c.budget } });
    await prisma.metaAdSet.create({ data: { connectionId: metaConn.id, adsetId: `as_${c.campaignId}`, campaignId: c.campaignId, name: `${c.name} — Conjunto`, status: "ACTIVE", destinationType: "WHATSAPP", learningStage: "SUCCESS" } });
  }
  const ads = [
    { adId: "jr_ad_premold_1", campaignId: "jr_c_premold", name: "Pré-Moldada · Vídeo instalação", creativeId: "cr_premold_1", dailySpend: 30, img: IMG.premoldada },
    { adId: "jr_ad_premold_2", campaignId: "jr_c_premold", name: "Pré-Moldada · Antes e depois", creativeId: "cr_premold_2", dailySpend: 15, img: IMG.parrilla },
    { adId: "jr_ad_gourmet_1", campaignId: "jr_c_gourmet", name: "Área Gourmet · Projeto completo", creativeId: "cr_gourmet_1", dailySpend: 26, img: IMG.gourmet },
    { adId: "jr_ad_bafo_1", campaignId: "jr_c_bafo", name: "Churrasqueira a Bafo · Gaúcha", creativeId: "cr_bafo_1", dailySpend: 18, img: IMG.bafo },
  ];
  const adTitleById = new Map(ads.map((a) => [a.adId, a.name]));
  for (const a of ads) {
    await prisma.metaCreative.create({ data: { connectionId: metaConn.id, creativeId: a.creativeId, name: a.name, title: a.name, body: "Peça seu orçamento pelo WhatsApp 🔥", thumbnailUrl: a.img, imageUrl: a.img } });
    await prisma.metaAd.create({ data: { connectionId: metaConn.id, adId: a.adId, adsetId: `as_${a.campaignId}`, campaignId: a.campaignId, creativeId: a.creativeId, name: a.name, status: "ACTIVE", startedAt: dAgo(45), qualityRanking: "ABOVE_AVERAGE" } });
    // insights diários dos últimos 30 dias (a soma do período do painel/anúncios recorta sozinha)
    for (let d = 0; d < 30; d++) {
      const spend = a.dailySpend * (0.8 + Math.random() * 0.4);
      const imp = 700 + Math.round(Math.random() * 900);
      const clk = Math.round(imp * (0.02 + Math.random() * 0.02));
      // date = marcador de dia-calendário à MEIA-NOITE UTC (padrão do sync Meta)
      const date = new Date(`${dAgo(29 - d).toLocaleDateString("en-CA")}T00:00:00.000Z`);
      await prisma.metaAdInsight.create({ data: { connectionId: metaConn.id, adId: a.adId, date, spend: Math.round(spend * 100) / 100, impressions: imp, reach: Math.round(imp * 0.82), clicks: clk, ctr: Math.round((clk / imp) * 10000) / 100, cpc: Math.round((spend / Math.max(1, clk)) * 100) / 100, cpm: Math.round((spend / imp) * 100000) / 100, frequency: Math.round((1 + Math.random() * 0.6) * 100) / 100, leads: 0 } });
    }
  }

  // ── WhatsApp: conexão + leads/conversas ──
  const wa = await prisma.waConnection.create({ data: { clientId, wabaId: "demo_jr_waba", phoneNumberId: "demo_jr_phone", displayPhone: "+55 54 99999-0000", accessToken: "demo", name: "JR Churrasqueiras", lastEventAt: now } });

  type Lead = {
    name: string; waId: string; daysAgo: number; respSec: number | null;
    stage: string; status: string; adId?: string; assign?: TeamKey; ai?: boolean;
    sale?: number; temp?: "hot" | "warm" | "cold"; qualified?: boolean; reengaged?: boolean; ficha?: boolean;
    msgs: [string, string][];
  };

  // RECENTES (mês atual) — variedade de etapas, atendentes, IA e vendas.
  const leads: Lead[] = [
    { name: "Ricardo Menezes", waId: "5554990001001", daysAgo: 0, respSec: 45, stage: "negociacao", status: "waiting", adId: "jr_ad_premold_1", assign: "marcos", ai: true, temp: "hot", qualified: true, ficha: true,
      msgs: [["in", "Boa noite! Vi o anúncio da churrasqueira pré-moldada. Vocês instalam em Caxias?"], ["out", "Oi Ricardo! Instalamos sim em Caxias e região 🔥 Você tem o espaço com medidas? Consigo te passar um orçamento certinho."], ["in", "Tenho uma área de 3x4 na varanda"]] },
    { name: "Fernanda Rocha", waId: "5554990001002", daysAgo: 0, respSec: null, stage: "recebido", status: "waiting", adId: "jr_ad_gourmet_1", assign: undefined, temp: "warm",
      msgs: [["in", "Oi, queria um orçamento de área gourmet completa"]] },
    { name: "Paulo Sérgio", waId: "5554990001003", daysAgo: 1, respSec: 38, stage: "qualificado", status: "waiting", adId: "jr_ad_premold_1", assign: "aline", ai: true, temp: "hot", qualified: true, ficha: true,
      msgs: [["in", "Quanto fica a pré-moldada instalada com coifa?"], ["out", "Oi Paulo! Depende do modelo, mas o combo pré-moldada + coifa costuma sair a partir de R$ 3.900 instalado. Posso te mandar as fotos dos modelos?"], ["in", "Pode mandar sim!"]] },
    { name: "Juliana Prado", waId: "5554990001004", daysAgo: 2, respSec: 600, stage: "convertido", status: "closed", adId: "jr_ad_gourmet_1", assign: "marcos", sale: 7800, temp: "hot", qualified: true,
      msgs: [["in", "Fechei o projeto da área gourmet, amei o resultado!"], ["out", "Que alegria, Juliana! 🎉 Já vou agendar a instalação com a equipe."]] },
    { name: "Anderson Lima", waId: "5554990001005", daysAgo: 3, respSec: 52, stage: "negociacao", status: "waiting", adId: "jr_ad_bafo_1", assign: "aline", ai: true, temp: "warm", qualified: true,
      msgs: [["in", "A churrasqueira a bafo gaúcha vocês fazem sob medida?"], ["out", "Fazemos sim, Anderson! A bafo a gente monta no tamanho do seu espaço. Qual a largura que você tem disponível?"]] },
    { name: "Cláudia Santos", waId: "5554990001006", daysAgo: 4, respSec: 720, stage: "respondido", status: "open", adId: "jr_ad_premold_2", assign: "marcos", temp: "cold",
      msgs: [["in", "Só pesquisando preço de churrasqueira pra apê"], ["out", "Oi Cláudia! Temos modelos compactos ideais pra apartamento. Quer que eu te envie as opções sem compromisso?"]] },
    { name: "Marcelo Farias", waId: "5554990001007", daysAgo: 5, respSec: 41, stage: "qualificado", status: "waiting", adId: "jr_ad_premold_1", assign: "aline", ai: true, temp: "hot", qualified: true, reengaged: true, ficha: true,
      msgs: [["in", "Preciso de uma churrasqueira instalada até o fim do mês, dá?"], ["out", "Dá sim, Marcelo! Com prazo apertado a gente prioriza. Me manda o endereço e as medidas que já reservo a agenda da equipe 🔥"]] },
    { name: "Tatiane Alves", waId: "5554990001008", daysAgo: 7, respSec: 480, stage: "convertido", status: "closed", adId: "jr_ad_premold_1", assign: "marcos", sale: 4200, temp: "hot", qualified: true,
      msgs: [["in", "Pode fechar a pré-moldada com o balcão!"], ["out", "Perfeito, Tatiane! Vou te passar os próximos passos da instalação 👏"]] },
    { name: "Rogério Pinto", waId: "5554990001009", daysAgo: 8, respSec: 65, stage: "negociacao", status: "waiting", adId: "jr_ad_gourmet_1", assign: "aline", ai: true, temp: "warm", qualified: true,
      msgs: [["in", "Queria a área gourmet com pia e bancada de granito"], ["out", "Boa escolha, Rogério! Com pia + bancada de granito fica um espaço completo. Você prefere granito preto ou branco?"]] },
    { name: "Simone Duarte", waId: "5554990001010", daysAgo: 10, respSec: 900, stage: "respondido", status: "open", assign: "marcos", temp: "cold",
      msgs: [["in", "Vocês parcelam?"], ["out", "Parcelamos sim, Simone! Em até 12x no cartão. Quer que eu monte um orçamento?"]] },
    { name: "Eduardo Braga", waId: "5554990001011", daysAgo: 12, respSec: 48, stage: "qualificado", status: "waiting", adId: "jr_ad_bafo_1", assign: "aline", ai: true, temp: "warm", qualified: true, ficha: true,
      msgs: [["in", "A bafo gaúcha gasta muita lenha?"], ["out", "Boa pergunta! A nossa bafo é bem eficiente, com controle de tiragem — gasta bem menos que as tradicionais. Quer ver um vídeo dela funcionando?"]] },
    { name: "Patrícia Gomes", waId: "5554990001012", daysAgo: 14, respSec: 300, stage: "perdido", status: "closed", assign: "marcos",
      msgs: [["in", "Achei mais barato em outro lugar, obrigada"], ["out", "Sem problema, Patrícia! Qualquer coisa estou por aqui. Boa churrascada 🔥"]] },
    { name: "Vinícius Teixeira", waId: "5554990001013", daysAgo: 16, respSec: 55, stage: "convertido", status: "closed", adId: "jr_ad_gourmet_1", assign: "aline", sale: 9600, temp: "hot", qualified: true,
      msgs: [["in", "Quero fechar a área gourmet completa com churrasqueira e forno de pizza!"], ["out", "Show, Vinícius! 🍕🔥 Vai ficar incrível. Já inicio o projeto."]] },
    { name: "Débora Nunes", waId: "5554990001014", daysAgo: 18, respSec: 660, stage: "respondido", status: "open", adId: "jr_ad_premold_2", assign: "marcos", temp: "cold", reengaged: true,
      msgs: [["in", "Recebi o orçamento, vou pensar"], ["out", "Combinado, Débora! Se surgir dúvida sobre medidas ou instalação, é só chamar 😊"]] },
    { name: "Gustavo Ramos", waId: "5554990001015", daysAgo: 21, respSec: 43, stage: "qualificado", status: "waiting", adId: "jr_ad_premold_1", assign: "aline", ai: true, temp: "warm", qualified: true,
      msgs: [["in", "Vocês dão garantia da instalação?"], ["out", "Damos sim, Gustavo! Garantia de 1 ano na estrutura e na instalação. Segurança total 👊"]] },
    { name: "Larissa Campos", waId: "5554990001016", daysAgo: 24, respSec: 540, stage: "convertido", status: "closed", adId: "jr_ad_bafo_1", assign: "marcos", sale: 3500, temp: "hot", qualified: true,
      msgs: [["in", "Fechado a churrasqueira a bafo! Quando conseguem instalar?"], ["out", "Ótimo, Larissa! 🎉 Consigo essa semana. Já te passo os detalhes."]] },
  ];

  // BASELINE (~70 dias atrás) — atendimento manual, lento e com pouca conversão.
  // Serve para a aba Painel montar o "O que mudou com a Veloce" (antes → agora; exige ≥60d).
  const baseline: Lead[] = [
    { name: "Cliente Antigo 1", waId: "5554990002001", daysAgo: 74, respSec: 2400, stage: "perdido", status: "closed", msgs: [["in", "Oi, queria um orçamento de churrasqueira"], ["out", "Bom dia, retornando seu contato."]] },
    { name: "Cliente Antigo 2", waId: "5554990002002", daysAgo: 72, respSec: 3300, stage: "respondido", status: "closed", msgs: [["in", "Vocês instalam área gourmet?"], ["out", "Instalamos sim."]] },
    { name: "Cliente Antigo 3", waId: "5554990002003", daysAgo: 71, respSec: null, stage: "recebido", status: "closed", msgs: [["in", "Preço da pré-moldada?"]] },
    { name: "Cliente Antigo 4", waId: "5554990002004", daysAgo: 69, respSec: 1800, stage: "convertido", status: "closed", sale: 3200, msgs: [["in", "Pode fechar"], ["out", "Fechado."]] },
    { name: "Cliente Antigo 5", waId: "5554990002005", daysAgo: 67, respSec: 2700, stage: "perdido", status: "closed", msgs: [["in", "Quanto custa?"], ["out", "Segue o valor."]] },
    { name: "Cliente Antigo 6", waId: "5554990002006", daysAgo: 65, respSec: null, stage: "recebido", status: "closed", msgs: [["in", "Tem coifa?"]] },
    { name: "Cliente Antigo 7", waId: "5554990002007", daysAgo: 63, respSec: 3000, stage: "respondido", status: "closed", msgs: [["in", "Parcela em quantas vezes?"], ["out", "Em até 10x."]] },
    { name: "Cliente Antigo 8", waId: "5554990002008", daysAgo: 61, respSec: 2100, stage: "qualificado", status: "closed", msgs: [["in", "Quero agendar visita"], ["out", "Vou verificar a agenda."]] },
  ];

  let mi = 0;
  async function insertLead(l: Lead, recent: boolean) {
    const t0 = recent ? inMonth(l.daysAgo) : dAgo(l.daysAgo);
    const contact = await prisma.waContact.create({ data: { connectionId: wa.id, waId: l.waId, name: l.name, lastMessageAt: t0 } });

    let inCount = 0, outCount = 0, lastIn = t0, lastOut: Date | null = null;
    const respAt = l.respSec != null ? new Date(t0.getTime() + l.respSec * 1000) : null;
    // Timestamps monótonos: 1ª "in" em t0; 1ª "out" no firstResponseAt; demais +4min.
    let cursor = t0.getTime();
    let firstOutDone = false;
    for (let j = 0; j < l.msgs.length; j++) {
      const [dir, text] = l.msgs[j];
      const isFirstOut = dir === "out" && !firstOutDone;
      let tsMs: number;
      if (j === 0) tsMs = t0.getTime();
      else if (isFirstOut && respAt) tsMs = respAt.getTime();
      else tsMs = cursor + 4 * 60 * 1000;
      if (tsMs <= cursor) tsMs = cursor + 60 * 1000; // garante ordem estrita
      cursor = tsMs;
      if (isFirstOut) firstOutDone = true;
      const ts = new Date(tsMs);
      await prisma.waMessage.create({ data: {
        connectionId: wa.id, contactId: contact.id, waMessageId: `jrdemo_${mi++}`, direction: dir, type: "text", text, timestamp: ts,
        aiGenerated: isFirstOut ? !!l.ai : false,
        sentByEmail: dir === "out" && !l.ai ? emailOf(l.assign) : null,
        deliveredAt: dir === "out" ? new Date(tsMs + 3000) : null,
        readAt: dir === "out" ? new Date(tsMs + 9000) : null,
      } });
      if (dir === "in") { inCount++; lastIn = ts; } else { outCount++; lastOut = ts; }
    }

    const evid = ["qualificado", "negociacao", "convertido", "perdido"].includes(l.stage) ? l.msgs.find(([d]) => d === "in")?.[1]?.slice(0, 160) ?? null : null;
    await prisma.waConversation.create({ data: {
      connectionId: wa.id, contactId: contact.id, status: l.status, funnelStage: l.stage,
      funnelManual: l.stage === "convertido", funnelEvidence: evid,
      firstInboundAt: t0, firstResponseSec: l.respSec, firstResponseAt: respAt,
      lastInboundAt: lastIn, lastOutboundAt: lastOut, lastMessageAt: lastOut && lastOut > lastIn ? lastOut : lastIn,
      inboundCount: inCount, outboundCount: outCount, openedAt: t0,
      closedAt: l.status === "closed" ? (lastOut ?? lastIn) : null,
      assignedEmail: emailOf(l.assign), assignedAt: l.assign ? t0 : null,
      saleValue: l.sale ?? null, saleConfirmedAt: l.stage === "convertido" ? beforeNow(new Date(t0.getTime() + (recent ? 2 : 1) * DAY)) : null,
      reengagedAt: l.reengaged ? beforeNow(new Date(t0.getTime() + 1 * DAY)) : null,
      fichaSentAt: l.ficha ? beforeNow(new Date(t0.getTime() + 30 * 60 * 1000)) : null,
    } });

    if (l.adId) {
      await prisma.waLead.create({ data: { connectionId: wa.id, contactId: contact.id, waId: l.waId, name: l.name, adId: l.adId, adTitle: adTitleById.get(l.adId), adBody: "Peça seu orçamento pelo WhatsApp 🔥", sourceType: "ad", sourceUrl: "https://facebook.com", enteredAt: t0 } });
    }
    if (recent && (l.temp || l.qualified)) {
      await prisma.leadProfile.create({ data: { connectionId: wa.id, contactId: contact.id, temperature: l.temp ?? null, qualified: !!l.qualified, score: l.temp === "hot" ? 85 : l.temp === "warm" ? 55 : 25, createdAt: beforeNow(new Date(t0.getTime() + 20 * 60 * 1000)) } });
    }
  }

  for (const l of leads) await insertLead(l, true);
  for (const l of baseline) await insertLead(l, false);

  const link = `${process.env.APP_URL || "https://<seu-dominio>"}/r/${portal.token}`;
  console.log("\n✅ Demo populado para JR Churrasqueiras — todas as abas.");
  console.log("   Cliente:", clientId, existingPortal ? "(portal já existia — token preservado)" : "(portal criado)");
  console.log("   Link do painel:", link);
  console.log("   Login (admin):", TEAM.dono.email, "· senha:", DEMO_PASSWORD);
  console.log("   Atendentes:", TEAM.marcos.email + ",", TEAM.aline.email, "(mesma senha)");
  console.log("   Remover depois:  npm run db:seed:demo:jr -- --clean\n");
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); await pool.end(); process.exit(1); });
