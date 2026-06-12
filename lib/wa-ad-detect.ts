// ── Detecção do anúncio pela mensagem de abertura ────────────────────────────
// Padrão controlado pela agência: "...anúncio do {modelo}".
// Ex.: "Olá, vim pelo anúncio do Taos Highline" → "Taos Highline".
// Centralizado aqui para ajuste fácil (engenharia: 1 ponto de verdade).

const AD_RE = /an[úu]ncio\s+(?:d[oa]s?|de)\s+(.+)/i;

// Extrai o modelo/anúncio da mensagem. Retorna null se não casar o padrão.
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
  return model;
}
