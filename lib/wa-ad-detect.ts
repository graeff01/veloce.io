// ── Detecção do anúncio pela mensagem de abertura ────────────────────────────
// Padrão controlado pela agência: "...anúncio do {modelo}".
// Ex.: "Olá, vim pelo anúncio do Taos Highline" → "Taos Highline".
// Centralizado aqui para ajuste fácil (engenharia: 1 ponto de verdade).

const AD_RE = /an[úu]ncio\s+(?:d[oa]s?|de)\s+(.+)/i;

// Origens que NÃO são nossos anúncios da Meta (site próprio, classificados, redes,
// outras mídias). Se o "modelo" detectado for uma dessas, NÃO é lead de anúncio
// nosso (ex.: "anúncio do site", "anúncio do auto carros").
const NON_AD_SOURCES = new Set([
  "site", "auto carros", "autocarros", "autocarro", "olx", "webmotors", "web motors",
  "mercado livre", "mercadolivre", "marketplace", "icarros", "mobiauto", "usados br",
  "usadosbr", "napista", "chaves na mao", "chavesnamao", "seminovos",
  "instagram", "insta", "facebook", "face", "tiktok", "google", "status",
  "loja", "vitrine", "patio", "jornal", "radio", "panfleto", "outdoor", "placa",
  "indicacao", "amigo", "vizinho",
]);
const normSource = (str: string) => str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Extrai o modelo/anúncio da mensagem. Retorna null se não casar o padrão OU se
// a origem detectada não for um anúncio nosso da Meta (site/marketplace/etc.).
export function detectAdModel(text: string | null | undefined): string | null {
  if (!text) return null;
  const firstLine = text.split(/\r?\n/)[0];
  const m = firstLine.match(AD_RE);
  if (!m) return null;

  // Corta no 1º fim de frase/separador — evita capturar a frase inteira
  // ("Taos Highline. Bom dia, qual o ano?" → "Taos Highline").
  let model = m[1]
    .split(/[.?!]|\s+[-–—|]\s+/)[0]
    .replace(/[\s.,;:!?¡¿"'`´~|)\]}-]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  // Nome de anúncio costuma ser curto — limita a 5 palavras.
  const words = model.split(" ");
  if (words.length > 5) model = words.slice(0, 5).join(" ");

  if (!model || model.length > 60) return null;

  // Descarta origens que não são nossos anúncios da Meta.
  const ns = normSource(model);
  if (NON_AD_SOURCES.has(ns)) return null;
  for (const b of NON_AD_SOURCES) if (ns.startsWith(b + " ")) return null;

  return model;
}

// Sinal AMPLO de lead de tráfego/anúncio pela mensagem (além do referral CTWA, que é
// checado no webhook). Captura o lead que veio de campanha mas não casou o modelo:
// frases de interesse em anúncio e links de marketplace (autocarro/olx/webmotors...).
// Usado pelo modo "ads_only" para não deixar lead de tráfego de fora.
const TRAFFIC_INTENT_RE = /(tenho interesse (neste|nesse) an[úu]ncio|interesse no an[úu]ncio|vim pelo an[úu]ncio|vi o an[úu]ncio|pelo an[úu]ncio|do an[úu]ncio|aguardo contato)/i;
const MARKETPLACE_RE = /(autocarro|webmotors|\bolx\b|mercadolivre|mercado\s*livre|icarros|usadosbr|napista|chavesnamao|seminovos|\.com\.br\/)/i;

export function looksLikeTrafficLead(text: string | null | undefined): boolean {
  if (!text) return false;
  return TRAFFIC_INTENT_RE.test(text) || MARKETPLACE_RE.test(text);
}

// Reduz um TÍTULO/headline de anúncio a um termo de busca de MODELO — pra casar no
// catálogo (o headline vem "sujo", com preço e marketing). Corta no 1º separador
// (—/-/|) ou fim de frase, remove parênteses, preço (R$…) e a condição "0km", e limita
// a ~5 palavras. Ex.: "VW Tera 0km — R$ 97.900 (abaixo da tabela)" → "VW Tera".
export function adSearchTerm(title: string | null | undefined): string {
  if (!title) return "";
  let v = title.split(/[!?\n]|\.(?=\s|$)|\s+[-–—|]\s+/)[0]; // 1º trecho (o "." de "1.0" não corta)
  v = v.replace(/\(.*?\)/g, " ");                  // remove parênteses "(abaixo da tabela)"
  v = v.replace(/r\$\s*[\d.,]+/gi, " ");           // remove preço solto "R$ 97.900"
  v = v.replace(/\b(?:0\s?km|zero\s?km|okm)\b/gi, " "); // remove condição "0km"
  v = v.replace(/\s+/g, " ").trim();
  return v.split(" ").filter(Boolean).slice(0, 5).join(" ");
}
