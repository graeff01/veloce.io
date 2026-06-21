/**
 * Análise focada nos leads do anúncio do TAOS: onde estamos pecando.
 * Cruza atendimento (tempo de 1ª resposta, conversas sem resposta), qualidade do
 * lead (LeadProfile: score/temperatura/orçamento/financiamento/urgência/intenção
 * de visita/pronto p/ comprar), objeções (LeadObjection) e funil. 100% leitura.
 *
 * Uso:
 *   railway run --service Postgres npx tsx scripts/taos-analysis.ts [nomeCliente] [--model taos]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const raw = process.argv.slice(2);
let nameArg = "boqueir";
let modelArg = "taos";
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === "--model") modelArg = raw[++i];
  else if (a.startsWith("--model=")) modelArg = a.split("=")[1];
  else if (!a.startsWith("--")) nameArg = a;
}

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_PUBLIC_URL/DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(0)}%` : "0%");
const fmtMin = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}min` : `${(sec / 3600).toFixed(1)}h`);

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`Cliente "${nameArg}" não encontrado`); return; }
  const conns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  // Leads do anúncio do modelo alvo (Taos).
  const allLeads = await prisma.waLead.findMany({
    where: { connectionId: { in: connIds } },
    select: { contactId: true, adModel: true, adTitle: true, adBody: true, enteredAt: true, imported: true },
  });
  const m = norm(modelArg);
  const leads = allLeads.filter((l) => norm(`${l.adModel ?? ""} ${l.adTitle ?? ""} ${l.adBody ?? ""}`).includes(m));
  const contactIds = leads.map((l) => l.contactId);

  console.log(`\n═══════ ${client.name} — LEADS DO ANÚNCIO "${modelArg.toUpperCase()}" ═══════`);
  console.log(`Total de leads do anúncio (todos modelos): ${allLeads.length}  ·  do ${modelArg}: ${leads.length}`);
  if (!leads.length) { console.log("Nenhum lead do modelo encontrado."); return; }
  const datas = leads.map((l) => l.enteredAt).sort((a, b) => +a - +b);
  console.log(`Período: ${datas[0].toISOString().slice(0, 10)} → ${datas[datas.length - 1].toISOString().slice(0, 10)}  ·  importados (sem msg própria): ${leads.filter((l) => l.imported).length}`);

  // 1) ATENDIMENTO — gargalo de 1ª resposta.
  const convos = await prisma.waConversation.findMany({
    where: { contactId: { in: contactIds } },
    select: { contactId: true, firstResponseSec: true, firstInboundAt: true, firstResponseAt: true, funnelStage: true, status: true, inboundCount: true, outboundCount: true },
  });
  const responded = convos.filter((c) => c.firstResponseSec != null);
  const secs = responded.map((c) => c.firstResponseSec!).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
  const noResp = convos.filter((c) => c.firstResponseSec == null).length;
  const noConvo = contactIds.length - convos.length;
  console.log(`\n── ATENDIMENTO (gargalo) ──`);
  console.log(`  Conversas: ${convos.length}  ·  respondidas: ${responded.length}  ·  SEM resposta: ${noResp}  ·  sem conversa registrada: ${noConvo}`);
  if (secs.length) {
    console.log(`  1ª resposta — mediana: ${fmtMin(median)}  ·  > 1h: ${pct(secs.filter((s) => s > 3600).length, secs.length)}  ·  > 12h: ${pct(secs.filter((s) => s > 12 * 3600).length, secs.length)}  ·  ≤ 5min: ${pct(secs.filter((s) => s <= 300).length, secs.length)}`);
  }
  const onlyInbound = convos.filter((c) => c.outboundCount === 0).length;
  console.log(`  Conversas só com mensagem do lead (loja nunca respondeu): ${onlyInbound} (${pct(onlyInbound, convos.length)})`);

  // 2) QUALIDADE DO LEAD — LeadProfile.
  const profiles = await prisma.leadProfile.findMany({
    where: { contactId: { in: contactIds } },
    select: { score: true, temperature: true, budget: true, hasTradeIn: true, wantsFinancing: true, urgency: true, visitIntent: true, readyToBuy: true, qualified: true, productInterest: true, lastSentiment: true },
  });
  const temps: Record<string, number> = {};
  for (const p of profiles) { const t = p.temperature ?? "(sem classificação)"; temps[t] = (temps[t] ?? 0) + 1; }
  const has = (f: (p: typeof profiles[number]) => boolean) => profiles.filter(f).length;
  console.log(`\n── QUALIDADE DO LEAD (${profiles.length} perfis) ──`);
  console.log(`  Temperatura: ${Object.entries(temps).map(([k, v]) => `${k}=${v}`).join("  ·  ")}`);
  if (profiles.length) {
    const scores = profiles.map((p) => p.score).sort((a, b) => a - b);
    console.log(`  Score — mediana: ${scores[Math.floor(scores.length / 2)]}  ·  máx: ${scores[scores.length - 1]}`);
    console.log(`  Qualificados: ${pct(has((p) => p.qualified), profiles.length)}  ·  pronto p/ comprar: ${pct(has((p) => !!p.readyToBuy), profiles.length)}  ·  intenção de visita: ${pct(has((p) => !!p.visitIntent), profiles.length)}`);
    console.log(`  Tem orçamento informado: ${pct(has((p) => !!p.budget), profiles.length)}  ·  quer financiar: ${pct(has((p) => !!p.wantsFinancing), profiles.length)}  ·  tem troca: ${pct(has((p) => !!p.hasTradeIn), profiles.length)}  ·  com urgência: ${pct(has((p) => !!p.urgency), profiles.length)}`);
  }

  // 3) OBJEÇÕES.
  const objs = await prisma.leadObjection.findMany({ where: { contactId: { in: contactIds } }, select: { type: true, resolved: true } });
  const byType: Record<string, { total: number; resolved: number }> = {};
  for (const o of objs) { byType[o.type] ??= { total: 0, resolved: 0 }; byType[o.type].total++; if (o.resolved) byType[o.type].resolved++; }
  console.log(`\n── OBJEÇÕES (${objs.length} no total) ──`);
  for (const [k, v] of Object.entries(byType).sort((a, b) => b[1].total - a[1].total)) console.log(`  ${String(v.total).padStart(3)}  ${k}  (resolvidas: ${v.resolved})`);

  // 4) FUNIL.
  const stages: Record<string, number> = {};
  for (const c of convos) { const s = c.funnelStage ?? "(sem etapa)"; stages[s] = (stages[s] ?? 0) + 1; }
  console.log(`\n── FUNIL (etapa manual) ──`);
  for (const [k, v] of Object.entries(stages).sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(3)}  ${k}`);

  // 5) VISITAS agendadas.
  const visits = await prisma.visit.findMany({ where: { clientId: client.id, contactId: { in: contactIds } }, select: { status: true } });
  const vByStatus: Record<string, number> = {};
  for (const v of visits) vByStatus[v.status] = (vByStatus[v.status] ?? 0) + 1;
  console.log(`\n── VISITAS (${visits.length}) ──`);
  console.log("  " + (Object.entries(vByStatus).map(([k, v]) => `${k}=${v}`).join("  ·  ") || "nenhuma"));

  // 6) Amostra de aberturas (1ª msg do lead).
  const msgs = await prisma.waMessage.findMany({
    where: { contactId: { in: contactIds }, direction: "in", type: "text", text: { not: null } },
    select: { contactId: true, text: true }, orderBy: { timestamp: "asc" },
  });
  const first = new Map<string, string>();
  for (const mm of msgs) if (!first.has(mm.contactId)) first.set(mm.contactId, mm.text!);
  console.log(`\n── AMOSTRA DE ABERTURAS (1ª msg do lead) ──`);
  for (const t of [...first.values()].slice(0, 15)) console.log(`  • ${t.replace(/\n/g, " ").slice(0, 110)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
