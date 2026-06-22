/**
 * Análise COMPLETA por modelo de anúncio (Taos, Tiguan, Compass, Renegade):
 * cruza MÍDIA (tabelas Meta sincronizadas: MetaCampaign/AdSet/Ad/AdInsight) com
 * LEADS + ATENDIMENTO (WaLead/WaConversation/LeadProfile/LeadObjection/Visit).
 * Tudo do banco — não depende do Windsor. 100% leitura.
 *
 * Uso: railway run --service Postgres npx tsx scripts/meta-full-analysis.ts [nomeCliente] [--days 45]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const raw = process.argv.slice(2);
let nameArg = "boqueir", days = 45;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === "--days") days = Number(raw[++i]);
  else if (a.startsWith("--days=")) days = Number(a.split("=")[1]);
  else if (!a.startsWith("--")) nameArg = a;
}
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(0)}%` : "—");
const fmt = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}min` : `${(sec / 3600).toFixed(1)}h`);
const brl = (n: number) => `R$${n.toFixed(2)}`;
const MODELS = ["taos", "tiguan", "compass", "renegade"];

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`Cliente "${nameArg}" não encontrado`); return; }
  const conn = await prisma.metaConnection.findUnique({ where: { clientId: client.id }, select: { id: true, currency: true, lastAdSyncAt: true } });
  const waConns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const waIds = waConns.map((c) => c.id);
  const since = new Date(Date.now() - days * 864e5);

  console.log(`═══════ ${client.name} — MÍDIA × LEADS × ATENDIMENTO (últimos ${days}d) ═══════`);
  console.log(`Meta connection: ${conn ? `ok (sync ${conn.lastAdSyncAt?.toISOString().slice(0, 16) ?? "?"})` : "AUSENTE — sem dados de mídia no banco"}`);

  // Estrutura Meta (se houver connection).
  const campaigns = conn ? await prisma.metaCampaign.findMany({ where: { connectionId: conn.id }, select: { campaignId: true, name: true, objective: true, status: true, startedAt: true, dailyBudget: true, lifetimeBudget: true } }) : [];
  const adsets = conn ? await prisma.metaAdSet.findMany({ where: { connectionId: conn.id }, select: { adsetId: true, campaignId: true, name: true, status: true, destinationType: true, learningStage: true, dailyBudget: true } }) : [];
  const ads = conn ? await prisma.metaAd.findMany({ where: { connectionId: conn.id }, select: { adId: true, campaignId: true, name: true, status: true, qualityRanking: true, engagementRanking: true, conversionRanking: true, startedAt: true } }) : [];
  const insights = conn ? await prisma.metaAdInsight.findMany({ where: { connectionId: conn.id, date: { gte: since } }, select: { adId: true, spend: true, impressions: true, reach: true, clicks: true, ctr: true, cpm: true, frequency: true, leads: true } }) : [];
  const insByAd = new Map<string, typeof insights>();
  for (const i of insights) { (insByAd.get(i.adId) ?? insByAd.set(i.adId, []).get(i.adId)!).push(i); }

  // Leads de anúncio.
  const leads = await prisma.waLead.findMany({ where: { connectionId: { in: waIds } }, select: { contactId: true, adId: true, adModel: true, adTitle: true, adBody: true, enteredAt: true } });

  for (const model of MODELS) {
    console.log(`\n\n████ ${model.toUpperCase()} ████`);

    // ── MÍDIA ──
    const camp = campaigns.filter((c) => norm(c.name).includes(model));
    const campIds = new Set(camp.map((c) => c.campaignId));
    const mAds = ads.filter((a) => campIds.has(a.campaignId));
    const mAdIds = new Set(mAds.map((a) => a.adId));
    const mAdsets = adsets.filter((s) => campIds.has(s.campaignId));
    const mIns = insights.filter((i) => mAdIds.has(i.adId));
    const sum = (k: "spend" | "impressions" | "reach" | "clicks" | "leads") => mIns.reduce((a, i) => a + (i[k] as number), 0);
    const spend = sum("spend"), imp = sum("impressions"), reach = sum("reach"), clicks = sum("clicks"), metaLeads = sum("leads");
    const ctr = imp ? (clicks / imp) * 100 : 0, cpm = imp ? (spend / imp) * 1000 : 0, freq = reach ? imp / reach : 0;

    if (!camp.length) { console.log("  [mídia] nenhuma campanha Meta com esse nome no banco"); }
    else {
      console.log(`  [mídia] campanhas: ${camp.map((c) => `${c.name} (${c.status}, obj ${c.objective ?? "?"}, início ${c.startedAt?.toISOString().slice(0, 10) ?? "?"})`).join(" | ")}`);
      console.log(`  [mídia] conjuntos: ${mAdsets.map((s) => `${s.name}[${s.status}] dest=${s.destinationType ?? "?"} learn=${s.learningStage ?? "?"} budget/dia=${s.dailyBudget ?? "-"}`).join(" | ") || "—"}`);
      console.log(`  [mídia] gasto ${brl(spend)} · impr ${imp} · reach ${reach} · freq ${freq.toFixed(2)} · clicks ${clicks} · CTR ${ctr.toFixed(2)}% · CPM ${brl(cpm)} · leads(Meta) ${metaLeads}`);
      // por anúncio
      for (const a of mAds) {
        const ai = insByAd.get(a.adId) ?? [];
        const sp = ai.reduce((x, i) => x + i.spend, 0);
        if (sp < 1) continue;
        const im = ai.reduce((x, i) => x + i.impressions, 0);
        const cl = ai.reduce((x, i) => x + i.clicks, 0);
        const ld = ai.reduce((x, i) => x + i.leads, 0);
        console.log(`    · ${a.name} [${a.status}] gasto ${brl(sp)} CTR ${(im ? (cl / im) * 100 : 0).toFixed(2)}% leads ${ld} | rank qual=${a.qualityRanking ?? "?"} eng=${a.engagementRanking ?? "?"} conv=${a.conversionRanking ?? "?"}`);
      }
    }

    // ── LEADS + ATENDIMENTO ──
    const matched = leads.filter((l) => norm(`${l.adModel ?? ""} ${l.adTitle ?? ""} ${l.adBody ?? ""}`).includes(model));
    const ids = matched.map((l) => l.contactId);
    const convos = await prisma.waConversation.findMany({ where: { contactId: { in: ids } }, select: { firstResponseSec: true, outboundCount: true, funnelStage: true } });
    const resp = convos.filter((c) => c.firstResponseSec != null).map((c) => c.firstResponseSec!).sort((a, b) => a - b);
    const med = resp.length ? resp[Math.floor(resp.length / 2)] : 0;
    const profiles = await prisma.leadProfile.findMany({ where: { contactId: { in: ids } }, select: { qualified: true, readyToBuy: true, visitIntent: true, budget: true, wantsFinancing: true, temperature: true } });
    const objs = await prisma.leadObjection.findMany({ where: { contactId: { in: ids } }, select: { type: true } });
    const visits = await prisma.visit.count({ where: { clientId: client.id, contactId: { in: ids } } });
    const stages: Record<string, number> = {};
    for (const c of convos) { const s = c.funnelStage ?? "(sem etapa)"; stages[s] = (stages[s] ?? 0) + 1; }
    const realCPL = matched.length && spend ? spend / matched.length : 0;

    console.log(`  [leads] ${matched.length} leads reais (WaLead) · CPL real ${realCPL ? brl(realCPL) : "—"} · conversas ${convos.length} · SEM resposta ${convos.filter((c) => c.firstResponseSec == null).length} · loja nunca respondeu ${convos.filter((c) => c.outboundCount === 0).length}`);
    if (resp.length) console.log(`  [atend] 1ª resposta — mediana ${fmt(med)} · ≤5min ${pct(resp.filter((s) => s <= 300).length, resp.length)} · >1h ${pct(resp.filter((s) => s > 3600).length, resp.length)} · >12h ${pct(resp.filter((s) => s > 12 * 3600).length, resp.length)}`);
    console.log(`  [qual] perfis ${profiles.length} · qualif ${pct(profiles.filter((p) => p.qualified).length, profiles.length)} · pronto-comprar ${pct(profiles.filter((p) => p.readyToBuy).length, profiles.length)} · intenção-visita ${pct(profiles.filter((p) => p.visitIntent).length, profiles.length)} · c/orçam ${pct(profiles.filter((p) => p.budget).length, profiles.length)} · financ ${pct(profiles.filter((p) => p.wantsFinancing).length, profiles.length)}`);
    console.log(`  [funil] visitas ${visits} · objeções ${objs.length} · etapas: ${Object.entries(stages).map(([k, v]) => `${k}=${v}`).join(" / ")}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
