// ── Camada de segurança · Anel 1: normalização de SOMBRA ──────────────────────
// Classe A do RFC (docs/rfc-camada-seguranca-ia.md): o texto que vai ao MODELO
// NÃO é alterado. Aqui produzimos apenas uma versão "sombra" do texto, usada
// exclusivamente pelos DETECTORES (injeção, egress, guardrail). Assim o atacante
// deixa de conseguir esconder o payload dos detectores com caracteres invisíveis,
// e o comportamento do atendimento continua byte-a-byte o mesmo.
//
// Módulo PURO (sem I/O) — testável em tests/security-sanitize.test.ts.

// Invisíveis e controles de direção: soft hyphen, zero-width, joiners e marcas bidi
// (o vetor clássico de "instrução escondida" que o olho humano não vê no WhatsApp).
// Montamos a classe a partir dos PONTOS DE CÓDIGO — pôr o literal no fonte deixaria
// o próprio arquivo com caracteres invisíveis (impossível de revisar em code review).
const INVISIBLE_RANGES: [number, number][] = [
  [0x00ad, 0x00ad], // soft hyphen
  [0x200b, 0x200f], // ZWSP, ZWNJ, ZWJ, LRM, RLM
  [0x202a, 0x202e], // LRE, RLE, PDF, LRO, RLO (bidi override)
  [0x2060, 0x2064], // word joiner, invisible times/separator/plus
  [0x2066, 0x206f], // LRI/RLI/FSI/PDI + deprecated formatting
  [0xfeff, 0xfeff], // BOM / ZWNBSP
];
const rangeClass = (ranges: [number, number][]) =>
  ranges.map(([a, b]) => (a === b ? `\\u${a.toString(16).padStart(4, "0")}` : `\\u${a.toString(16).padStart(4, "0")}-\\u${b.toString(16).padStart(4, "0")}`)).join("");
const INVISIBLE_RE = new RegExp(`[${rangeClass(INVISIBLE_RANGES)}]`, "g");
// Tag characters (plano 14) — usados para embutir texto totalmente invisível.
const TAG_CHARS_RE = /[\u{E0000}-\u{E007F}]/gu;

// Homoglifos comuns (cirílico/grego → latino). Só os que aparecem em ataques reais
// de português; a tabela é curta de propósito (falso-positivo custa caro).
const HOMOGLYPHS: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "у": "y", "і": "i", "ѕ": "s", "ԁ": "d", "ո": "n",
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X",
  "α": "a", "ο": "o", "ρ": "p", "ε": "e", "ι": "i", "κ": "k", "ν": "v", "τ": "t", "υ": "u", "χ": "x",
};
const HOMOGLYPH_RE = new RegExp(`[${Object.keys(HOMOGLYPHS).join("")}]`, "g");

export interface InvisibleReport {
  count: number;
  kinds: string[]; // invisible | tag | homoglyph
}

// Quais classes de caractere não-semântico o texto carrega (telemetria de ataque).
export function invisibleReport(text: string): InvisibleReport {
  const t = text ?? "";
  const kinds: string[] = [];
  let count = 0;
  const inv = t.match(INVISIBLE_RE)?.length ?? 0;
  const tag = t.match(TAG_CHARS_RE)?.length ?? 0;
  const hom = t.match(HOMOGLYPH_RE)?.length ?? 0;
  if (inv) { kinds.push("invisible"); count += inv; }
  if (tag) { kinds.push("tag"); count += tag; }
  if (hom) { kinds.push("homoglyph"); count += hom; }
  return { count, kinds };
}

// Sombra canônica: NFKC + remoção de invisíveis + dobra de homoglifos + minúsculas
// sem acento. É SÓ para detecção — nunca substitui o texto do atendimento.
export function securityShadow(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .replace(TAG_CHARS_RE, "")
    .replace(INVISIBLE_RE, "")
    .replace(HOMOGLYPH_RE, (c) => HOMOGLYPHS[c] ?? c)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Variante que junta letras separadas artificialmente ("d e s c o n t o" → "desconto"),
// usada só para casar padrões de evasão. Sequências de 4+ letras isoladas viram palavra.
export function collapseSpacedLetters(shadow: string): string {
  return shadow.replace(/(?:\b[a-z0-9]\s+){3,}[a-z0-9]\b/g, (m) => m.replace(/\s+/g, ""));
}

// Conteúdo codificado embutido (base64/hex longos) — devolve os blocos decodificáveis
// para o detector olhar dentro. Limitado para não virar custo de CPU.
export function decodeEmbedded(shadow: string, max = 3): string[] {
  const out: string[] = [];
  const b64 = shadow.match(/[a-z0-9+/]{40,}={0,2}/gi) ?? [];
  for (const block of b64.slice(0, max)) {
    try {
      const decoded = Buffer.from(block, "base64").toString("utf8");
      // Só interessa se decodificou para texto legível (evita ruído binário).
      if (/^[\x20-\x7EÀ-ſ\s]{8,}$/.test(decoded)) out.push(decoded.toLowerCase());
    } catch { /* bloco não é base64 válido */ }
  }
  return out;
}

// Teto de tamanho preservando início e fim (o meio é onde se esconde payload longo,
// mas cortar o fim perderia a instrução final — mantemos as duas pontas).
export function clampText(text: string | null | undefined, max: number): string {
  const t = text ?? "";
  if (t.length <= max) return t;
  const head = Math.floor(max * 0.7);
  const tail = max - head - 3;
  return `${t.slice(0, head)}...${t.slice(-tail)}`;
}
