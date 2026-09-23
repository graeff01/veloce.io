// ── O produto do anúncio tem de SER o do anúncio ─────────────────────────────
// O contexto injeta no prompt, com toda a confiança do mundo:
//
//   "VEÍCULO DE INTERESSE (o lead entrou por ESTE anúncio): <item>"
//
// e o prompt manda, quando o lead só sinaliza interesse, mandar a FOTO e o PREÇO
// desse item. O item vinha do PRIMEIRO resultado de uma busca fuzzy pelo título
// do anúncio — sem conferir se é o mesmo produto.
//
// O QUE ISSO PRODUZIA (medido em produção, 23/09/2026):
//
//   Boqueirão · anúncio "Taos Highline"
//     → injetava "Volkswagen T-cross 1.4 HIGHLINE TSI 16V 2021"
//     O lead veio de um anúncio da Taos e a IA recebia um T-Cross como certeza.
//     O prompt automotivo proíbe exatamente isso, em caixa alta: "Modelos de nome
//     PARECIDO são carros DIFERENTES (Tera ≠ Taos, Nivus ≠ Virtus) — jamais troque
//     um pelo outro". O motor fazia o que o prompt proíbe.
//
//   JR · anúncio institucional "JR Churrasqueiras Pre moldadas" (191 dos 200 leads)
//     → injetava "Churrasqueira Parrilla 81x60 — R$ 2957"
//   JR · "fb.com"
//     → injetava "Pia Simples com Cuba Inox"
//
// A REGRA: o título do item precisa conter TODOS os tokens distintivos do termo
// do anúncio. "Taos Highline" exige taos E highline — o T-Cross tem highline e
// não tem taos, então cai. "JR Churrasqueiras Pre moldadas" exige moldadas, que
// nenhum item tem, então nada é injetado.
//
// Assimetria deliberada: preferir NÃO injetar a injetar errado. Sem injeção a IA
// descobre o produto na conversa — que é o caminho normal. Com injeção errada ela
// afirma, manda foto e preço do produto errado, e o lead confia.
//
// Módulo PURO — testável em tests/anuncio-produto.test.ts.

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Tokens que NÃO identificam produto: marca do anunciante, palavras de campanha,
// e o pedaço de conversa que o extrator de adModel às vezes captura junto
// ("churrasqueira gourmet e gostaria de"). Ficar de fora significa que a
// presença deles não é exigida no título do item.
const GENERICOS = new Set([
  // campanha / origem
  "anuncio", "anuncios", "status", "facebook", "instagram", "insta", "face", "fb", "com", "br",
  "promocao", "promo", "oferta", "ofertas", "novo", "nova", "novos", "novas", "lancamento",
  "video", "tour", "carrossel", "planta", "foto", "fotos", "link", "site", "whatsapp", "zap",
  // conversa capturada por engano
  "bom", "boa", "dia", "tarde", "noite", "gostaria", "queria", "quero", "qual", "quanto",
  "valor", "valores", "preco", "precos", "ano", "km", "info", "informacao", "informacoes",
  "saber", "sobre", "para", "pra", "com", "sem", "por", "das", "dos", "uma", "uns", "tem",
  "seu", "sua", "teu", "tua", "aqui", "esta", "esse", "essa", "isso", "mais", "tudo",
  "premium", "exclusiva", "exclusivas", "exclusivo", "exclusivos",
]);

/**
 * Corta a CAUDA do termo no primeiro separador forte.
 *
 * O título do anúncio vem como "Modelo - slogan" e o adModel às vezes leva
 * conversa junto ("Taos Highline. Bom dia qual o ano"). A cauda não identifica
 * produto e, exigida, barrava o modelo certo: "Taos Highline - Teu SUV premium tá
 * aqui!" exigia "suv" e rejeitava a Taos do catálogo.
 *
 * Enumerar as palavras da cauda é corrida perdida — cortar no separador não é.
 */
function semCauda(termo: string): string {
  const corte = termo.search(/\s+[-–—|:]\s+|[.!?|]/);
  return corte > 0 ? termo.slice(0, corte) : termo;
}

/** Tokens do termo que de fato identificam um produto. */
export function tokensDistintivos(termo: string): string[] {
  return semAcento(semCauda(termo))
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !GENERICOS.has(t));
}

export interface ItemCatalogo { title: string }

/**
 * Escolhe o item do catálogo que REALMENTE corresponde ao anúncio, ou null.
 *
 * `itens` é o resultado da busca do catálogo, na ordem em que ela devolveu. O
 * primeiro que contiver todos os tokens distintivos vence; se nenhum contiver,
 * devolve null e nada é injetado.
 *
 * Termo sem token distintivo nenhum (anúncio institucional puro, "fb.com") também
 * devolve null: um termo que não identifica produto não pode escolher produto.
 */
export function produtoDoAnuncio<T extends ItemCatalogo>(termo: string, itens: T[]): T | null {
  const tokens = tokensDistintivos(termo);
  if (!tokens.length || !itens.length) return null;
  for (const item of itens) {
    const titulo = semAcento(item.title).replace(/[^a-z0-9]+/g, " ");
    const temTodos = tokens.every((t) => new RegExp(`(^| )${t}`).test(titulo));
    if (temTodos) return item;
  }
  return null;
}
