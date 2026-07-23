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

// Tokens significativos do termo (>=3 chars OU número, sem stopwords). Puro/testável.
// Números curtos (7, 9, 11, 32) são MANTIDOS — eles diferenciam modelos (ex.: Prime 7 vs
// Prime 9 espetos). Antes, o filtro >=3 descartava o "9" e a busca casava o modelo errado.
export function catalogTokens(termo: string): string[] {
  return (termo || "").toLowerCase().split(/[^a-z0-9.à-ú]+/i).filter((t) => (t.length >= 3 || /^\d+$/.test(t)) && !STOP.has(t));
}

const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Cor pedida no termo → radical p/ casar com o atributo "cor" do item (preto/preta→"pret").
const COLOR_STEMS: Record<string, string> = {
  preto: "pret", preta: "pret", branco: "branc", branca: "branc", prata: "prata",
  vermelho: "vermelh", vermelha: "vermelh", cinza: "cinz", azul: "azul", verde: "verde",
  amarelo: "amarel", amarela: "amarel", dourado: "dourad", dourada: "dourad",
  bege: "bege", marrom: "marrom", vinho: "vinho",
};

// Extrai a cor pedida (radical) do termo, se houver. Puro/testável.
export function requestedColorStem(termo: string): string | null {
  for (const w of norm(termo).split(/[^a-z0-9]+/i)) if (COLOR_STEMS[w]) return COLOR_STEMS[w];
  return null;
}

function colorMatches(attributes: unknown, stem: string): boolean {
  const a = attributes as Record<string, unknown> | null;
  const cor = a && typeof a.cor === "string" ? norm(a.cor) : "";
  return cor.startsWith(stem);
}

const SELECT = { take: 6, orderBy: { price: "asc" as const } };
const FUZZY_MIN = 0.4; // calibrado contra o estoque real (typo "lauching" ~0.58–0.69)

interface Row { id: string; title: string; price: number | null; attributes: unknown; imageUrl: string | null; url: string | null; images: string[] }

export async function searchCatalog(clientId: string, termo: string) {
  const base = { clientId, available: true };
  const tokens = catalogTokens(termo);
  const stem = requestedColorStem(termo);
  // Se o lead pediu uma COR e ela EXISTE entre os matches, devolve só as unidades daquela cor
  // (determinístico: a IA não tem como negar/confundir). Se a cor não existe, devolve tudo.
  const applyColor = <T extends { attributes: unknown }>(items: T[]): T[] => {
    if (!stem) return items;
    const matched = items.filter((i) => colorMatches(i.attributes, stem));
    return matched.length ? matched : items;
  };

  if (tokens.length === 0) {
    const t = (termo || "").trim();
    const items = await prisma.catalogItem.findMany({ where: t && !stem ? { ...base, title: { contains: t, mode: "insensitive" } } : base, ...SELECT });
    return applyColor(items);
  }

  // 1) Exato: todos os tokens no título (qualquer ordem). Ordena por RELEVÂNCIA — o título
  // mais "focado" primeiro (menos palavras extras): p/ "gourmet", "Churrasqueira Gourmet"
  // (2 palavras) vence "Pia Simples com Cuba Gourmet" (5). Empate → mais barato. Sem isso,
  // ordenar só por preço fazia o acessório mais barato ganhar do produto principal.
  const exact = await prisma.catalogItem.findMany({
    where: { ...base, AND: tokens.map((t) => ({ title: { contains: t, mode: "insensitive" as const } })) },
    take: 12, orderBy: { price: "asc" },
  });
  if (exact.length > 0) {
    const wc = (s: string) => (s || "").trim().split(/\s+/).length;
    // Produto PRINCIPAL primeiro: quando um termo ambíguo casa uma churrasqueira E um
    // acessório (ex.: "gourmet" → Churrasqueira Gourmet vs Bancada Gourmet), a churrasqueira
    // ganha. Só afeta catálogos com títulos "Churrasqueira ..." (outros clientes: sem efeito).
    const isChurr = (s: string) => /^churrasqueira\b/i.test(s || "");
    const ranked = [...exact].sort((a, b) =>
      (isChurr(b.title) ? 1 : 0) - (isChurr(a.title) ? 1 : 0)
      || wc(a.title) - wc(b.title)
      || (a.price ?? 1e12) - (b.price ?? 1e12));
    return applyColor(ranked.slice(0, 6));
  }

  // 2) Fuzzy: tolera typo no termo ou no dado (pg_trgm). Ordena por similaridade.
  const fuzzy = await prisma.$queryRaw<Row[]>`
    SELECT id, title, price, attributes, "imageUrl", url, images
    FROM "CatalogItem"
    WHERE "clientId" = ${clientId} AND available = true
      AND word_similarity(${termo}, title) > ${FUZZY_MIN}
    ORDER BY word_similarity(${termo}, title) DESC
    LIMIT 6`;
  return applyColor(fuzzy);
}
