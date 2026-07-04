/**
 * Cliente de DEMONSTRAÇÃO (imobiliária) com dados mockados em todas as abas.
 * Idempotente: re-rodar limpa e recria. Uso: npm run db:seed:demo
 */
import "dotenv/config";
import { PrismaClient, TaskStatus, TaskPriority } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as never);
const SLUG = "demo-imobiliaria-vista";
const PORTAL_TOKEN = "demo-imobiliaria";

const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const DAY = 86_400_000;
const daysSoFar = Math.max(1, Math.floor((now.getTime() - monthStart.getTime()) / DAY) + 1);
const dAgo = (n: number) => new Date(now.getTime() - n * DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  // ── 1. Cliente (upsert por slug) ──
  const profile = {
    name: "★ DEMONSTRAÇÃO — Imobiliária Vista",
    brand: "Imobiliária Vista",
    slug: SLUG,
    status: "ACTIVE" as const,
    modules: ["reunioes", "leads", "anuncios", "google", "inteligencia", "ia", "bot"],
    niche: "Imobiliário",
    mainGoal: "Gerar leads qualificados de compra e locação no WhatsApp",
    operationType: "Social + Tráfego (Meta + Google)",
    primaryContact: "Equipe Vista",
    email: "contato@imobiliariavista.com.br",
    phone: "(11) 90000-0000",
    city: "São Paulo, SP",
    instagram: "@imobiliariavista",
    website: "https://imobiliariavista.com.br",
    communicationTone: "Próximo, consultivo e ágil",
  };
  const client = await prisma.client.upsert({ where: { slug: SLUG }, update: profile, create: profile });
  const clientId = client.id;
  console.log("Cliente:", clientId);

  // ── 2. Limpa filhos (idempotência) ──
  await prisma.task.deleteMany({ where: { clientId } });
  await prisma.fixedDemand.deleteMany({ where: { clientId } });
  await prisma.meeting.deleteMany({ where: { clientId } });
  await prisma.winningCreative.deleteMany({ where: { clientId } });
  await prisma.competitor.deleteMany({ where: { clientId } });
  await prisma.metaConnection.deleteMany({ where: { clientId } });
  await prisma.googleConnection.deleteMany({ where: { clientId } });
  await prisma.waConnection.deleteMany({ where: { clientId } });
  await prisma.clientPortal.deleteMany({ where: { clientId } });
  await prisma.clientBot.deleteMany({ where: { clientId } });
  await prisma.aiAgentConfig.deleteMany({ where: { clientId } });

  // ── 3. Operação (kanban) ──
  const mY = now.getFullYear(), mM = now.getMonth() + 1;
  const tasks: { title: string; type: string; status: TaskStatus; pr?: TaskPriority; due: number }[] = [
    { title: "Reels — Tour Apartamento 2Q Zona Sul", type: "Reels", status: "DONE", due: 5 },
    { title: "Post — Lançamento Jardins (carrossel)", type: "Post Feed", status: "DONE", due: 7 },
    { title: "Subir Campanha — Lançamento Jardins", type: "meta ADS", status: "DONE", due: 9 },
    { title: "Captação de fotos — Studio Vila Mariana", type: "Captação", status: "IN_PROGRESS", pr: "HIGH", due: -2 },
    { title: "Reunião Mensal — apresentação de resultados", type: "Outro", status: "IN_PROGRESS", due: -1 },
    { title: "Post Dica — Como financiar o 1º imóvel", type: "Post Feed", status: "TODO", due: -4 },
    { title: "Reels — Depoimento de cliente (prova social)", type: "Reels", status: "TODO", due: -6 },
    { title: "Ajustar segmentação — Campanha 2Q", type: "meta ADS", status: "REVIEW", due: -3 },
  ];
  let order = 0;
  for (const t of tasks) {
    await prisma.task.create({ data: { clientId, title: t.title, type: t.type, status: t.status, priority: t.pr ?? "NORMAL", dueDate: dAgo(t.due), planMonth: mM, planYear: mY, order: order++ } });
  }
  for (const fd of [
    { title: "Reels — escolha um (semanal)", type: "Reels" },
    { title: "Post Dica Imobiliária (3x/semana)", type: "Post Feed" },
    { title: "Relatório mensal de mídia", type: "Relatório" },
  ]) {
    await prisma.fixedDemand.create({ data: { clientId, title: fd.title, type: fd.type } });
  }

  // ── 4. Reuniões ──
  for (const mt of [
    { title: "Reunião Mensal — Resultados", daysAgo: 2, summary: "Apresentação dos resultados do mês: leads em alta, foco em qualificação. Aprovado aumento de verba na campanha 2Q.", decisions: ["Aumentar verba da campanha 2Q em 20%", "Priorizar criativos em vídeo (tour)"], nextSteps: ["Subir 2 novos criativos de vídeo", "Revisar tempo de resposta no WhatsApp"] },
    { title: "Kickoff — Lançamento Jardins", daysAgo: 18, summary: "Planejamento do lançamento Jardins: criativos de planta, landing e campanha dedicada.", decisions: ["Campanha dedicada ao lançamento"], nextSteps: ["Produzir criativos da planta"] },
  ]) {
    await prisma.meeting.create({ data: { clientId, title: mt.title, date: dAgo(mt.daysAgo), summary: mt.summary, decisions: mt.decisions, nextSteps: mt.nextSteps, participants: ["Equipe Vista", "Veloce"] } });
  }

  // ── 5. Inteligência (concorrentes + criativos vencedores) ──
  const comps = [
    { name: "Lopes", tier: "serio" },
    { name: "Loft", tier: "serio" },
    { name: "Imobiliária Central", tier: "medio" },
  ];
  for (const c of comps) {
    const comp = await prisma.competitor.create({ data: { clientId, name: c.name, tier: c.tier } });
    await prisma.winningCreative.create({ data: { clientId, competitorId: comp.id, format: "video", angle: "prova_social", offer: "Tour 360º + condições especiais", adName: `${c.name} — Tour do apto`, note: "No ar há semanas — alta longevidade", liveSince: dAgo(40) } });
  }
  await prisma.winningCreative.create({ data: { clientId, format: "carrossel", angle: "preco", offer: "Entrada facilitada — Minha Casa Minha Vida", adName: "Vista — Entrada facilitada", note: "Melhor CPL próprio", liveSince: dAgo(12) } });

  // ── 6. Anúncios (Meta) ──
  const metaConn = await prisma.metaConnection.create({ data: { clientId, adAccountId: "act_demo_vista", accessToken: "demo", accountName: "Imobiliária Vista", currency: "BRL" } });
  const metaCampaigns = [
    { campaignId: "mc_2q", name: "Apartamentos 2Q · Zona Sul" },
    { campaignId: "mc_lanc", name: "Lançamento Jardins" },
    { campaignId: "mc_studio", name: "Locação · Studios" },
  ];
  for (const c of metaCampaigns) {
    await prisma.metaCampaign.create({ data: { connectionId: metaConn.id, campaignId: c.campaignId, name: c.name, objective: "OUTCOME_LEADS", status: "ACTIVE", startedAt: dAgo(45), dailyBudget: 50 } });
    await prisma.metaAdSet.create({ data: { connectionId: metaConn.id, adsetId: `as_${c.campaignId}`, campaignId: c.campaignId, name: `${c.name} — Conjunto`, status: "ACTIVE", destinationType: "WHATSAPP", learningStage: "SUCCESS" } });
  }
  const metaAds = [
    { adId: "ad_2q_1", campaignId: "mc_2q", name: "2Q Zona Sul · Vídeo tour", creativeId: "cr_2q_1", dailySpend: 38, leads: 3, img: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1080&q=80" },
    { adId: "ad_2q_2", campaignId: "mc_2q", name: "2Q Zona Sul · Carrossel", creativeId: "cr_2q_2", dailySpend: 22, leads: 1, img: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1080&q=80" },
    { adId: "ad_lanc_1", campaignId: "mc_lanc", name: "Lançamento Jardins · Planta", creativeId: "cr_lanc_1", dailySpend: 30, leads: 2, img: "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1080&q=80" },
    { adId: "ad_studio_1", campaignId: "mc_studio", name: "Studios · Locação", creativeId: "cr_studio_1", dailySpend: 18, leads: 1, img: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1080&q=80" },
  ];
  for (const a of metaAds) {
    await prisma.metaCreative.create({ data: { connectionId: metaConn.id, creativeId: a.creativeId, title: a.name, body: "Agende sua visita pelo WhatsApp", thumbnailUrl: a.img, imageUrl: a.img } });
    await prisma.metaAd.create({ data: { connectionId: metaConn.id, adId: a.adId, adsetId: `as_${a.campaignId}`, campaignId: a.campaignId, creativeId: a.creativeId, name: a.name, status: "ACTIVE", startedAt: dAgo(40), qualityRanking: "ABOVE_AVERAGE" } });
    for (let d = 0; d < daysSoFar; d++) {
      const imp = 900 + Math.round(Math.random() * 600);
      const clk = Math.round(imp * 0.03);
      await prisma.metaAdInsight.create({ data: { connectionId: metaConn.id, adId: a.adId, date: dAgo(daysSoFar - 1 - d), spend: a.dailySpend, impressions: imp, reach: Math.round(imp * 0.8), clicks: clk, ctr: 3, cpc: a.dailySpend / Math.max(1, clk), cpm: (a.dailySpend / imp) * 1000, frequency: 1.2, leads: 0 } });
    }
  }

  // ── 7. Google Ads (superpoderes) ──
  const gConn = await prisma.googleConnection.create({ data: { clientId, customerId: "1234567890", accountName: "Imobiliária Vista", currency: "BRL", lastSyncAt: now, refreshToken: "demo" } });
  for (const c of [
    { campaignId: "gc_pesq_apto", name: "Pesquisa · Apartamentos", spend: 1980, impressions: 72000, clicks: 2100, conversions: 41, is: 0.6, lb: 0.3, lr: 0.1 },
    { campaignId: "gc_lanc", name: "Pesquisa · Lançamento Jardins", spend: 1240, impressions: 41000, clicks: 1180, conversions: 23, is: 0.68, lb: 0.22, lr: 0.1 },
    { campaignId: "gc_pmax", name: "PMax · Locação", spend: 760, impressions: 33000, clicks: 690, conversions: 11, is: 0.72, lb: 0.18, lr: 0.1 },
  ]) {
    await prisma.googleCampaign.create({ data: { connectionId: gConn.id, campaignId: c.campaignId, name: c.name, status: "ENABLED", spend: c.spend, impressions: c.impressions, clicks: c.clicks, conversions: c.conversions, impressionShare: c.is, lostBudget: c.lb, lostRank: c.lr } });
  }
  for (const s of [
    { term: "apartamento 2 quartos zona sul", spend: 280.4, clicks: 190, conversions: 9 },
    { term: "apartamento à venda jardins", spend: 240.1, clicks: 160, conversions: 7 },
    { term: "studio para alugar vila mariana", spend: 190.0, clicks: 130, conversions: 5 },
    { term: "minha casa minha vida apartamento", spend: 170.5, clicks: 120, conversions: 4 },
    { term: "apartamento na planta sp", spend: 150.0, clicks: 100, conversions: 3 },
    { term: "imobiliária perto de mim", spend: 120.0, clicks: 85, conversions: 0 },
    { term: "quanto custa um apartamento", spend: 90.0, clicks: 70, conversions: 0 },
    { term: "financiamento imobiliário caixa", spend: 110.0, clicks: 80, conversions: 2 },
  ]) {
    await prisma.googleSearchTerm.create({ data: { connectionId: gConn.id, term: s.term, spend: s.spend, clicks: s.clicks, conversions: s.conversions } });
  }
  for (const k of [
    { keyword: "apartamento 2 quartos", matchType: "BROAD", qualityScore: 8, spend: 460, clicks: 300, conversions: 13 },
    { keyword: "apartamento à venda", matchType: "PHRASE", qualityScore: 9, spend: 410, clicks: 260, conversions: 11 },
    { keyword: "lançamento jardins", matchType: "EXACT", qualityScore: 8, spend: 320, clicks: 190, conversions: 8 },
    { keyword: "studio para alugar", matchType: "BROAD", qualityScore: 6, spend: 260, clicks: 170, conversions: 5 },
    { keyword: "financiamento imobiliário", matchType: "PHRASE", qualityScore: 5, spend: 150, clicks: 110, conversions: 2 },
  ]) {
    await prisma.googleKeyword.create({ data: { connectionId: gConn.id, keyword: k.keyword, matchType: k.matchType, qualityScore: k.qualityScore, spend: k.spend, clicks: k.clicks, conversions: k.conversions } });
  }
  // 60 dias de histórico (metade recente com mais conversões → delta real positivo)
  const GDAYS = 60;
  for (let d = 0; d < GDAYS; d++) {
    const recent = d >= GDAYS / 2;
    const conv = (recent ? 2 : 1) + Math.round(Math.random() * (recent ? 4 : 3));
    await prisma.googleInsight.create({ data: { connectionId: gConn.id, date: dAgo(GDAYS - 1 - d), spend: 120 + Math.round(Math.random() * 60), impressions: (recent ? 4500 : 4000) + Math.round(Math.random() * 1500), clicks: (recent ? 120 : 105) + Math.round(Math.random() * 40), conversions: conv } });
  }
  // Auditoria: histórico de mudanças + diagnóstico
  const hAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  for (const ev of [
    { rn: "gce_1", h: 5, who: "veloce@agencia.com", rt: "CAMPAIGN_BUDGET", op: "UPDATE", s: "Orçamento da campanha Apartamentos: R$60 → R$80/dia" },
    { rn: "gce_2", h: 28, who: "veloce@agencia.com", rt: "AD_GROUP_CRITERION", op: "REMOVE", s: 'Palavra-chave pausada: "imobiliária perto de mim"' },
    { rn: "gce_3", h: 52, who: "veloce@agencia.com", rt: "AD_GROUP_AD", op: "CREATE", s: "Novo anúncio responsivo · Lançamento Jardins" },
    { rn: "gce_4", h: 80, who: "veloce@agencia.com", rt: "CAMPAIGN", op: "UPDATE", s: "Estratégia de lance → Maximizar conversões" },
  ]) {
    await prisma.googleChangeEvent.create({ data: { connectionId: gConn.id, resourceName: ev.rn, changedAt: hAgo(ev.h), userEmail: ev.who, resourceType: ev.rt, operation: ev.op, summary: ev.s } });
  }
  for (const dg of [
    { kind: "conversion_tracking", severity: "ok", title: "Rastreamento de conversão ativo", detail: "Ação de conversão 'Lead WhatsApp' registrando." },
    { kind: "budget_limited", severity: "warn", title: "1 campanha limitada por orçamento", detail: "Pesquisa · Apartamentos perde impressões por verba." },
    { kind: "recommendation", severity: "info", title: "3 recomendações do Google", detail: "Palavras-chave e lances sugeridos." },
  ]) {
    await prisma.googleDiagnostic.create({ data: { connectionId: gConn.id, kind: dg.kind, severity: dg.severity, title: dg.title, detail: dg.detail } });
  }

  // ── 8. WhatsApp (conversas + leads) ──
  const wa = await prisma.waConnection.create({ data: { clientId, wabaId: "demo_waba_vista", phoneNumberId: "demo_phone_vista", displayPhone: "+55 11 90000-0000", accessToken: "demo", name: "Imobiliária Vista" } });
  type Lead = { name: string; waId: string; daysAgo: number; respMin: number | null; stage: string; status: string; adId?: string; msgs: [string, string][] };
  const leads: Lead[] = [
    { name: "Marina Souza", waId: "5511990000001", daysAgo: 1, respMin: 3, stage: "negociacao", status: "waiting", adId: "ad_2q_1", msgs: [["in", "Oi! Vi o anúncio do apê de 2 quartos na zona sul, ainda tem?"], ["out", "Oi Marina! Tem sim 😊 Quer agendar uma visita?"], ["in", "Quero! Pode ser sábado?"]] },
    { name: "Carlos Oliveira", waId: "5511990000002", daysAgo: 1, respMin: null, stage: "recebido", status: "waiting", adId: "ad_lanc_1", msgs: [["in", "Boa tarde, queria saber o valor do lançamento Jardins"]] },
    { name: "Patrícia Lima", waId: "5511990000003", daysAgo: 2, respMin: 8, stage: "qualificado", status: "waiting", adId: "ad_2q_1", msgs: [["in", "O apê de 2Q aceita financiamento?"], ["out", "Aceita sim! Trabalhamos com Minha Casa Minha Vida também."]] },
    { name: "Rafael Mendes", waId: "5511990000004", daysAgo: 2, respMin: 5, stage: "convertido", status: "closed", adId: "ad_2q_2", msgs: [["in", "Fechei a visita, gostei muito do apartamento!"], ["out", "Que ótimo, Rafael! 🎉"]] },
    { name: "Juliana Castro", waId: "5511990000005", daysAgo: 3, respMin: 12, stage: "qualificado", status: "open", msgs: [["in", "Vocês têm studios para alugar na Vila Mariana?"], ["out", "Temos! Posso te mandar as opções?"]] },
    { name: "Bruno Almeida", waId: "5511990000006", daysAgo: 4, respMin: null, stage: "recebido", status: "waiting", adId: "ad_studio_1", msgs: [["in", "Oi, vi o studio pra locação, qual o valor?"]] },
    { name: "Fernanda Rocha", waId: "5511990000007", daysAgo: 5, respMin: 6, stage: "negociacao", status: "waiting", adId: "ad_2q_1", msgs: [["in", "Gostei do apê! Dá pra negociar a entrada?"], ["out", "Vamos conversar sim, Fernanda 😊"]] },
    { name: "Diego Santos", waId: "5511990000008", daysAgo: 7, respMin: 9, stage: "qualificado", status: "open", msgs: [["in", "Tem apartamento na planta?"], ["out", "Tem! O lançamento Jardins está na planta."]] },
    { name: "Camila Ferreira", waId: "5511990000009", daysAgo: 9, respMin: 4, stage: "convertido", status: "closed", adId: "ad_lanc_1", msgs: [["in", "Quero reservar uma unidade do lançamento!"], ["out", "Perfeito, Camila! Vou te passar os próximos passos."]] },
    { name: "Lucas Pereira", waId: "5511990000010", daysAgo: 11, respMin: 15, stage: "respondido", status: "open", msgs: [["in", "Qual o valor do condomínio?"], ["out", "Te respondo já com os detalhes."]] },
    { name: "Aline Costa", waId: "5511990000011", daysAgo: 14, respMin: 7, stage: "respondido", status: "open", msgs: [["in", "Vocês atendem a região de Pinheiros?"], ["out", "Atendemos sim!"]] },
    { name: "Thiago Nunes", waId: "5511990000012", daysAgo: 18, respMin: 10, stage: "perdido", status: "closed", msgs: [["in", "Achei caro, vou pensar"], ["out", "Sem problema! Qualquer coisa estou à disposição."]] },
    { name: "Renata Dias", waId: "5511990000013", daysAgo: 22, respMin: 5, stage: "respondido", status: "open", msgs: [["in", "Tem apê de 3 quartos?"], ["out", "Temos algumas opções, posso enviar."]] },
    { name: "Gustavo Reis", waId: "5511990000014", daysAgo: 26, respMin: 6, stage: "qualificado", status: "open", msgs: [["in", "Quero agendar uma visita ao apartamento decorado"], ["out", "Vamos agendar! Qual o melhor dia?"]] },
  ];

  let mi = 0;
  for (const l of leads) {
    const firstInbound = dAgo(Math.min(l.daysAgo, daysSoFar - 1));
    const contact = await prisma.waContact.create({ data: { connectionId: wa.id, waId: l.waId, name: l.name, lastMessageAt: firstInbound } });
    let inCount = 0, outCount = 0; let lastIn = firstInbound, lastOut: Date | null = null;
    for (let j = 0; j < l.msgs.length; j++) {
      const [dir, text] = l.msgs[j];
      const ts = new Date(firstInbound.getTime() + j * 5 * 60 * 1000);
      await prisma.waMessage.create({ data: { connectionId: wa.id, contactId: contact.id, waMessageId: `demo_msg_${mi++}`, direction: dir, type: "text", text, timestamp: ts } });
      if (dir === "in") { inCount++; lastIn = ts; } else { outCount++; lastOut = ts; }
    }
    const evid = ["qualificado", "negociacao", "convertido", "perdido"].includes(l.stage) ? l.msgs.find(([d]) => d === "in")?.[1]?.slice(0, 160) ?? null : null;
    await prisma.waConversation.create({ data: {
      connectionId: wa.id, contactId: contact.id, status: l.status, funnelStage: l.stage, funnelManual: l.stage === "convertido", funnelEvidence: evid,
      firstInboundAt: firstInbound, firstResponseSec: l.respMin != null ? l.respMin * 60 : null,
      firstResponseAt: l.respMin != null ? new Date(firstInbound.getTime() + l.respMin * 60000) : null,
      lastInboundAt: lastIn, lastOutboundAt: lastOut, lastMessageAt: lastOut ?? lastIn,
      inboundCount: inCount, outboundCount: outCount, openedAt: firstInbound,
    } });
    if (l.adId) {
      await prisma.waLead.create({ data: { connectionId: wa.id, contactId: contact.id, waId: l.waId, name: l.name, adId: l.adId, adTitle: metaAds.find((a) => a.adId === l.adId)?.name, adBody: "Agende sua visita pelo WhatsApp 🏡", adImageUrl: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=400&q=60", sourceUrl: "https://facebook.com", sourceType: "ad", enteredAt: firstInbound } });
    }
  }

  // ── 9. Portal + BOT + IA ──
  await prisma.clientPortal.create({ data: { clientId, token: PORTAL_TOKEN, accentColor: "#1E66F5", mode: "light", active: true } });
  await prisma.clientBot.create({ data: { clientId, active: true, brandName: "Imobiliária Vista" } });
  await prisma.aiAgentConfig.create({ data: { clientId, enabled: true, status: "test", vertical: "imobiliario", assistantName: "Helena", greetingMessage: "Olá! Sou a Helena, assistente da Imobiliária Vista 🏡 Como posso ajudar?", persona: "Consultiva, próxima e ágil", goals: "Qualificar o lead e agendar visita" } });

  console.log("✅ Demo populado. Portal: /r/" + PORTAL_TOKEN);
}

main()
  .then(async () => { await prisma.$disconnect(); await pool.end(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); await pool.end(); process.exit(1); });
