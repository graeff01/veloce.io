// ── Preço certo PARA AQUELE produto ──────────────────────────────────────────
// Irmão de medidas-produto.ts e capacidade-produto.ts, para o dado que mais
// custa: PREÇO.
//
// O grounding confere se o número EXISTE (na tabela, no acervo, na conversa).
// Isso pega o preço inventado, mas deixa passar o preço REAL do produto ERRADO:
// "a Prime 9 sai por R$ 1.627" passa, porque R$ 1.627 é o preço legítimo da
// Prime 11. O cliente fecha achando que paga um valor, e o orçamento sai com
// outro. Foi o padrão dos erros da JR em nov/2026: a lista de itens da Tradição
// Gourmet dada para a Prime 9, a soma de peças no lugar do preço do conjunto.
//
// A FONTE É A TABELA DO ORÇAMENTO (PricingConfig.rules base + options) — a mesma
// que calcula o PDF. Nada de nome de produto cravado aqui: os nomes vêm dos
// rótulos do próprio cliente.
//
// COMO JULGA. Cada "R$ X" da resposta é julgado pelos produtos nomeados no
// TRECHO que vem logo antes dele (desde o preço anterior ou o fim da frase
// anterior). Entre os produtos da tabela cujo nome aparece inteiro no trecho,
// vale o MAIS ESPECÍFICO: "Tradição Gourmet" vence "Gourmet"; "Prime 9 + Forno e
// Fogão 3 bocas" vence "Prime 9". O preço tem de ser o desse produto.
//
// O QUE NÃO É JULGADO, de propósito: valor calculado (frete, montagem, total,
// desconto, parcela, entrada) e trecho que não nomeia produto da tabela. Esses
// continuam com o grounding normal.
//
// Módulo PURO — testável em tests/preco-produto.test.ts.

export interface PrecoProduto {
  produto: string; valor: number;
  tokens: string[];     // TODAS as palavras do rótulo
  exigidos: string[];   // as que precisam aparecer (ver "família" em lerTabelaPrecos)
  combo: boolean;       // rótulo de conjunto ("Prime 9 + Fogão 3 bocas")
}

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Palavras que não distinguem um produto de outro. "campeiro" sai porque o
// cliente e a IA dizem "fogão 3 bocas" tanto quanto "fogão campeiro de 3 bocas".
const VAZIAS = new Set([
  "churrasqueira", "churrasqueiras", "linha", "modelo", "conjunto", "kit", "com", "de", "do", "da", "dos", "das",
  "e", "mais", "a", "o", "em", "para", "pra", "espeto", "espetos", "esp", "campeiro", "campeira", "cm", "m",
  "x", "tipo", "unidade", "un", "sem", "frete", "sim",
]);

// Grafias que viram UM token, para "forno e fogão" não se confundir com "forno"
// + "fogão" soltos, nem "forno napoli" com qualquer forno.
function canonico(texto: string): string {
  return semAcento(texto)
    .replace(/\([^)]*\)/g, " ")                 // medidas entre parênteses
    .replace(/(\d)([a-z])/g, "$1 $2").replace(/([a-z])(\d)/g, "$1 $2") // "55cm" → "55 cm"
    .replace(/\d+[.,]?\d*\s*[x×]\s*\d+[.,]?\d*(\s*[x×]\s*\d+[.,]?\d*)?/g, " ") // 74x60x2,30
    .replace(/\bforno\s+e\s+fogao\b/g, " fornofogao ")
    .replace(/\bforno\s+napoli\b/g, " napoli ")
    .replace(/\bfogao\s+campeirinho\b/g, " campeirinho ")
    .replace(/\bbocas?\b/g, " bocas ")
    .replace(/[^a-z0-9]+/g, " ");
}

export function tokensDe(texto: string): string[] {
  return [...new Set(canonico(texto).split(" ").filter((t) => t && !VAZIAS.has(t)))];
}

type Regra = { label?: unknown; key?: unknown; amount?: unknown };

