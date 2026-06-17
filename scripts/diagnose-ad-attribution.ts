/**
 * Diagnóstico de atribuição de anúncio (Meta × veloce.io).
 *
 * Responde à pergunta: "a Meta mostra conversas iniciadas num anúncio, mas no
 * nosso sistema o lead não aparece — foi a Meta que delirou, ou foi o nosso
 * sistema que não capturou?"
 *
 * A fonte da verdade é WaMessage.raw->'referral' (o payload cru do Click-to-
 * WhatsApp que a Meta nos manda na 1ª mensagem). Ele fica gravado MESMO quando
 * nenhum WaLead foi criado (ex.: o contato já era lead de outro anúncio). Então
 * dá pra separar com precisão:
 *
 *   • referral CHEGOU e virou lead daquele anúncio   → OK
 *   • referral CHEGOU mas não foi atribuído           → bug/limitação nossa
 *       - contato já era lead de OUTRO anúncio (dedup first-touch)
 *       - lead sem adId (detectado só por texto/modelo)
 *       - anúncio (source_id) ainda não sincronizado em MetaAd
 *   • referral NÃO chegou pra aquele anúncio          → lado Meta (conversa
 *       modelada/estimada, janela de atribuição, cross-device) — não é bug nosso
 *
 * 100% leitura (nenhuma escrita).
 *
 * Uso:
 *   railway run --service Postgres npx tsx scripts/diagnose-ad-attribution.ts [clientId] [--month YYYY-MM]
 *   (sem clientId = lista as conexões WhatsApp disponíveis e sai)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const argv = process.argv.slice(2);
let clientId: string | undefined;
let monthStr: string | undefined; // YYYY-MM
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--month") monthStr = argv[++i];
  else if (a.startsWith("--month=")) monthStr = a.split("=")[1];
  else if (!a.startsWith("--")) clientId = a;
}

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_PUBLIC_URL/DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

// Janela do período (mês). Default: mês corrente. Limites em horário do servidor.
function monthWindow(s: string | undefined): { start: Date; end: Date; label: string } {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth(); // 0-based
  if (s) {
    const [yy, mm] = s.split("-").map(Number);
    if (Number.isFinite(yy) && Number.isFinite(mm)) { y = yy; m = mm - 1; }
  }
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 1);
  return { start, end, label: `${y}-${String(m + 1).padStart(2, "0")}` };
}

const fmt = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

interface RefRow { contactId: string; sourceId: string; sourceType: string | null; headline: string | null; ts: Date }

async function main() {
  // Sem clientId → lista conexões para o operador escolher.
  if (!clientId) {
    const conns = await prisma.waConnection.findMany({
      include: { client: { select: { name: true } }, _count: { select: { leads: true } } },
      orderBy: { client: { name: "asc" } },
    });
    console.log("\nConexões WhatsApp disponíveis (passe o clientId como 1º argumento):\n");
    for (const c of conns) {
      console.log(`  ${c.clientId}  ${c.client.name}  (${c.displayPhone ?? "?"}, ${c._count.leads} leads)`);
    }
    console.log("");
    return;
  }

  const { start, end, label } = monthWindow(monthStr);

  const conn = await prisma.waConnection.findUnique({
    where: { clientId },
    include: { client: { select: { name: true } } },
  });
  if (!conn) { console.error(`Cliente ${clientId} sem WhatsApp conectado`); return; }
  const meta = await prisma.metaConnection.findUnique({ where: { clientId }, select: { id: true } }).catch(() => null);

  console.log(`\n══ Diagnóstico de atribuição — ${conn.client.name} — ${label} ══`);
  console.log(`   WhatsApp connection: ${conn.id}`);
  console.log(`   Meta connection:     ${meta?.id ?? "— (não conectada / sem MetaAd sincronizado)"}`);
  console.log(`   Janela: ${fmt(start)} → ${fmt(end)}\n`);

  // 1) Referrals CRUS que chegaram no período (fonte da verdade).
  const refRows = await prisma.$queryRaw<RefRow[]>`
    SELECT m."contactId"                        AS "contactId",
           m.raw->'referral'->>'source_id'      AS "sourceId",
           m.raw->'referral'->>'source_type'    AS "sourceType",
           m.raw->'referral'->>'headline'       AS "headline",
           m."timestamp"                        AS "ts"
    FROM "WaMessage" m
    WHERE m."connectionId" = ${conn.id}
      AND m.direction = 'in'
      AND m."timestamp" >= ${start} AND m."timestamp" < ${end}
      AND m.raw->'referral'->>'source_id' IS NOT NULL
    ORDER BY m."timestamp" ASC`;

  if (refRows.length === 0) {
    console.log("Nenhum referral de Click-to-WhatsApp chegou neste período.");
    console.log("→ Se a Meta mostra conversas iniciadas, o referral não nos foi entregue");
    console.log("  (conversa modelada/estimada, ou a 1ª mensagem não chegou ao webhook).\n");
  }

  // 2) Todos os leads do contato (qualquer época) — para detectar dedup first-touch.
  const leads = await prisma.waLead.findMany({
    where: { connectionId: conn.id },
    select: { contactId: true, adId: true, adModel: true, enteredAt: true },
  });
  const leadByContact = new Map(leads.map((l) => [l.contactId, l]));

  // 3) Nomes de anúncio (MetaAd) por source_id — e quais NÃO estão sincronizados.
  const sourceIds = [...new Set(refRows.map((r) => r.sourceId))];
  const metaAds = meta && sourceIds.length
    ? await prisma.metaAd.findMany({
        where: { connectionId: meta.id, adId: { in: sourceIds } },
        select: { adId: true, name: true, status: true },
      })
    : [];
  const adById = new Map(metaAds.map((a) => [a.adId, a]));

  // 4) Agrega por source_id (= por anúncio na Meta).
  interface Bucket {
    sourceId: string; headline: string | null;
    contacts: Set<string>;
    okAttributed: Set<string>;       // virou lead deste anúncio
    dedupOtherAd: Set<string>;       // contato já era lead de OUTRO anúncio
    leadNoAdId: Set<string>;         // lead existe mas sem adId (só modelo/texto)
    noLead: Set<string>;             // referral chegou e não há lead nenhum
    firstSeen: Date; lastSeen: Date;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of refRows) {
    let b = buckets.get(r.sourceId);
    if (!b) {
      b = { sourceId: r.sourceId, headline: r.headline, contacts: new Set(), okAttributed: new Set(),
            dedupOtherAd: new Set(), leadNoAdId: new Set(), noLead: new Set(), firstSeen: r.ts, lastSeen: r.ts };
      buckets.set(r.sourceId, b);
    }
    b.contacts.add(r.contactId);
    if (r.headline && !b.headline) b.headline = r.headline;
    if (r.ts < b.firstSeen) b.firstSeen = r.ts;
    if (r.ts > b.lastSeen) b.lastSeen = r.ts;

    const lead = leadByContact.get(r.contactId);
    if (!lead) b.noLead.add(r.contactId);
    else if (lead.adId === r.sourceId) b.okAttributed.add(r.contactId);
    else if (lead.adId) b.dedupOtherAd.add(r.contactId);
    else b.leadNoAdId.add(r.contactId);
  }

  const ordered = [...buckets.values()].sort((a, b) => b.contacts.size - a.contacts.size);

  // 5) Relatório por anúncio.
  for (const b of ordered) {
    const ad = adById.get(b.sourceId);
    const synced = meta ? (ad ? `sincronizado · ${ad.status}` : "NÃO sincronizado em MetaAd") : "Meta não conectada";
    const gap = b.contacts.size - b.okAttributed.size;
    console.log(`──────────────────────────────────────────────────────────────`);
    console.log(`Anúncio: ${ad?.name ?? b.headline ?? "(sem nome)"}`);
    console.log(`  source_id (ad_id Meta): ${b.sourceId}   [${synced}]`);
    console.log(`  referrals recebidos:    ${b.contacts.size} contato(s)   (${fmt(b.firstSeen)} → ${fmt(b.lastSeen)})`);
    console.log(`  → atribuídos a ESTE anúncio (aparecem na tela): ${b.okAttributed.size}`);
    if (gap > 0) {
      console.log(`  → recebidos mas NÃO atribuídos a este anúncio:   ${gap}`);
      if (b.dedupOtherAd.size) console.log(`       • ${b.dedupOtherAd.size} já eram lead de OUTRO anúncio (dedup first-touch)`);
      if (b.leadNoAdId.size)   console.log(`       • ${b.leadNoAdId.size} viraram lead SEM ad_id (detectado só por texto/modelo)`);
      if (b.noLead.size)       console.log(`       • ${b.noLead.size} referral chegou e NENHUM lead foi criado`);
      if (!ad)                 console.log(`       • anúncio não está em MetaAd → cai em "não sincronizado" na atribuição`);
    }
  }

  // 6) Resumo geral.
  const totalContacts = new Set(refRows.map((r) => r.contactId)).size;
  const totalOk = ordered.reduce((s, b) => s + b.okAttributed.size, 0);
  console.log(`\n══ Resumo ══`);
  console.log(`  Anúncios com referral recebido: ${ordered.length}`);
  console.log(`  Contatos com referral (deduplicado): ${totalContacts}`);
  console.log(`  Atribuídos corretamente:             ${totalOk}`);
  console.log(`  Diferença (capturado, não atribuído): ${totalContacts - totalOk}`);
  console.log(`\nLeitura: anúncios com "referrals recebidos > 0" mas "atribuídos = 0"`);
  console.log(`= o lead CHEGOU, o sistema não o associou (bug/limitação nossa).`);
  console.log(`Anúncios que a Meta conta mas NÃO aparecem aqui (nenhum referral)`);
  console.log(`= lado Meta (conversa modelada / atribuição), não é dado que recebemos.\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
