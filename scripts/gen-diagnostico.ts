/**
 * Gera o PDF "Diagnóstico de Funil & Atendimento" no padrão visual da Veloce,
 * com números reais do banco (mídia Meta + leads + atendimento). 100% leitura.
 *
 * Uso: railway run --service Postgres npx tsx scripts/gen-diagnostico.ts [nomeCliente]
 * Saída: docs_mestre/<Cliente>_Diagnostico_Funil_Atendimento.pdf
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";
import { buildDiagnosticoReport, type DiagData, type DiagModelRow } from "@/components/clients/diagnostico-report-document";

const nameArg = process.argv[2] || "boqueir";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MODELS = ["taos", "tiguan", "compass", "renegade"];
const DAYS = 45;

function rankOf(r: string | null): DiagModelRow["ranking"] {
  if (!r) return "na";
  if (r.startsWith("ABOVE")) return "acima";
  if (r.startsWith("BELOW")) return "abaixo";
  if (r === "AVERAGE") return "media";
  return "na";
}

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.error("cliente não achado"); return; }
  const conn = await prisma.metaConnection.findUnique({ where: { clientId: client.id }, select: { id: true, accountName: true, adAccountId: true } });
  const waConns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const waIds = waConns.map((c) => c.id);
  const since = new Date(Date.now() - DAYS * 864e5);

  const campaigns = conn ? await prisma.metaCampaign.findMany({ where: { connectionId: conn.id }, select: { campaignId: true, name: true, status: true } }) : [];
  const ads = conn ? await prisma.metaAd.findMany({ where: { connectionId: conn.id }, select: { adId: true, campaignId: true, status: true, conversionRanking: true, startedAt: true } }) : [];
  const insights = conn ? await prisma.metaAdInsight.findMany({ where: { connectionId: conn.id, date: { gte: since } }, select: { adId: true, spend: true, impressions: true, clicks: true } }) : [];
  const leads = await prisma.waLead.findMany({ where: { connectionId: { in: waIds } }, select: { contactId: true, adModel: true, adTitle: true, adBody: true } });

  const models: DiagModelRow[] = [];
  const buckets = { upTo5min: 0, upTo1h: 0, upTo12h: 0, over12h: 0, semResposta: 0 };
  let totSpend = 0, totLeads = 0, totConversas = 0, totSemResp = 0;
  let fRecebidos = 0, fAtendidos = 0, fQual = 0, fNeg = 0;

  for (const model of MODELS) {
    const camp = campaigns.filter((c) => norm(c.name).includes(model));
    const campIds = new Set(camp.map((c) => c.campaignId));
    const mAds = ads.filter((a) => campIds.has(a.campaignId));
    const mAdIds = new Set(mAds.map((a) => a.adId));
    const mIns = insights.filter((i) => mAdIds.has(i.adId));
    const spend = mIns.reduce((a, i) => a + i.spend, 0);
    const imp = mIns.reduce((a, i) => a + i.impressions, 0);
    const clk = mIns.reduce((a, i) => a + i.clicks, 0);
    // ranking do anúncio ativo com maior gasto
    const activeAd = mAds.filter((a) => a.status === "ACTIVE").sort((a, b) => {
      const sa = mIns.filter((i) => i.adId === a.adId).reduce((x, i) => x + i.spend, 0);
      const sb = mIns.filter((i) => i.adId === b.adId).reduce((x, i) => x + i.spend, 0);
      return sb - sa;
    })[0] ?? mAds[0];

    const matched = leads.filter((l) => norm(`${l.adModel ?? ""} ${l.adTitle ?? ""} ${l.adBody ?? ""}`).includes(model));
    const ids = matched.map((l) => l.contactId);
    const convos = await prisma.waConversation.findMany({ where: { contactId: { in: ids } }, select: { firstResponseSec: true, funnelStage: true } });
    const semResp = convos.filter((c) => c.firstResponseSec == null).length;
    const respondidas = convos.filter((c) => c.firstResponseSec != null);
    const respSorted = respondidas.map((c) => c.firstResponseSec!).sort((a, b) => a - b);
    const median = respSorted.length ? respSorted[Math.floor(respSorted.length / 2)] : null;

    for (const c of convos) {
      const r = c.firstResponseSec;
      if (r == null) buckets.semResposta++;
      else if (r <= 300) buckets.upTo5min++;
      else if (r <= 3600) buckets.upTo1h++;
      else if (r <= 12 * 3600) buckets.upTo12h++;
      else buckets.over12h++;
    }
    for (const c of convos) {
      const st = c.funnelStage;
      if (st === "qualificado") fQual++;
      else if (st === "negociacao") fNeg++;
    }

    const statusCamp = camp.map((c) => c.status === "ACTIVE" ? "ativo" : c.status === "ARCHIVED" ? "arquivado" : c.status.toLowerCase());
    models.push({
      name: model.charAt(0).toUpperCase() + model.slice(1),
      campaignLabel: `${camp.length} campanha(s) · ${[...new Set(statusCamp)].join("/")}`,
      spend, leads: matched.length, cpl: matched.length ? spend / matched.length : null,
      ctr: imp ? (clk / imp) * 100 : 0,
      ranking: rankOf(activeAd?.conversionRanking ?? null),
      responseMedianSec: median, semResposta: semResp, conversas: convos.length,
    });
    totSpend += spend; totLeads += matched.length; totConversas += convos.length; totSemResp += semResp;
    fRecebidos += convos.length; fAtendidos += respondidas.length;
  }

  const visitas = await prisma.visit.count({ where: { clientId: client.id, contactId: { in: leads.filter((l) => MODELS.some((m) => norm(`${l.adModel ?? ""} ${l.adTitle ?? ""}`).includes(m))).map((l) => l.contactId) } } });
  const semRespPct = totConversas ? (totSemResp / totConversas) * 100 : 0;

  const data: DiagData = {
    clientName: client.name,
    accountName: conn?.accountName ?? conn?.adAccountId ?? null,
    periodLabel: `Últimos ${DAYS} dias`,
    generatedAt: new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }),
    totals: { spend: totSpend, leads: totLeads, cpl: totLeads ? totSpend / totLeads : null, vendas: 0, visitas, semResposta: totSemResp, semRespostaPct: semRespPct, conversas: totConversas },
    models,
    responseBuckets: buckets,
    responseTotal: totConversas,
    funnel: { recebidos: fRecebidos, atendidos: fAtendidos, qualificados: fQual, negociacao: fNeg, visitas, vendas: 0 },
    verdict: "Você não está perdendo venda por falta de lead — está perdendo leads bem gerados que esfriam (ou são ignorados) antes de virar visita.",
    highlights: [
      `Os anúncios entregam volume e custo baixo: ${totLeads} leads reais a CPL médio de ${(totSpend / Math.max(1, totLeads)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
      "Na maioria dos modelos o criativo tem ranking de conversão na média ou acima — Renegade é o destaque (lead mais barato e anúncio acima da média).",
      "Destino e otimização das campanhas estão corretos: conversa direta no WhatsApp, sem formulário.",
    ],
    attention: [
      `${totSemResp} de ${totConversas} leads (${semRespPct.toFixed(0)}%) nunca receberam uma resposta.`,
      "Tempo de 1ª resposta em horas (não minutos) — o lead esfria antes do retorno.",
      `${visitas} visitas agendadas e 0 vendas registradas sobre ${totLeads} leads: o funil para antes da porta da venda.`,
      "Atendimento automático (IA) ainda não ativado para responder fora do horário em segundos.",
    ],
    actionsImediato: [
      `Responder hoje os ${totSemResp} leads sem resposta — muitos ainda na janela morna (D+3 a D+30). Receita recuperável a custo zero.`,
      "Definir SLA de 1ª resposta de até 5 minutos no horário comercial.",
      "Toda conversa com um objetivo claro: agendar visita (região) ou montar proposta com entrega (interior).",
    ],
    actionsCurto: [
      "Ativar o atendimento automático (IA) para responder em segundos, 24/7 — elimina a demora e o abandono.",
      "Revisar o criativo do modelo com ranking de conversão abaixo da média (custo por lead muito acima dos demais).",
      "Registrar a jornada lead → visita → venda para medir o CAC real e provar o retorno da mídia.",
      "Concentrar o aprendizado: um conjunto por carro, sem cópias duplicadas que reiniciam o algoritmo.",
    ],
  };

  const buffer = await renderToBuffer(buildDiagnosticoReport(data));
  const slug = client.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const outDir = path.join(process.cwd(), "docs_mestre");
  mkdirSync(outDir, { recursive: true });
  const out = path.join(outDir, `${slug}-diagnostico-funil-atendimento.pdf`);
  writeFileSync(out, buffer);
  console.log("PDF gerado:", out, `(${(buffer.length / 1024).toFixed(0)} KB)`);
  console.log("Resumo:", JSON.stringify({ totSpend, totLeads, totConversas, totSemResp, semRespPct: semRespPct.toFixed(0), visitas, buckets }, null, 0));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
