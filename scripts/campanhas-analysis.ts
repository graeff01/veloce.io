/**
 * Análise comparativa dos leads + atendimento por MODELO de anúncio (Taos, Tiguan,
 * Compass, Renegade) + baseline da loja. Cruza com as métricas de mídia (Windsor)
 * fora deste script. 100% leitura.
 *
 * Uso: railway run --service Postgres npx tsx scripts/campanhas-analysis.ts [nomeCliente]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const nameArg = process.argv[2] || "boqueir";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(0)}%` : "—");
const fmt = (sec: number) => (sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.round(sec / 60)}min` : `${(sec / 3600).toFixed(1)}h`);
const MODELS = ["taos", "tiguan", "compass", "renegade"];

type Row = { contactId: string };

async function block(label: string, contactIds: string[], clientId: string) {
  const ids = contactIds;
  const convos = await prisma.waConversation.findMany({
    where: { contactId: { in: ids } },
    select: { firstResponseSec: true, outboundCount: true, funnelStage: true, inboundCount: true },
  });
  const resp = convos.filter((c) => c.firstResponseSec != null).map((c) => c.firstResponseSec!).sort((a, b) => a - b);
  const med = resp.length ? resp[Math.floor(resp.length / 2)] : 0;
  const noResp = convos.filter((c) => c.firstResponseSec == null).length;
  const neverOut = convos.filter((c) => c.outboundCount === 0).length;

  const profiles = await prisma.leadProfile.findMany({
    where: { contactId: { in: ids } },
    select: { score: true, temperature: true, budget: true, wantsFinancing: true, hasTradeIn: true, urgency: true, visitIntent: true, readyToBuy: true, qualified: true },
  });
  const objs = await prisma.leadObjection.findMany({ where: { contactId: { in: ids } }, select: { type: true, resolved: true } });
  const visits = await prisma.visit.count({ where: { clientId, contactId: { in: ids } } });
  const stages: Record<string, number> = {};
  for (const c of convos) { const s = c.funnelStage ?? "(sem etapa)"; stages[s] = (stages[s] ?? 0) + 1; }

  console.log(`\n■ ${label}`);
  console.log(`  leads(contatos): ${ids.length}  ·  conversas: ${convos.length}  ·  respondidas: ${resp.length}  ·  SEM resposta: ${noResp}  ·  loja nunca respondeu: ${neverOut}`);
  if (resp.length) console.log(`  1ª resposta — mediana ${fmt(med)}  ·  ≤5min ${pct(resp.filter((s) => s <= 300).length, resp.length)}  ·  >1h ${pct(resp.filter((s) => s > 3600).length, resp.length)}  ·  >12h ${pct(resp.filter((s) => s > 12 * 3600).length, resp.length)}`);
  console.log(`  perfis: ${profiles.length}  ·  qualificados ${pct(profiles.filter((p) => p.qualified).length, profiles.length)}  ·  pronto-comprar ${pct(profiles.filter((p) => p.readyToBuy).length, profiles.length)}  ·  intenção-visita ${pct(profiles.filter((p) => p.visitIntent).length, profiles.length)}  ·  c/ orçamento ${pct(profiles.filter((p) => p.budget).length, profiles.length)}  ·  financiamento ${pct(profiles.filter((p) => p.wantsFinancing).length, profiles.length)}`);
  console.log(`  objeções: ${objs.length} ${objs.length ? "(" + Object.entries(objs.reduce((a: Record<string, number>, o) => { a[o.type] = (a[o.type] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${k}:${v}`).join(" ") + ")" : ""}`);
  console.log(`  visitas agendadas: ${visits}  ·  funil: ${Object.entries(stages).map(([k, v]) => `${k}=${v}`).join(" / ")}`);
}

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`Cliente "${nameArg}" não encontrado`); return; }
  const conns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);

  const leads = await prisma.waLead.findMany({
    where: { connectionId: { in: connIds } },
    select: { contactId: true, adModel: true, adTitle: true, adBody: true, enteredAt: true },
  });
  console.log(`═══════ ${client.name} — ANÁLISE POR MODELO (${leads.length} leads de anúncio) ═══════`);

  for (const model of MODELS) {
    const matched = leads.filter((l) => norm(`${l.adModel ?? ""} ${l.adTitle ?? ""} ${l.adBody ?? ""}`).includes(model));
    const datas = matched.map((l) => l.enteredAt).sort((a, b) => +a - +b);
    const periodo = datas.length ? `${datas[0].toISOString().slice(0, 10)}→${datas[datas.length - 1].toISOString().slice(0, 10)}` : "—";
    await block(`${model.toUpperCase()}  (período ${periodo})`, matched.map((l) => l.contactId), client.id);
  }

  // Baseline da loja inteira (todas as conversas, não só de anúncio).
  const allConvos = await prisma.waConversation.findMany({ where: { connectionId: { in: connIds } }, select: { firstResponseSec: true, outboundCount: true } });
  const resp = allConvos.filter((c) => c.firstResponseSec != null).map((c) => c.firstResponseSec!).sort((a, b) => a - b);
  const med = resp.length ? resp[Math.floor(resp.length / 2)] : 0;
  const totalVisits = await prisma.visit.count({ where: { clientId: client.id } });
  const totalProfiles = await prisma.leadProfile.count({ where: { connectionId: { in: connIds } } });
  console.log(`\n■ BASELINE LOJA INTEIRA`);
  console.log(`  conversas: ${allConvos.length}  ·  respondidas: ${resp.length}  ·  1ª resp mediana ${fmt(med)}  ·  ≤5min ${pct(resp.filter((s) => s <= 300).length, resp.length)}  ·  loja nunca respondeu ${pct(allConvos.filter((c) => c.outboundCount === 0).length, allConvos.length)}`);
  console.log(`  perfis no total: ${totalProfiles}  ·  visitas no total: ${totalVisits}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
