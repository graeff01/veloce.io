/**
 * Inteligência de leads: lê o histórico REAL de mensagens recebidas (WaMessage in)
 * e mostra como os leads do mercado automotivo se comportam — o que perguntam, com
 * o que abrem a conversa, modelos mais citados e padrões ainda não mapeados. Serve
 * para calibrar o prompt/qualificação da IA com base em dado, não em achismo.
 *
 * 100% leitura (nenhuma escrita). Idempotente.
 *
 * Uso:
 *   railway run --service Postgres npx tsx scripts/lead-insights.ts [clientId] [--days 120] [--limit 8000]
 *   (sem clientId = todos os tenants)
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const raw = process.argv.slice(2);
let clientId: string | undefined;
let days = 120, limit = 8000;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a === "--days") days = Number(raw[++i]);
  else if (a.startsWith("--days=")) days = Number(a.split("=")[1]);
  else if (a === "--limit") limit = Number(raw[++i]);
  else if (a.startsWith("--limit=")) limit = Number(a.split("=")[1]);
  else if (!a.startsWith("--")) clientId = a;
}
if (!Number.isFinite(days)) days = 120;
if (!Number.isFinite(limit)) limit = 8000;

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_PUBLIC_URL/DATABASE_URL ausente"); process.exit(1); }
const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ── Intenções do lead automotivo (uma mensagem pode ter várias) ──────────────
const INTENTS: { key: string; label: string; re: RegExp }[] = [
  { key: "saudacao", label: "Saudação / abertura", re: /\b(oi|ola|opa|bom dia|boa tarde|boa noite|eai|e ai|tudo bem|blz|boa)\b/ },
  { key: "disponibilidade", label: "Ainda está disponível?", re: /(ainda (tem|ta|esta|disponivel|a venda)|tem (esse|disponivel)|disponivel|ja vendeu|foi vendido|ainda esta a venda)/ },
  { key: "preco", label: "Preço / valor", re: /(pre[c]o|valor|quanto (custa|sai|fica|ta|e|por)|qual o valor|tabela|a vista|quanto e)/ },
  { key: "financiamento", label: "Financiamento / parcelas", re: /(financ|parcel|entrada|simula|presta[c]|\bbanco\b|credito|a prazo|consorcio|carne)/ },
  { key: "troca", label: "Troca de veículo", re: /(troca|dou (na|de) troca|aceita.*troca|na troca|tenho um .* (pra|para) (dar|troca)|meu carro (na|de) troca)/ },
  { key: "visita", label: "Visita / test drive", re: /(visita|ver de perto|test ?drive|agendar|ir a[i]|passar a[i]|conhecer|marcar|aparecer a[i]|olhar pessoalmente|dar uma olhada a[i])/ },
  { key: "ficha", label: "Ficha técnica (ano/km/itens)", re: /(\bano\b|\bkm\b|quilometr|\bmotor\b|c[a]mbio|automatic|\bmanual\b|completo|ipva|unico dono|revis|\bpneu|\bcor\b|\bflex\b|diesel|\bportas?\b|teto solar|\bcouro\b|multimidia|central)/ },
  { key: "local", label: "Localização / horário", re: /(onde (fica|esta|e|voces)|endereco|localiza|fica onde|que horas|horario|esta aberto|abre|funciona|atende|qual cidade)/ },
  { key: "reserva", label: "Reservar / segurar", re: /(reserv|segura (pra|para) mim|garante (pra|para) mim|da pra segurar|guarda (pra|para) mim)/ },
  { key: "documentacao", label: "Documentação", re: /(documenta|transfer[e]ncia|quitad|financiado|\bdebito|\bmulta|\blaudo|recibo|\bdoc\b)/ },
  { key: "humano", label: "Falar com vendedor", re: /(vendedor|atendente|falar com (alguem|vc|voce|uma pessoa)|me liga|pode ligar|whats do|numero do vendedor)/ },
  { key: "negociar", label: "Negociar / desconto", re: /(desconto|melhor pre[c]o|ultimo pre[c]o|abaixa|faz por|consegue por|baixa o|fechamos por|condi[c][a]o melhor)/ },
];

const MODELS = ["onix","hb20","gol","taos","t-cross","tcross","nivus","polo","virtus","jetta","corolla","yaris","hilux","sw4","compass","renegade","commander","kicks","sentra","frontier","creta","hb20s","tracker","spin","s10","cruze","montana","kwid","sandero","duster","oroch","logan","captur","mobi","argo","cronos","pulse","fastback","strada","toro","fiorino","ranger","ka","fiesta","ecosport","territory","civic","city","hrv","hr-v","wrv","wr-v","fit","corolla cross","tucson","santa fe","320i","onix plus","saveiro","amarok","tiguan","up","fox","voyage","tcross"];

const STOP = new Set(["de","a","o","que","e","do","da","em","um","para","pra","com","nao","uma","os","no","se","na","por","mais","as","dos","como","mas","ao","ele","das","tem","seu","sua","ou","isso","ja","eu","voce","vc","ta","to","ne","ai","q","esse","essa","esta","este","sim","me","meu","minha","to","pro","gostaria","queria","quero","tinha","seria","esse","ola","oi","bom","dia","boa","tarde","noite","obrigado","obrigada","vcs","voces","tudo","bem","aqui","la","tem","ter","fazer","saber","gostei","vi","onde","qual","quais","ainda","so","ver","poderia","pode","consigo","tipo","entao"]);

async function main() {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const where: Record<string, unknown> = { direction: "in", type: "text", text: { not: null }, timestamp: { gte: since } };
  if (clientId) {
    const conns = await prisma.waConnection.findMany({ where: { clientId }, select: { id: true } });
    where.connectionId = { in: conns.map((c) => c.id) };
  }

  const msgs = await prisma.waMessage.findMany({
    where, orderBy: { timestamp: "asc" }, take: limit,
    select: { contactId: true, text: true, timestamp: true },
  });

  if (msgs.length === 0) { console.log("Nenhuma mensagem recebida no período. Aumente --days ou confira o clientId."); return; }

  const contacts = new Map<string, { first: string; count: number }>();
  for (const m of msgs) {
    const c = contacts.get(m.contactId);
    if (!c) contacts.set(m.contactId, { first: m.text!, count: 1 });
    else c.count++;
  }

  const intentCount: Record<string, number> = {};        // mensagens que tocam a intenção
  const intentLeads: Record<string, Set<string>> = {};   // leads distintos que tocam a intenção
  const firstIntent: Record<string, number> = {};        // intenção da 1ª mensagem do lead
  const modelCount: Record<string, number> = {};
  const uncatBigrams: Record<string, number> = {};
  for (const it of INTENTS) { intentCount[it.key] = 0; intentLeads[it.key] = new Set(); firstIntent[it.key] = 0; }

  const classify = (text: string) => INTENTS.filter((it) => it.re.test(norm(text))).map((it) => it.key);

  for (const m of msgs) {
    const hits = classify(m.text!);
    for (const k of hits) { intentCount[k]++; intentLeads[k].add(m.contactId); }
    const t = norm(m.text!);
    for (const model of MODELS) if (t.includes(model)) modelCount[model] = (modelCount[model] ?? 0) + 1;
    if (hits.length === 0) {
      const toks = t.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
      for (let i = 0; i < toks.length - 1; i++) { const bg = `${toks[i]} ${toks[i + 1]}`; uncatBigrams[bg] = (uncatBigrams[bg] ?? 0) + 1; }
    }
  }

  for (const [, c] of contacts) {
    const hits = classify(c.first);
    if (hits.length) firstIntent[hits[0]]++;
    else firstIntent["__none"] = (firstIntent["__none"] ?? 0) + 1;
  }

  const nLeads = contacts.size;
  const pct = (n: number, total: number) => total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
  const bar = (frac: number) => "█".repeat(Math.round(frac * 24)).padEnd(24, "·");

  console.log(`\n══════════ INTELIGÊNCIA DE LEADS (automotivo) ══════════`);
  console.log(`Período: últimos ${days} dias  ·  ${clientId ? `cliente ${clientId}` : "TODOS os clientes"}`);
  console.log(`Mensagens recebidas: ${msgs.length}  ·  leads distintos: ${nLeads}  ·  média ${(msgs.length / nLeads).toFixed(1)} msg/lead\n`);

  console.log("── O QUE OS LEADS PERGUNTAM (% de leads que tocam o tema) ──");
  const ranked = INTENTS.map((it) => ({ it, leads: intentLeads[it.key].size })).sort((a, b) => b.leads - a.leads);
  for (const { it, leads } of ranked) {
    console.log(`  ${bar(leads / nLeads)} ${pct(leads, nLeads).padStart(6)}  ${it.label}  (${intentCount[it.key]} msgs)`);
  }

  console.log("\n── COM O QUE ABREM A CONVERSA (1ª mensagem) ──");
  const fr = Object.entries(firstIntent).sort((a, b) => b[1] - a[1]);
  for (const [k, v] of fr) {
    const label = k === "__none" ? "(não classificado)" : INTENTS.find((i) => i.key === k)?.label ?? k;
    if (v > 0) console.log(`  ${pct(v, nLeads).padStart(6)}  ${label}`);
  }

  const models = Object.entries(modelCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (models.length) {
    console.log("\n── MODELOS MAIS CITADOS ──");
    for (const [m, n] of models) console.log(`  ${String(n).padStart(4)}  ${m}`);
  }

  const bigrams = Object.entries(uncatBigrams).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (bigrams.length) {
    console.log("\n── PADRÕES NÃO MAPEADOS (mensagens fora das intenções; revele temas novos) ──");
    for (const [bg, n] of bigrams) console.log(`  ${String(n).padStart(4)}  ${bg}`);
  }

  console.log("\nDica: passe a saída deste relatório para o time/IA — os temas no topo");
  console.log("e os 'padrões não mapeados' indicam o que o prompt e o conhecimento devem cobrir.\n");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
