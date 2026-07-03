import { prisma } from "@/lib/prisma";

// ── Busca de catálogo robusta (exata + tolerante a erro de digitação) ──────────
// O `title contains termo` (substring única) falhava quando o termo do LLM tinha
// palavras não contíguas no título, OU quando o DADO DE ORIGEM tem typo (ex.: o
// anúncio veio escrito "LAUCHING EDITION" sem o N). Estratégia:
//   1) tokeniza e exige TODOS os tokens no título (qualquer ordem) — preciso;
//   2) se 0, busca FUZZY por similaridade de trigramas (pg_trgm) — tolera typo.

const STOP = new Set([
  "ano", "por", "com", "valor", "preco", "preço", "quanto", "tem", "esse", "essa",
  "disponivel", "disponível", "carro", "veiculo", "veículo", "modelo", "quero", "qual",
  "quais", "versao", "versão", "dele", "dela", "sobre", "mais", "detalhes", "gostaria",
  "cor", "ainda", "aqui", "tipo", "tinha", "queria", "ficha", "fotos", "foto", "dentro", "interior",
  // cores ficam nos ATRIBUTOS, não no título — não exigir no match (senão "Tera preto" acha 0)
  "preto", "preta", "branco", "branca", "prata", "prato", "vermelho", "vermelha", "cinza",
  "azul", "verde", "amarelo", "amarela", "dourado", "dourada", "bege", "marrom", "vinho",
]);

// Tokens significativos do termo (>=3 chars, sem stopwords). Puro/testável.
export function catalogTokens(termo: string): string[] {
  return (termo || "").toLowerCase().split(/[^a-z0-9.à-ú]+/i).filter((t) => t.length >= 3 && !STOP.has(t));
}

const SELECT = { take: 6, orderBy: { price: "asc" as const } };
const FUZZY_MIN = 0.4; // calibrado contra o estoque real (typo "lauching" ~0.58–0.69)

interface Row { id: string; title: string; price: number | null; attributes: unknown; imageUrl: string | null; url: string | null; images: string[] }

export async function searchCatalog(clientId: string, termo: string) {
  const base = { clientId, available: true };
  const tokens = catalogTokens(termo);

  if (tokens.length === 0) {
    const t = (termo || "").trim();
    return prisma.catalogItem.findMany({ where: t ? { ...base, title: { contains: t, mode: "insensitive" } } : base, ...SELECT });
  }

  // 1) Exato: todos os tokens no título (qualquer ordem).
  const exact = await prisma.catalogItem.findMany({
    where: { ...base, AND: tokens.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })) },
    ...SELECT,
  });
  if (exact.length > 0) return exact;

  // 2) Fuzzy: tolera typo no termo ou no dado (pg_trgm). Ordena por similaridade.
  return prisma.$queryRaw<Row[]>`
    SELECT id, title, price, attributes, "imageUrl", url, images
    FROM "CatalogItem"
    WHERE "clientId" = ${clientId} AND available = true
      AND word_similarity(${termo}, title) > ${FUZZY_MIN}
    ORDER BY word_similarity(${termo}, title) DESC
    LIMIT 6`;
}