/** Lê a tabela do orçamento (base + options). Rótulo sem token útil fica fora. */
export function lerTabelaPrecos(regras: unknown): PrecoProduto[] {
  const r = (regras ?? {}) as { base?: unknown; options?: unknown };
  const out: PrecoProduto[] = [];
  for (const lista of [r.base, r.options]) {
    if (!Array.isArray(lista)) continue;
    for (const it of lista as Regra[]) {
      const valor = typeof it?.amount === "number" ? it.amount : NaN;
      const produto = typeof it?.label === "string" ? it.label : "";
      if (!produto || !isFinite(valor) || valor <= 0) continue;
      const tokens = tokensDe(produto);
      if (!tokens.length) continue;
      out.push({ produto, valor, tokens, exigidos: tokens, combo: /\+|\bcom\b/i.test(produto) });
    }
  }
  // FAMÍLIA: palavra (não número) que aparece em 30%+ dos rótulos é nome de linha,
  // não de modelo — "Prime" está em metade da tabela da JR. Ninguém fala "Prime
  // Parrilla de 105": fala "Parrilla de 105". Exigir a família deixava passar
  // o preço errado. Ela conta se aparecer, mas não é obrigatória.
  const freq = new Map<string, number>();
  for (const p of out) for (const t of p.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  const familia = new Set([...freq].filter(([t, n]) => !/^\d+$/.test(t) && out.length >= 6 && n / out.length >= 0.3).map(([t]) => t));
  for (const p of out) {
    const exigidos = p.tokens.filter((t) => !familia.has(t));
    if (exigidos.length) p.exigidos = exigidos;
  }
  return out;
}

// Valor CALCULADO, não de produto. Olha só o fim do trecho, colado no preço:
// "a Prime 9 sai por R$ 1.517 e o frete fica R$ 250" — o frete é que é do 250.
const CALCULADO_RE = /\b(vezes|frete|montagem|montar|entrega|instala\w*|total|subtotal|desconto|a vista|avista|parcela\w*|entrada|sinal|acrescimo|adicional|diferenca|economia|escada|elevador|caracol|lance|taxa|soma|somando|somad\w*|cada|por mes|ao mes|orcamento de (voce|vc)|seu orcamento|sua verba|ate)\b|\d+\s*x\b/;

const PRECO_RE = /r\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{2})?/gi;
// Fim de frase: "!" e "?" sempre; ponto só antes de MAIÚSCULA. "9 esp. + Fogão"
// é abreviação, não fim de frase — cortar ali perdia o "9" e acusava o preço do
// conjunto como se fosse do fogão (visto no teste de estresse).
const FIM_FRASE_RE = /[!?](?=\s|$)|\.(?=\s+[A-ZÀ-Ý])|\n/g;

export interface PrecoErrado { disse: string; produto: string; esperado: number[] }

/**
 * Preços que a resposta atribui a um produto da tabela e que NÃO são o preço
 * desse produto.
 */
export function precosErradosDoProduto(reply: string, tabela: PrecoProduto[]): PrecoErrado[] {
  if (!tabela.length || !reply) return [];
  const erros: PrecoErrado[] = [];
  const vocabulario = new Set(tabela.flatMap((p) => p.tokens));
  let corte = 0; // onde começa o trecho do próximo preço
  for (const m of reply.matchAll(PRECO_RE)) {
    const ini = m.index ?? 0;
    let trecho = reply.slice(corte, ini);
    corte = ini + m[0].length;
    // Recomeça na última fronteira de frase — "R$ 1.517" tem ponto, mas sem espaço depois.
    let ultimo = -1;
    for (const f of trecho.matchAll(FIM_FRASE_RE)) ultimo = (f.index ?? 0) + f[0].length;
    if (ultimo >= 0) trecho = trecho.slice(ultimo);

    const valor = Number(m[1].replace(/\./g, ""));
    if (!isFinite(valor) || valor <= 0) continue;

    const norm = canonico(trecho);
    const finalDoTrecho = norm.trim().split(" ").slice(-6).join(" ");
    if (CALCULADO_RE.test(finalDoTrecho)) continue;

    const presentes = new Set(norm.split(" ").filter(Boolean));
    const candidatos = tabela.filter((p) => p.exigidos.every((t) => presentes.has(t)));
    if (!candidatos.length) continue;
    const peso = (c: PrecoProduto) => c.exigidos.length * 10 + c.tokens.filter((t) => presentes.has(t)).length;
    const max = Math.max(...candidatos.map(peso));
    const maisEspecificos = candidatos.filter((c) => peso(c) === max);
    // O trecho nomeia OUTRO produto que o mais específico não cobre? Então fala
    // de uma combinação que a tabela não tem ("Prime 9 + Fogão 3 bocas" sem o
    // conjunto cadastrado), ou de dois produtos. Não dá para saber de quem é o
    // preço — não julga. Julgar aí acusaria resposta certa.
    const cobertos = new Set(maisEspecificos.flatMap((c) => c.tokens));
    if (candidatos.some((c) => !c.exigidos.every((t) => cobertos.has(t)))) continue;
    // ACRÉSCIMO a algo dito antes: "a Prime 9 sai R$ 1.517. E com o fogão
    // campeirinho, o conjunto fica R$ 2.684" — o 2.684 é do conjunto, e o
    // produto da frase anterior não está no trecho. Se o escolhido é peça
    // avulsa e o trecho fala em conjunto, ou a traz com "com"/"mais"/"+", não julga.
    if (!maisEspecificos.some((c) => c.combo)) {
      if (/\b(conjunto|junto|juntos|combo|kit|trio|completo|completa)\b/.test(norm) || /\+/.test(trecho)) continue;
      const primeiro = maisEspecificos[0].exigidos[0];
      if (new RegExp(`\\b(com|mais)\\s+(\\w+\\s+){0,3}?${primeiro}\\b`).test(norm)) continue;
    }
    // Mesma ideia, por PALAVRA: o trecho tem palavra de produto (de QUALQUER
    // rótulo da tabela) que o escolhido não cobre — "a de 9 espetos com fogão 3
    // bocas" sem dizer "Prime": o "9" é de churrasqueira, e o escolhido seria só
    // o fogão. Não julga.
    if ([...presentes].some((t) => vocabulario.has(t) && !cobertos.has(t))) continue;
    if (maisEspecificos.some((c) => Math.round(c.valor) === Math.round(valor))) continue;
    erros.push({
      disse: m[0].trim(),
      produto: maisEspecificos.map((c) => c.produto).join(" / "),
      esperado: [...new Set(maisEspecificos.map((c) => c.valor))],
    });
  }
  return erros;
}
