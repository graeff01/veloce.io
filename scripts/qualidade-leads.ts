/**
 * Qualidade de lead por campanha (Taos, Renegade): lê o CRIATIVO do anúncio e
 * classifica a INTENÇÃO real de cada lead pelas mensagens que ele mandou — para
 * entender quem chega "comprador" x "curioso" e como otimizar o anúncio para
 * atrair lead mais qualificado. 100% leitura.
 *
 * Uso: railway run --service Postgres npx tsx scripts/qualidade-leads.ts [nomeCliente]
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
const TARGETS = ["taos", "renegade"];

// Sinais de intenção (uma msg pode ter vários). FORTE = sinal de compra real.
const INTENTS: { key: string; label: string; re: RegExp; forte?: boolean }[] = [
  { key: "saudacao", label: "Só saudação/abertura", re: /\b(oi|ola|opa|bom dia|boa tarde|boa noite|tudo bem|blz)\b/ },
  { key: "disp", label: "Ainda está disponível?", re: /(ainda (tem|ta|esta|disponivel|a venda)|disponivel|ja vendeu|foi vendido)/ },
  { key: "preco", label: "Preço/valor", re: /(pre[c]o|valor|quanto (custa|sai|fica|ta|e|por)|qual o valor|tabela|a vista)/, forte: true },
  { key: "financ", label: "Financiamento/parcela", re: /(financ|parcel|entrada|simula|presta[c]|\bbanco\b|credito|a prazo|consorcio|carne)/, forte: true },
  { key: "troca", label: "Troca de veículo", re: /(troca|dou (na|de) troca|aceita.*troca|na troca|meu carro (na|de) troca)/, forte: true },
  { key: "visita", label: "Visita/test drive", re: /(visita|ver de perto|test ?drive|agendar|passar a[i]|conhecer|marcar|olhar pessoalmente|dar uma olhada)/, forte: true },
  { key: "ficha", label: "Ficha técnica (ano/km/itens)", re: /(\bano\b|\bkm\b|quilometr|\bmotor\b|c[a]mbio|automatic|completo|ipva|unico dono|revis|\bpneu|\bcor\b|\bflex\b|diesel|\bportas?\b|teto solar|\bcouro\b|multimidia)/ },
  { key: "local", label: "Localização/horário", re: /(onde (fica|esta|e|voces)|endereco|localiza|que horas|horario|esta aberto|qual cidade)/ },
  { key: "negociar", label: "Negociar/desconto", re: /(desconto|melhor pre[c]o|ultimo pre[c]o|abaixa|faz por|consegue por|baixa o|condi[c][a]o melhor)/, forte: true },
];

async function main() {
  const client = await prisma.client.findFirst({ where: { name: { contains: nameArg, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.error("cliente não achado"); return; }
  const conn = await prisma.metaConnection.findUnique({ where: { clientId: client.id }, select: { id: true } });
  const waConns = await prisma.waConnection.findMany({ where: { clientId: client.id }, select: { id: true } });
  const waIds = waConns.map((c) => c.id);

  const campaigns = conn ? await prisma.metaCampaign.findMany({ where: { connectionId: conn.id }, select: { campaignId: true, name: true } }) : [];
  const ads = conn ? await prisma.metaAd.findMany({ where: { connectionId: conn.id }, select: { adId: true, campaignId: true, creativeId: true, status: true } }) : [];
  const creatives = conn ? await prisma.metaCreative.findMany({ where: { connectionId: conn.id }, select: { creativeId: true, title: true, body: true } }) : [];
  const crById = new Map(creatives.map((c) => [c.creativeId, c]));
  const leads = await prisma.waLead.findMany({ where: { connectionId: { in: waIds } }, select: { contactId: true, adModel: true, adTitle: true, adBody: true } });

  console.log(`═══════ ${client.name} — QUALIDADE DE LEAD: TAOS × RENEGADE ═══════`);

  for (const target of TARGETS) {
    console.log(`\n\n████ ${target.toUpperCase()} ████`);

    // ── Criativo do anúncio (o que atrai o público) ──
    const camp = campaigns.filter((c) => norm(c.name).includes(target));
    const campIds = new Set(camp.map((c) => c.campaignId));
    const mAds = ads.filter((a) => campIds.has(a.campaignId));
    console.log(`  ── CRIATIVO (o que o anúncio promete) ──`);
    const seen = new Set<string>();
    for (const a of mAds) {
      const cr = a.creativeId ? crById.get(a.creativeId) : null;
      const key = `${cr?.title ?? ""}|${cr?.body ?? ""}`;
      if (!cr || seen.has(key)) continue;
      seen.add(key);
      console.log(`   [${a.status}] título: ${cr.title ?? "—"}`);
      if (cr.body) console.log(`           corpo: ${cr.body.replace(/\n/g, " ").slice(0, 220)}`);
    }
    if (!seen.size) console.log("   (sem criativo sincronizado)");

    // ── Mensagens dos leads → intenção real ──
    const matched = leads.filter((l) => norm(`${l.adModel ?? ""} ${l.adTitle ?? ""} ${l.adBody ?? ""}`).includes(target));
    const ids = matched.map((l) => l.contactId);
    const msgs = await prisma.waMessage.findMany({
      where: { contactId: { in: ids }, direction: "in", type: "text", text: { not: null } },
      select: { contactId: true, text: true, timestamp: true }, orderBy: { timestamp: "asc" },
    });
    const byContact = new Map<string, string[]>();
    for (const m of msgs) { (byContact.get(m.contactId) ?? byContact.set(m.contactId, []).get(m.contactId)!).push(m.text!); }

    const intentHits: Record<string, number> = {};
    let forteLeads = 0, soFraco = 0;
    const msgCounts: number[] = [];
    for (const [, texts] of byContact) {
      const blob = norm(texts.join(" \n "));
      msgCounts.push(texts.length);
      let temForte = false, tocou = false;
      for (const it of INTENTS) {
        if (it.re.test(blob)) {
          intentHits[it.key] = (intentHits[it.key] ?? 0) + 1;
          if (it.forte) temForte = true;
          if (it.key !== "saudacao" && it.key !== "disp") tocou = true;
        }
      }
      if (temForte) forteLeads++;
      else if (!tocou) soFraco++; // só saudação/disponibilidade
    }
    const nLeads = byContact.size;
    const avgMsgs = msgCounts.length ? (msgCounts.reduce((a, b) => a + b, 0) / msgCounts.length) : 0;
    const oneLiners = msgCounts.filter((c) => c <= 1).length;

    console.log(`\n  ── ENGAJAMENTO ──`);
    console.log(`   leads c/ mensagem: ${nLeads}  ·  msgs/lead (média): ${avgMsgs.toFixed(1)}  ·  leads de 1 só mensagem: ${oneLiners} (${pct(oneLiners, nLeads)})`);

    console.log(`\n  ── INTENÇÃO (% dos leads que tocaram em cada tema) ──`);
    for (const it of INTENTS) console.log(`   ${it.forte ? "🔥" : "  "} ${it.label.padEnd(32)} ${String(intentHits[it.key] ?? 0).padStart(3)}  ${pct(intentHits[it.key] ?? 0, nLeads)}`);

    console.log(`\n  ── QUALIDADE (resumo) ──`);
    console.log(`   🔥 sinal FORTE de compra (preço/financ/troca/visita/negociar): ${forteLeads} (${pct(forteLeads, nLeads)})`);
    console.log(`   ❄  só saudação/“ainda tem?” (baixa intenção): ${soFraco} (${pct(soFraco, nLeads)})`);

    console.log(`\n  ── AMOSTRA DE ABERTURAS ──`);
    let i = 0;
    for (const [, texts] of byContact) { if (i++ >= 12) break; console.log(`   • ${texts[0].replace(/\n/g, " ").slice(0, 100)}`); }
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
