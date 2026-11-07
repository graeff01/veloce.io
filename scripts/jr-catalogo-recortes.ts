/**
 * Gera recortes do catálogo da JR (pedido do Douglas, aprovado pela Maria em
 * 17/09: "pode ser por PDF separado mesmo").
 *
 * Em vez de mandar o catálogo inteiro para quem quer uma coisa só, manda o pedaço certo.
 * Recorta o PDF DELA — então o design, as fotos e a diagramação são os mesmos.
 * O corte é por página inteira, então o recorte nunca parte um modelo ao meio.
 *
 * RODA OFFLINE, de propósito: os arquivos são estáticos em public/catalogo/. Nada
 * é gerado em runtime — zero CPU e zero memória no Railway por atendimento.
 * Quando a Maria mandar catálogo novo, substitua o mestre e rode isto de novo.
 *
 *   npx tsx scripts/jr-catalogo-recortes.ts
 */
import { PDFDocument } from "pdf-lib";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "public", "catalogo");
const MESTRE = join(DIR, "catalogo-jr.pdf");

const CAPA = 1;
const CONTATO = 20; // última página: endereço, CNPJ, redes
const PAGINAS = 20;

/**
 * Faixas conferidas página a página no catálogo de NOV/2026 (preços novos).
 * O catálogo antigo tinha 43 páginas, um modelo por página; este tem 20, quase
 * sempre dois a quatro modelos por página.
 *
 * A Gourmet Supreme (p8) fica FORA do corte geral de churrasqueiras: a Maria
 * pediu para não oferecê-la por padrão, porque o preço (R$ 15.647) assusta quem
 * não está procurando churrasqueira rotativa/automatizada.
 */
const RECORTES: { arquivo: string; titulo: string; paginas: number[] }[] = [
  { arquivo: "jr-conjuntos-com-fogao.pdf", titulo: "Conjuntos (churrasqueira + fogão/forno)", paginas: faixa(9, 15) },
  { arquivo: "jr-churrasqueiras.pdf",      titulo: "Churrasqueiras avulsas",                 paginas: faixa(2, 7) },
  { arquivo: "jr-fogoes-e-fornos.pdf",     titulo: "Fogões campeiros e fornos",              paginas: faixa(16, 17) },
  { arquivo: "jr-complementos.pdf",        titulo: "Pias, balcão e bancada",                 paginas: faixa(18, 19) },
];

function faixa(a: number, b: number): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

async function main() {
  const bytes = await readFile(MESTRE);
  const mestre = await PDFDocument.load(bytes);
  const total = mestre.getPageCount();
  console.log(`mestre: ${MESTRE.replace(process.cwd() + "/", "")} · ${total} páginas · ${(bytes.length / 1048576).toFixed(1)} MB\n`);

  if (total !== PAGINAS) {
    console.error(`⚠️  O mestre tem ${total} páginas, não ${PAGINAS}. As faixas foram conferidas num catálogo de ${PAGINAS}.`);
    console.error(`    Confira o mapa de páginas antes de gerar, senão os recortes saem trocados.`);
    process.exit(1);
  }

  for (const r of RECORTES) {
    const doc = await PDFDocument.create();
    doc.setTitle(`JR Churrasqueiras — ${r.titulo}`);
    // Capa e contato entram sempre: o recorte continua sendo um catálogo, não um retalho.
    const indices = [CAPA, ...r.paginas, CONTATO].map((p) => p - 1);
    for (const pg of await doc.copyPages(mestre, indices)) doc.addPage(pg);
    const out = await doc.save();
    await writeFile(join(DIR, r.arquivo), out);
    console.log(`✓ ${r.arquivo.padEnd(30)} ${String(indices.length).padStart(2)} pág · ${(out.length / 1048576).toFixed(1)} MB · ${r.titulo}`);
  }

  console.log(`\nPróximo passo: publicar e apontar a config para cada arquivo.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
