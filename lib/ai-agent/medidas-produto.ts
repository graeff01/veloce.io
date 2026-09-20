// ── Medida certa PARA AQUELE produto ─────────────────────────────────────────
// O guarda anterior conferia se o número existia no acervo. Isso pega "Prime 9
// tem 90 cm" (90 não existe), mas deixa passar "Prime 9 tem 84 cm" — 84 é
// medida legítima de outra peça. E o cliente compra achando que cabe.
//
// Aqui a conferência é por PRODUTO. A fonte é a tabela do próprio acervo, que
// já vem num formato fechado:
//
//   • Linha Prime 9 espetos ....... 74 x 60 x 230
//
// Nada é cravado no motor: a tabela é lida do conhecimento do cliente.
//
// Módulo PURO — testável em tests/medidas-produto.test.ts.

export interface MedidaProduto { produto: string; largura: number; profundidade: number; altura: number }

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// "• Linha Prime 9 espetos ....... 74 x 60 x 230" — pontinhos ou espaços.
const LINHA_RE = /^[•\-*\s]*([A-Za-zÀ-ÿ0-9][^.\n]*?)\s*[.\s]{3,}\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*$/;

export function lerTabelaMedidas(texto: string): MedidaProduto[] {
  const out: MedidaProduto[] = [];
  for (const linha of (texto ?? "").split(/\r?\n/)) {
    const m = LINHA_RE.exec(linha.trim());
    if (!m) continue;
    const [, produto, l, p, a] = m;
    const nome = produto.trim();
    if (nome.length < 3 || nome.length > 60) continue;
    out.push({ produto: nome, largura: Number(l), profundidade: Number(p), altura: Number(a) });
  }
  return out;
}

/** Qual produto da tabela a frase menciona? O nome mais específico vence. */
export function produtoNaFrase(frase: string, tabela: MedidaProduto[]): MedidaProduto | null {
  const f = semAcento(frase);
  let achado: MedidaProduto | null = null;
  for (const m of tabela) {
    // "Linha Prime 9 espetos" casa "prime 9". Reduz ao miolo: marca + número.
    const chave = semAcento(m.produto).replace(/^linha\s+/, "").replace(/\s+espetos?$/, "");
    if (!chave) continue;
    const re = new RegExp(`\\b${chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`);
    if (re.test(f) && (!achado || chave.length > semAcento(achado.produto).length)) achado = m;
  }
  return achado;
}

const DIM_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|m)\b[^.!?\n]{0,10}?\bde\s+(largura|profundidade|altura)/gi;

/**
 * Medidas que a frase afirma para um produto da tabela e que NÃO batem.
 * Tolerância de 1cm — arredondamento de metro para centímetro.
 */
export function medidasErradasDoProduto(reply: string, tabela: MedidaProduto[]): string[] {
  if (!tabela.length) return [];
  const erros: string[] = [];
  for (const frase of (reply ?? "").split(/(?<=[.!?;])\s+|\n+/)) {
    const prod = produtoNaFrase(frase, tabela);
    if (!prod) continue;
    for (const m of frase.matchAll(DIM_RE)) {
      const n = parseFloat(m[1].replace(",", "."));
      if (!isFinite(n) || n <= 0) continue;
      const cm = (m[2] ?? "").toLowerCase() === "m" ? n * 100 : n;
      const esperado = m[3].toLowerCase().startsWith("larg") ? prod.largura
        : m[3].toLowerCase().startsWith("prof") ? prod.profundidade : prod.altura;
      if (Math.abs(cm - esperado) > 1) {
        erros.push(`${prod.produto}: disse ${m[1]}${m[2]} de ${m[3]}, é ${esperado}cm`);
      }
    }
  }
  return erros;
}
