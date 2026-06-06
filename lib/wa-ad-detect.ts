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

  const model = m[1]
    .replace(/[\s.,;:!?¡¿"'`´~|)\]}-]+$/u, "") // pontuação/símbolos no fim
    .replace(/\s+/g, " ")
    .trim();

  if (!model || model.length > 60) return null;
  return model;
}
