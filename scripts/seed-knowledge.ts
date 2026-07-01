/**
 * Popula o Conhecimento (KnowledgeChunk) de um cliente com FAQ, gerando embeddings
 * (text-embedding-3-small) para o RAG. Idempotente: upsert por título.
 * Requer OPENAI_API_KEY + DATABASE_PUBLIC_URL no ambiente.
 * Uso: OPENAI_API_KEY=... DATABASE_URL=... npx tsx scripts/seed-knowledge.ts <nomeCliente> [--commit]
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const clientName = process.argv[2] || "boqueir";
const commit = process.argv.includes("--commit");
const KEY = process.env.OPENAI_API_KEY;
const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!KEY) { console.error("OPENAI_API_KEY ausente"); process.exit(1); }
if (!url) { console.error("DATABASE_URL ausente"); process.exit(1); }

// FAQ da Boqueirão Veículos (fonte: site oficial + perfil Autocarro).
const CHUNKS: { title: string; content: string }[] = [
  { title: "Localização e horário", content: "A Boqueirão Veículos fica na Av. Boqueirão, 1705, bairro Mal. Rondon, em Canoas/RS. Horário de funcionamento: de segunda a sexta das 8h30 às 18h, aos sábados das 8h30 às 12h, e aos domingos a loja não abre. A visita é gratuita e sem compromisso." },
  { title: "Contato", content: "Telefone e WhatsApp da Boqueirão Veículos: (51) 3478-5521. E-mail: boqueiraoveiculosrs@gmail.com. Instagram: @boqueiraoveiculosrs. Facebook: Boqueirão Veículos." },
  { title: "Sobre a loja", content: "A Boqueirão Veículos é uma empresa familiar, há 11 anos em Canoas/RS e com raízes no mercado automotivo desde 1994. Trabalha com carros usados e seminovos de várias marcas, todos revisados e com procedência. O estoque tem cerca de 40 modelos de 12 marcas: Chevrolet, Fiat, Ford, Honda, Hyundai, Jeep, Nissan, Peugeot, Toyota, Volkswagen, Citroën e Caoa Chery." },
  { title: "Garantia e procedência", content: "Todos os veículos da Boqueirão são revisados e com procedência. Garantia: veículos ano 2018 em diante têm 1 ano de garantia de motor e câmbio (caixa), podendo chegar a 2 anos; veículos até 2017 têm 3 meses de garantia de motor e câmbio (caixa). Os detalhes da garantia de cada veículo são confirmados com o vendedor." },
  { title: "Financiamento", content: "A Boqueirão trabalha com mais de 13 bancos parceiros, buscando as melhores taxas, com aprovação rápida — é possível sair com o veículo no mesmo dia. A simulação pode ser feita pelo site ou direto com o vendedor. A loja aceita veículo na troca como parte do pagamento ou da entrada. Os valores de entrada e parcelas são fechados pelo vendedor." },
  { title: "Troca de veículo", content: "A Boqueirão avalia o seu usado para troca. A avaliação é presencial e gratuita, e o valor do seu veículo pode ser usado como entrada na compra de outro. Leve o documento do veículo (CRLV) para agilizar." },
];

async function embed(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!res.ok) throw new Error(`embeddings ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

(async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString: url })) });
  const client = await prisma.client.findFirst({ where: { name: { contains: clientName, mode: "insensitive" } }, select: { id: true, name: true } });
  if (!client) { console.error(`Cliente "${clientName}" não encontrado`); process.exit(1); }
  const before = await prisma.knowledgeChunk.count({ where: { clientId: client.id } });
  console.log(`${client.name} — conhecimento atual: ${before} trecho(s)${commit ? "" : "  (DRY-RUN)"}\n`);

  let created = 0, updated = 0;
  for (const ch of CHUNKS) {
    console.log(`  • ${ch.title}`);
    if (!commit) continue;
    const embedding = await embed(`${ch.title}\n${ch.content}`);
    const existing = await prisma.knowledgeChunk.findFirst({ where: { clientId: client.id, title: ch.title }, select: { id: true } });
    if (existing) { await prisma.knowledgeChunk.update({ where: { id: existing.id }, data: { content: ch.content, embedding } }); updated++; }
    else { await prisma.knowledgeChunk.create({ data: { clientId: client.id, title: ch.title, content: ch.content, embedding } }); created++; }
  }
  console.log(commit ? `\n✅ Criados: ${created} · atualizados: ${updated}` : `\n(DRY-RUN) ${CHUNKS.length} trechos prontos. Rode com --commit.`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
