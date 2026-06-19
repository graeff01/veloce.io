/**
 * Análise focada p/ desenhar o fluxo: gargalo de atendimento (tempo de 1ª resposta),
 * leads por veículo (anúncio), prontidão do catálogo (km/ano/foto) e padrão de abertura.
 * 100% leitura. Uso: railway run --service Postgres npx tsx scripts/boqueirao-analysis.ts [nomeCliente]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const nameArg = process.argv[2] || "boqueir";
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(0)}%` : "0%");

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.log(`Cliente "${nameArg}" não encontrado`); return; }
  const conns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const connIds = conns.map((c) => c.id);
  console.log(`\n═══════ ${client.name} ═══════`);

  // 1) Gargalo: tempo de 1ª resposta.
  const convos = await prisma.waConversation.findMany({ where: { connectionId: { in: connIds }, firstResponseSec: { not: null } }, select: { firstResponseSec: true } });
  const secs = convos.map((c) => c.firstResponseSec!).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
  const over1h = secs.filter((s) => s > 3600).length;
  const over12h = secs.filter((s) => s > 12 * 3600).length;
  const noResp = await prisma.waConversation.count({ where: { connectionId: { in: connIds }, firstResponseSec: null } });
  console.log(`\n── GARGALO: tempo de 1ª resposta (${secs.length} conversas respondidas) ──`);
  console.log(`  Mediana: ${(median / 60).toFixed(0)} min  ·  > 1h: ${pct(over1h, secs.length)}  ·  > 12h: ${pct(over12h, secs.length)}`);
  console.log(`  Conversas SEM nenhuma resposta: ${noResp}`);

  // 2) Leads por veículo (anúncio).
  const leads = await prisma.waLead.findMany({ where: { connectionId: { in: connIds } }, select: { adModel: true, adTitle: true } });
  const byModel: Record<string, number> = {};
  for (const l of leads) { const k = (l.adModel || l.adTitle || "(sem modelo)").trim(); byModel[k] = (byModel[k] ?? 0) + 1; }
  console.log(`\n── LEADS POR VEÍCULO DO ANÚNCIO (${leads.length} leads de anúncio) ──`);
  for (const [k, v] of Object.entries(byModel).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${String(v).padStart(3)}  ${k}`);

  // 3) Prontidão do catálogo.
  const items = await prisma.catalogItem.findMany({ where: { clientId: client.id }, select: { title: true, price: true, attributes: true, imageUrl: true, available: true } });
  const withAttr = items.filter((i) => i.attributes && Object.keys(i.attributes as object).length > 0).length;
  const withImg = items.filter((i) => i.imageUrl).length;
  const withPrice = items.filter((i) => i.price).length;
  console.log(`\n── PRONTIDÃO DO CATÁLOGO (${items.length} itens) ──`);
  console.log(`  Com atributos (ano/km/...): ${withAttr} (${pct(withAttr, items.length)})  ·  com foto: ${withImg} (${pct(withImg, items.length)})  ·  com preço: ${withPrice} (${pct(withPrice, items.length)})`);
  if (items[0]) console.log(`  Exemplo de atributos: ${JSON.stringify(items.find((i) => i.attributes)?.attributes ?? items[0].attributes ?? {})}`);

  // 4) Padrão das perguntas (inbound).
  const msgs = await prisma.waMessage.findMany({ where: { connectionId: { in: connIds }, direction: "in", type: "text", text: { not: null } }, select: { text: true }, take: 4000, orderBy: { timestamp: "desc" } });
  const asks = { km: 0, ano: 0, preco: 0, foto: 0, disp: 0 };
  for (const m of msgs) {
    const t = norm(m.text!);
    if (/\bkm\b|quilometr|rodad/.test(t)) asks.km++;
    if (/\bano\b|\d{4}\/\d{4}|modelo \d{4}/.test(t)) asks.ano++;
    if (/pre[c]o|valor|quanto/.test(t)) asks.preco++;
    if (/foto|imagem|fotos|ver ele|manda.*foto/.test(t)) asks.foto++;
    if (/ainda (tem|ta|disponivel)|disponivel/.test(t)) asks.disp++;
  }
  console.log(`\n── PERGUNTAS NAS MENSAGENS DO LEAD (${msgs.length} msgs) ──`);
  console.log(`  km/rodagem: ${asks.km} (${pct(asks.km, msgs.length)})  ·  ano: ${asks.ano} (${pct(asks.ano, msgs.length)})  ·  preço: ${asks.preco} (${pct(asks.preco, msgs.length)})  ·  pede foto: ${asks.foto} (${pct(asks.foto, msgs.length)})  ·  disponível?: ${asks.disp} (${pct(asks.disp, msgs.length)})`);

  // 5) Amostra de aberturas de conversa (primeira msg do lead).
  const sample = await prisma.waMessage.findMany({ where: { connectionId: { in: connIds }, direction: "in", type: "text", text: { not: null } }, select: { contactId: true, text: true, timestamp: true }, orderBy: { timestamp: "asc" }, take: 2000 });
  const firstByContact = new Map<string, string>();
  for (const m of sample) if (!firstByContact.has(m.contactId)) firstByContact.set(m.contactId, m.text!);
  console.log(`\n── AMOSTRA DE ABERTURAS (1ª mensagem do lead) ──`);
  for (const t of [...firstByContact.values()].slice(0, 15)) console.log(`  • ${t.replace(/\n/g, " ").slice(0, 100)}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
