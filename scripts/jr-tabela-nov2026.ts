/**
 * Tabela de preços NOVA da JR (catálogo de nov/2026, enviado pela Maria).
 *
 * O PREÇO MORA EM QUATRO LUGARES, e a IA lê os quatro:
 *   1. PricingConfig.rules (base/options) — o motor do orçamento. É ele que
 *      calcula o PDF; nunca o modelo.
 *   2. KnowledgeChunk — o acervo. É dele que a IA tira o preço quando conversa.
 *   3. CatalogItem.price — o cadastro dos produtos (foto + título).
 *   4. public/catalogo/ — o PDF e as fotos (vão no deploy, não aqui).
 * Atualizar só um deixa a IA dizendo um preço e o orçamento saindo com outro.
 *
 * COMO CASA. Por VALOR ANTIGO, conferido pelo NOME. Cada preço da tabela velha
 * aponta para um único modelo (o R$ 2.197 era o fogão de 4 bocas E a bancada,
 * e os dois foram para R$ 2.307 — sem ambiguidade). O nome só confere: se o
 * valor bate e o nome não parece o modelo, o item vai para REVISAR e não muda.
 *
 * NÃO RODA DUAS VEZES. Três valores novos são valores velhos de OUTRO produto
 * (R$ 3.757 era a Tradição e virou a Parrilla 105; R$ 4.111 e R$ 1.107 idem).
 * Rodar de novo trocaria o preço novo da Parrilla pelo da Tradição. Por isso o
 * script grava `rules.tabelaPrecos` e se recusa a rodar se ela já estiver lá.
 *
 * TRAVA. `rules.precosRevogados` recebe os valores velhos que saíram de vigor.
 * O orquestrador barra a resposta que citar um deles, mesmo que o número esteja
 * no histórico da conversa (lead que recebeu o preço velho semana passada).
 *
 * Uso (DRY-RUN por padrão — mostra tudo e não grava):
 *   railway run --service veloce.io bash -c 'railway run --service Postgres bash -c "
 *     export DATABASE_URL=\$DATABASE_PUBLIC_URL; npx tsx scripts/jr-tabela-nov2026.ts"'
 *   ...e de novo com --commit.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
const key = process.env.OPENAI_API_KEY;
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }
if (!key) { console.error("OPENAI_API_KEY ausente (rode via railway run --service veloce.io)"); process.exit(1); }
const commit = process.argv.includes("--commit");
const MARCA = "catalogo-2026-11";

// ── A tabela ─────────────────────────────────────────────────────────────────
// `tem`: palavras que o nome PRECISA ter (cada item pode ser "a|b" = uma ou
// outra). `sem`: palavras que NÃO pode ter. Nome normalizado: minúsculo, sem
// acento. Valores conferidos página a página contra os dois PDFs.
interface Modelo { nome: string; velho: number; novo: number; tem: string[]; sem?: string[] }
const T: Modelo[] = [
  { nome: "Popular Lisa 55",                       velho: 817,   novo: 857,   tem: ["popular|lisa", "55"], sem: ["fogao", "campeir"] },
  { nome: "Popular Lisa 65",                       velho: 927,   novo: 977,   tem: ["popular|lisa", "65"], sem: ["fogao", "campeir"] },
  { nome: "Popular Tijolinho 65",                  velho: 1037,  novo: 1197,  tem: ["tijolinho|popular", "65"] },
  { nome: "Popular Tijolinho 75",                  velho: 1147,  novo: 1297,  tem: ["tijolinho|popular", "75"] },
  { nome: "Conjunto Popular Lisa 55 + Campeirinho", velho: 1924, novo: 2024,  tem: ["popular", "campeir|fogao"] },
  { nome: "Conjunto Popular Lisa 65 + Campeirinho", velho: 2034, novo: 2144,  tem: ["popular", "campeir|fogao"] },
  { nome: "Prime 7 espetos",                       velho: 1247,  novo: 1307,  tem: ["7"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime 9 espetos",                       velho: 1447,  novo: 1517,  tem: ["9"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime 11 espetos",                      velho: 1547,  novo: 1627,  tem: ["11"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime 16 espetos",                      velho: 1997,  novo: 2097,  tem: ["16"], sem: ["fogao", "forno", "campeir", "napoli"] },
  { nome: "Prime Parrilla 81",                     velho: 2957,  novo: 3107,  tem: ["parrilla"] },
  { nome: "Prime Parrilla 105",                    velho: 3577,  novo: 3757,  tem: ["parrilla"] },
  { nome: "Prime 32 espetos",                      velho: 4215,  novo: 4427,  tem: ["32"] },
  { nome: "Tradição",                              velho: 3757,  novo: 3947,  tem: ["tradicao"], sem: ["gourmet", "napoli"] },
  { nome: "Tradição Gourmet",                      velho: 4297,  novo: 4517,  tem: ["tradicao", "gourmet"], sem: ["napoli"] },
  { nome: "Gourmet",                               velho: 4197,  novo: 4407,  tem: ["gourmet"], sem: ["tradicao", "supreme", "napoli", "fogao", "forno", "bancada", "cuba", "pia"] },
  { nome: "Gourmet Supreme",                       velho: 14897, novo: 15647, tem: ["supreme"] },
  { nome: "Prime 7 + Fogão Campeirinho",           velho: 2354,  novo: 2474,  tem: ["7", "campeir"], sem: ["napoli"] },
  { nome: "Prime 9 + Fogão Campeirinho",           velho: 2554,  novo: 2684,  tem: ["9", "campeir"], sem: ["napoli"] },
  { nome: "Prime 9 + Fogão 3 bocas",               velho: 3064,  novo: 3214,  tem: ["9", "3 bocas"], sem: ["forno"] },
  { nome: "Prime 9 + Fogão 4 bocas",               velho: 3644,  novo: 3824,  tem: ["9", "4 bocas"], sem: ["forno"] },
  { nome: "Prime 11 + Fogão Campeirinho",          velho: 2654,  novo: 2794,  tem: ["11", "campeir"], sem: ["napoli"] },
  { nome: "Prime 11 + Fogão 3 bocas",              velho: 3164,  novo: 3324,  tem: ["11", "3 bocas"], sem: ["forno"] },
  { nome: "Prime 11 + Fogão 4 bocas",              velho: 3744,  novo: 3934,  tem: ["11", "4 bocas"], sem: ["forno"] },
  { nome: "Prime 16 + Fogão 4 bocas",              velho: 4194,  novo: 4404,  tem: ["16", "4 bocas"], sem: ["forno"] },
  { nome: "Prime 9 + Forno e Fogão 3 bocas",       velho: 4004,  novo: 4204,  tem: ["9", "forno", "3 bocas"] },
  { nome: "Prime 11 + Forno e Fogão 4 bocas",      velho: 4644,  novo: 4884,  tem: ["11", "forno", "4 bocas"] },
  { nome: "Prime 7 + Forno Napoli + Campeirinho",  velho: 3911,  novo: 4111,  tem: ["7", "napoli"] },
  { nome: "Prime 9 + Forno Napoli + Campeirinho",  velho: 4111,  novo: 4321,  tem: ["9", "napoli"] },
  // No catálogo VELHO esta página dizia "16 espetos" com 1,62 m — erro de
  // título. O novo corrige para 11 espetos (81 + 81 = 162 cm, confere).
  { nome: "Prime 11 + Forno Napoli (1,62 m)",      velho: 3104,  novo: 3264,  tem: ["napoli"] },
  { nome: "Prime 16 + Forno Napoli",               velho: 3554,  novo: 3734,  tem: ["16", "napoli"], sem: ["3 bocas"] },
  { nome: "Prime 16 + Napoli + Forno e Fogão 3",   velho: 6111,  novo: 6421,  tem: ["16", "napoli"] },
  { nome: "Tradição Gourmet + Forno Napoli",       velho: 5854,  novo: 6154,  tem: ["tradicao", "napoli"] },
  { nome: "Gourmet + Forno Napoli",                velho: 5754,  novo: 6044,  tem: ["gourmet", "napoli"] },
  { nome: "Gourmet + Fogão Campeirinho",           velho: 5304,  novo: 5574,  tem: ["gourmet", "campeir"] },
  { nome: "Gourmet + Fogão 3 bocas",               velho: 5814,  novo: 6104,  tem: ["gourmet", "3 bocas"], sem: ["forno"] },
  { nome: "Gourmet + Fogão 4 bocas",               velho: 6394,  novo: 6714,  tem: ["gourmet", "4 bocas"], sem: ["forno"] },
  { nome: "Gourmet + Forno e Fogão 3 bocas",       velho: 6754,  novo: 7094,  tem: ["gourmet", "forno", "3"] },
  { nome: "Gourmet + Forno e Fogão 4 bocas",       velho: 7294,  novo: 7664,  tem: ["gourmet", "forno", "4"] },
  { nome: "Fogão Campeirinho",                     velho: 1107,  novo: 1167,  tem: ["campeir"] },
  { nome: "Fogão Campeiro 3 bocas",                velho: 1617,  novo: 1697,  tem: ["3 bocas|3b"], sem: ["forno"] },
  { nome: "Fogão Campeiro 4 bocas",                velho: 2197,  novo: 2307,  tem: ["4 bocas|4b"], sem: ["forno"] },
  { nome: "Forno Napoli",                          velho: 1557,  novo: 1637,  tem: ["napoli"] },
  { nome: "Forno e Fogão Campeiro 3 bocas",        velho: 2557,  novo: 2687,  tem: ["forno", "3"] },
  { nome: "Forno e Fogão Campeiro 4 bocas",        velho: 3097,  novo: 3257,  tem: ["forno", "4"] },
  { nome: "Pia com cuba inox",                     velho: 957,   novo: 1007,  tem: ["pia|cuba"] },
  { nome: "Pia com cuba gourmet",                  velho: 1057,  novo: 1107,  tem: ["pia|cuba"] },
  { nome: "Balcão 1 m",                            velho: 897,   novo: 947,   tem: ["balcao"] },
  { nome: "Bancada Gourmet",                       velho: 2197,  novo: 2307,  tem: ["bancada"] },
];

const VELHOS = new Map<number, Modelo[]>();
for (const m of T) VELHOS.set(m.velho, [...(VELHOS.get(m.velho) ?? []), m]);
const NOVOS = new Set(T.map((m) => m.novo));
// Revogado = valor velho que NÃO voltou como preço de outro produto.
const REVOGADOS = [...new Set(T.map((m) => m.velho))].filter((v) => !NOVOS.has(v)).sort((a, b) => a - b);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavra = (txt: string, w: string) => new RegExp(`(^|[^a-z0-9])${w.replace(/ /g, "\\s*")}([^a-z0-9]|$)`).test(txt);
function confere(m: Modelo, nome: string): boolean {
  const n = norm(nome);
  return m.tem.every((alt) => alt.split("|").some((w) => palavra(n, w)))
    && !(m.sem ?? []).some((w) => palavra(n, w));
}
const brl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

// ── Acervo: o que entra de novo ──────────────────────────────────────────────
const CHUNKS_NOVOS: { title: string; content: string }[] = [
  {
    // Áudio da Maria (06/11): a IA deu a lista da Tradição Gourmet para uma
    // Prime 9. "Nove espetos é tradicional, daí só acompanha acabamento inox e
    // as hastes da frente."
    title: "O que acompanha a Linha Prime de espetos (7, 9, 11, 16 e 32)",
    content:
      "O QUE VEM COM AS CHURRASQUEIRAS DA LINHA PRIME POR NÚMERO DE ESPETOS (Prime 7, Prime 9, Prime 11, Prime 16, Prime 32): " +
      "acompanham SOMENTE o ACABAMENTO EM AÇO INOX e as HASTES DA FRENTE. Nada mais.\n" +
      "Elas NÃO têm suporte de fundo para espeto suspenso, NÃO têm grelha parrilla uruguaia e NÃO têm fogão embutido — esses itens são da TRADIÇÃO GOURMET e da GOURMET (Linha Exclusiva). " +
      "Nunca passe a lista de itens da Tradição Gourmet ou da Gourmet para uma Prime de espetos.\n" +
      "Se o cliente quiser suporte de fundo ou grelha numa Prime, a JR fabrica avulsos sob medida (aço carbono ou inox) — é acessório vendido à parte, com valor a confirmar pelo vendedor.",
  },
  {
    title: "Tabela de preços vigente — churrasqueiras avulsas (catálogo nov/2026)",
    content:
      "PREÇOS VIGENTES (catálogo de novembro/2026). Qualquer valor diferente destes, inclusive um que apareça antes na conversa, é da tabela ANTIGA e não vale mais.\n" +
      "LINHA POPULAR: Lisa 55x55x2,20 R$ 857; Lisa 65x55x2,20 R$ 977; Tijolinho 65x55x2,20 R$ 1.197; Tijolinho 75x55x2,20 R$ 1.297.\n" +
      "LINHA PRIME: 7 espetos (60x60x2,20) R$ 1.307; 9 espetos (74x60x2,30) R$ 1.517; 11 espetos (81x60x2,30) R$ 1.627; 16 espetos (105x60x2,50) R$ 2.097; Parrilla 81 (81x60x2,40) R$ 3.107; Parrilla 105 (105x60x2,60) R$ 3.757; 32 espetos (210x60x2,60) R$ 4.427.\n" +
      "LINHA EXCLUSIVA: Tradição (1,05x0,60x2,50) R$ 3.947; Tradição Gourmet (1,05x0,60x2,60) R$ 4.517; Gourmet (1,05x0,60x2,60) R$ 4.407; Gourmet Supreme R$ 15.647.",
  },
  {
    title: "Tabela de preços vigente — conjuntos (catálogo nov/2026)",
    content:
      "PREÇOS VIGENTES DOS CONJUNTOS (catálogo de novembro/2026). Valor diferente destes é da tabela antiga.\n" +
      "POPULAR: Lisa 55 + Fogão Campeirinho R$ 2.024; Lisa 65 + Fogão Campeirinho R$ 2.144.\n" +
      "PRIME COM FOGÃO: 7 esp. + Campeirinho R$ 2.474; 9 esp. + Campeirinho R$ 2.684; 9 esp. + Fogão 3 bocas R$ 3.214; 9 esp. + Fogão 4 bocas R$ 3.824; 11 esp. + Campeirinho R$ 2.794; 11 esp. + Fogão 3 bocas R$ 3.324; 11 esp. + Fogão 4 bocas R$ 3.934; 16 esp. + Fogão 4 bocas R$ 4.404.\n" +
      "PRIME COM FORNO: 9 esp. + Forno e Fogão 3 bocas R$ 4.204; 11 esp. + Forno e Fogão 4 bocas R$ 4.884; 7 esp. + Forno Napoli + Campeirinho R$ 4.111; 9 esp. + Forno Napoli + Campeirinho R$ 4.321; 11 esp. + Forno Napoli (1,62 m) R$ 3.264; 16 esp. + Forno Napoli (1,86 m) R$ 3.734; 16 esp. + Forno Napoli + Forno e Fogão 3 bocas (3,41 m) R$ 6.421.\n" +
      "EXCLUSIVA: Tradição Gourmet + Forno Napoli R$ 6.154; Gourmet + Forno Napoli R$ 6.044; Gourmet + Fogão Campeirinho R$ 5.574; Gourmet + Fogão 3 bocas R$ 6.104; Gourmet + Fogão 4 bocas R$ 6.714; Gourmet + Forno e Fogão 3 bocas R$ 7.094; Gourmet + Forno e Fogão 4 bocas R$ 7.664.",
  },
  {
    title: "Tabela de preços vigente — fogões, fornos, pias e bancada (catálogo nov/2026)",
    content:
      "PREÇOS VIGENTES (catálogo de novembro/2026). Valor diferente destes é da tabela antiga.\n" +
      "FOGÕES CAMPEIROS: Campeirinho (45x85x80) R$ 1.167; 3 bocas (50x110x90) R$ 1.697; 4 bocas (65x115x90) R$ 2.307.\n" +
      "FORNOS: Forno Napoli (81x60x123) R$ 1.637; Forno e Fogão Campeiro 3 bocas (155x60x115) R$ 2.687; Forno e Fogão Campeiro 4 bocas (155x70x115) R$ 3.257.\n" +
      "PIAS E COMPLEMENTOS: Pia simples com cuba inox R$ 1.007; Pia simples com cuba gourmet R$ 1.107; Balcão de 1 m R$ 947; Bancada Gourmet (135x85x105, com cuba gourmet, cesto escorredor, porta-detergente e torneira) R$ 2.307.",
  },
];

// Troca, num texto, cada "R$ <valor velho>" pelo novo — numa passada só, para
// um valor trocado nunca ser trocado de novo (3757 → 3947, e não 3757 → 3947 → …).
const PRECO_TXT = /R\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(,\d{2})?/g;
function trocaNoTexto(txt: string): { txt: string; trocas: string[] } {
  const trocas: string[] = [];
  const out = txt.replace(PRECO_TXT, (inteiro, num: string, cent: string | undefined) => {
    const v = Number(num.replace(/\./g, ""));
    const ms = VELHOS.get(v);
    if (!ms) return inteiro;
    const novo = ms[0].novo; // todos os modelos de um mesmo valor velho vão para o mesmo novo (conferido abaixo)
    const espaco = inteiro.startsWith("R$ ") ? " " : "";
    const corpo = num.includes(".") ? novo.toLocaleString("pt-BR") : String(novo);
    const r = `R$${espaco}${corpo}${cent ?? ""}`;
    trocas.push(`${inteiro} → ${r}`);
    return r;
  });
  return { txt: out, trocas };
}

function revogadosNoTexto(txt: string): number[] {
  return [...txt.matchAll(PRECO_TXT)].map((m) => Number(m[1].replace(/\./g, ""))).filter((v) => REVOGADOS.includes(v));
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

type Item = { key?: string; label?: string; amount?: number; [k: string]: unknown };

(async () => {
  // Sanidade da própria tabela: um valor velho nunca pode ir para dois novos.
  for (const [v, ms] of VELHOS) {
    if (new Set(ms.map((m) => m.novo)).size > 1) { console.error(`tabela inconsistente: ${v} → ${ms.map((m) => m.novo)}`); process.exit(1); }
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const c = await prisma.client.findFirst({ where: { name: { contains: "jr", mode: "insensitive" } }, select: { id: true, name: true } });
  if (!c) { console.error("JR não encontrada"); process.exit(1); }
  console.log(`\n══ ${c.name} — tabela nov/2026 ${commit ? "(GRAVANDO)" : "(DRY-RUN — nada é gravado)"} ══\n`);

  const pc = await prisma.pricingConfig.findUnique({ where: { clientId: c.id }, select: { rules: true } });
  if (!pc) { console.error("JR sem PricingConfig"); process.exit(1); }
  const rules = structuredClone((pc.rules ?? {}) as Record<string, unknown>);
  if (rules.tabelaPrecos === MARCA) {
    console.error(`ABORTADO: a tabela ${MARCA} já foi aplicada. Rodar de novo trocaria preços NOVOS que coincidem com velhos (ex.: Parrilla 105).`);
    process.exit(1);
  }

  const revisar: string[] = [];
  const decide = (nome: string, valor: number | null | undefined): { novo?: number; nota: string } => {
    if (valor == null) return { nota: "sem valor" };
    if (NOVOS.has(valor) && !VELHOS.has(valor)) return { nota: "já está no preço novo" };
    const ms = (VELHOS.get(valor) ?? []).filter((m) => confere(m, nome));
    if (ms.length) return { novo: ms[0].novo, nota: ms.map((m) => m.nome).join(" / ") };
    // Valor que é velho de um produto e novo de outro (ex.: 3757): se o nome é o
    // do produto NOVO, já está certo.
    if (T.some((m) => m.novo === valor && confere(m, nome))) return { nota: "já está no preço novo" };
    if (VELHOS.has(valor)) { revisar.push(`"${nome}" = ${brl(valor)} — valor de ${VELHOS.get(valor)!.map((m) => m.nome).join("/")}, mas o nome não confere`); return { nota: "REVISAR" }; }
    return { nota: "fora do catálogo (não mexe)" };
  };

  // ── 1. Motor do orçamento ──
  console.log("1) ORÇAMENTO (PricingConfig.rules)");
  let nRules = 0;
  for (const lista of ["base", "options"] as const) {
    for (const it of (Array.isArray(rules[lista]) ? rules[lista] : []) as Item[]) {
      const nome = `${it.label ?? ""} ${it.key ?? ""}`.trim();
      const d = decide(nome, it.amount);
      if (d.novo != null) { console.log(`   ✎ ${lista}/${it.key}  "${it.label}"  ${brl(it.amount!)} → ${brl(d.novo)}   [${d.nota}]`); it.amount = d.novo; nRules++; }
      else console.log(`   · ${lista}/${it.key}  "${it.label}"  ${it.amount != null ? brl(it.amount) : "—"}   (${d.nota})`);
    }
  }
  rules.precosRevogados = REVOGADOS;
  rules.tabelaPrecos = MARCA;
  console.log(`   + precosRevogados: ${REVOGADOS.length} valores (a IA não pode mais citá-los)\n`);

  // ── 2. Cadastro de produtos ──
  console.log("2) CADASTRO (CatalogItem)");
  const itens = await prisma.catalogItem.findMany({ where: { clientId: c.id }, select: { id: true, title: true, price: true } });
  const mudaItens: { id: string; price: number; title?: string }[] = [];
  for (const it of itens) {
    const d = decide(it.title, it.price);
    if (d.novo == null) { console.log(`   · "${it.title}"  ${it.price != null ? brl(it.price) : "—"}   (${d.nota})`); continue; }
    // O título errado do catálogo velho ("16 espetos" de 1,62 m) vai corrigido junto.
    const title = it.price === 3104 && /16/.test(it.title) ? it.title.replace(/16/, "11") : undefined;
    console.log(`   ✎ "${it.title}"  ${brl(it.price!)} → ${brl(d.novo)}${title ? `   título → "${title}"` : ""}`);
    mudaItens.push({ id: it.id, price: d.novo, title });
  }
  console.log("");

  // ── 3. Acervo ──
  console.log("3) ACERVO (KnowledgeChunk)");
  const chunks = await prisma.knowledgeChunk.findMany({ where: { clientId: c.id }, select: { id: true, title: true, content: true } });
  const mudaChunks: { id: string; title: string | null; content: string }[] = [];
  for (const ch of chunks) {
    const { txt, trocas } = trocaNoTexto(ch.content);
    if (!trocas.length) continue;
    console.log(`   ✎ "${ch.title}"\n        ${trocas.join("\n        ")}`);
    mudaChunks.push({ id: ch.id, title: ch.title, content: txt });
  }
  for (const n of CHUNKS_NOVOS) {
    console.log(`   ${chunks.some((x) => x.title === n.title) ? "↻" : "+"} "${n.title}"`);
  }
  console.log("");

  // ── 4. Texto do agente (prompt, regras): só AVISA — prompt se edita à mão ──
  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: c.id }, select: { customPrompt: true, rules: true, goals: true, persona: true, greetingMessage: true, followUpMessage: true, fallbackMessage: true } });
  for (const [campo, v] of Object.entries(cfg ?? {})) {
    if (typeof v !== "string") continue;
    const { trocas } = trocaNoTexto(v);
    if (trocas.length) revisar.push(`AiAgentConfig.${campo} cita preço velho: ${trocas.join(", ")} — editar à mão`);
  }

  if (revisar.length) console.log(`⚠️  REVISAR (${revisar.length}) — não foi mexido:\n   ${revisar.join("\n   ")}\n`);

  if (!commit) {
    console.log(`(DRY-RUN) orçamento: ${nRules} · cadastro: ${mudaItens.length} · acervo: ${mudaChunks.length} trocados + ${CHUNKS_NOVOS.length} novos. Rode com --commit.\n`);
    await prisma.$disconnect();
    return;
  }

  // Embeddings ANTES de gravar qualquer coisa: se a OpenAI falhar no meio, nada muda.
  const embs = new Map<string, number[]>();
  for (const ch of mudaChunks) embs.set(ch.id, await embed(`${ch.title ?? ""}\n${ch.content}`));
  const embNovos = await Promise.all(CHUNKS_NOVOS.map((n) => embed(`${n.title}\n${n.content}`)));

  await prisma.$transaction(async (tx) => {
    await tx.pricingConfig.update({ where: { clientId: c.id }, data: { rules: rules as object } });
    for (const it of mudaItens) await tx.catalogItem.update({ where: { id: it.id }, data: { price: it.price, ...(it.title ? { title: it.title } : {}) } });
    for (const ch of mudaChunks) await tx.knowledgeChunk.update({ where: { id: ch.id }, data: { content: ch.content, embedding: embs.get(ch.id)! } });
    for (const [i, n] of CHUNKS_NOVOS.entries()) {
      const existe = await tx.knowledgeChunk.findFirst({ where: { clientId: c.id, title: n.title }, select: { id: true } });
      if (existe) await tx.knowledgeChunk.update({ where: { id: existe.id }, data: { content: n.content, embedding: embNovos[i] } });
      else await tx.knowledgeChunk.create({ data: { clientId: c.id, title: n.title, content: n.content, embedding: embNovos[i] } });
    }
  }, { timeout: 60_000 });

  // ── Conferência final: nenhum preço velho pode ter sobrado em lugar nenhum ──
  const depois = await prisma.knowledgeChunk.findMany({ where: { clientId: c.id }, select: { title: true, content: true } });
  const sobrou = depois.filter((ch) => revogadosNoTexto(ch.content).length);
  console.log(`✅ gravado — orçamento: ${nRules} · cadastro: ${mudaItens.length} · acervo: ${mudaChunks.length} trocados + ${CHUNKS_NOVOS.length} novos`);
  console.log(sobrou.length ? `⚠️  ainda cita preço velho: ${sobrou.map((s) => s.title).join(", ")}` : "✅ nenhum trecho do acervo cita preço revogado");
  await prisma.$disconnect();
})().catch((e) => { console.error(String(e).slice(0, 600)); process.exit(1); });
