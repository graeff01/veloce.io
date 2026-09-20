// ── Grounding: a IA nunca inventa preço/prazo (F1) ───────────────────────────
// Verificação determinística de embasamento (chain-of-verification "leve"): toda
// AFIRMAÇÃO de risco na resposta — valor em reais, prazo em dias/semanas — precisa
// aparecer em alguma FONTE (resultado de ferramenta, conhecimento/RAG ou o próprio
// histórico da conversa). Se um preço surgir do nada, é alucinação → o orquestrador
// abstém (troca pela mensagem de fallback e encaminha ao vendedor).
//
// Barato (sem chamada de modelo) e de alta precisão para o maior risco reputacional:
// cravar um número que a empresa nunca cotou. Prazos entram como AVISO (auditoria),
// não forçam abstenção, para não bloquear conversas legítimas por engano.

const onlyDigits = (s: string) => s.replace(/\D/g, "");

// Tokens numéricos "de dinheiro" na resposta: R$ 12.500, R$ 1.299,90, etc.
const PRICE_RE = /r\$\s?\d[\d.\s]*(?:,\d{2})?/gi;
// Prazos com número + unidade de tempo.
const DEADLINE_RE = /\b(\d{1,3})\s?(dias?\s?(?:[úu]teis)?|semanas?|meses|m[êe]s|horas?)\b/gi;

export interface GroundingResult {
  grounded: boolean; // false só quando há preço sem fonte (gatilho de abstenção)
  priceViolations: string[]; // preços na resposta ausentes das fontes
  deadlineWarnings: string[]; // prazos sem fonte (apenas aviso, não abstém)
  medidaWarnings: string[];   // medidas sem fonte (ver abaixo)
}

// ── Medidas ──────────────────────────────────────────────────────────────────
// Medida errada custa igual a preço errado: o cliente compra pensando que cabe.
// Visto em simulação com conversa real: perguntado o tamanho da Prime 7, a IA
// respondeu "70 cm" — deduziu do NOME do modelo (7 espetos). A largura real é
// 60. Ela só corrigiu depois que o próprio cliente corrigiu.
//
// Normaliza tudo para CENTÍMETROS para comparar: "2,20 m", "2,20m" e "220 cm"
// são a mesma medida escrita de três jeitos, e o cadastro usa os três.
const MEDIDA_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|mm|m(?:etros?)?)\b/gi;
// Trio de dimensões: "60x60x2,20m", "1,05m x 60cm x 2,50m", "81 x 60".
const TRIO_RE = /(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|mm|m)?\s?[x×]\s?(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|mm|m)?(?:\s?[x×]\s?(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|mm|m)?)?/gi;

function paraCm(valor: string, unidade?: string): number | null {
  const n = parseFloat(valor.replace(",", "."));
  if (!isFinite(n) || n <= 0) return null;
  const u = (unidade ?? "").toLowerCase();
  if (u === "mm") return n / 10;
  if (u === "cm") return n;
  if (u.startsWith("m")) return n * 100;
  // SEM unidade, dentro de um trio: o cadastro escreve "60x60x2,20m" — os dois
  // primeiros são centímetros e o último tem a unidade. Decimal pequeno é metro
  // ("1,05" = 1,05 m), inteiro grande é centímetro ("74" = 74 cm).
  return n < 10 ? n * 100 : n;
}

/**
 * Trechos NEGADOS não valem como fonte.
 *
 * O acervo da JR tem uma frase corretiva: "a Prime 7 NÃO tem 70 cm (tem 60), a
 * Prime 9 NÃO tem 90 cm". O extrator lia "70 cm" e "90 cm" dali e os tornava
 * OFICIAIS — o aviso escrito para impedir o erro era justamente o que o
 * autorizava. Descoberto reproduzindo a conversa do Henrique: ela respondeu
 * "Prime 7 tem 70 cm" e o embasamento aprovou.
 *
 * Corta da fonte o pedaço entre a negação e o fim da oração.
 */
const NEGACAO_RE = /\b(n[ãa]o|nunca|jamais)\s+(tem|t[êe]m|[ée]|s[ãa]o|mede|medem|possui)\b[^.;!?\n]*/gi;

export function semTrechosNegados(texto: string): string {
  return texto.replace(NEGACAO_RE, " ");
}

export function medidasEmCm(textoBruto: string): Set<string> {
  const texto = semTrechosNegados(textoBruto);
  const out = new Set<string>();
  const guardar = (cm: number | null) => {
    if (cm != null && cm >= 1 && cm <= 100000) out.add(String(Math.round(cm)));
  };
  // Trios primeiro: sem isto, "74x60x2,30m" devolvia só o 230 — e as LARGURAS,
  // que são justamente o que a IA erra, ficavam de fora da lista oficial.
  for (const m of texto.matchAll(TRIO_RE)) {
    guardar(paraCm(m[1], m[2]));
    guardar(paraCm(m[3], m[4]));
    if (m[5]) guardar(paraCm(m[5], m[6]));
  }
  for (const m of texto.matchAll(MEDIDA_RE)) guardar(paraCm(m[1], m[2]));
  return out;
}

// Preços OFICIAIS do cliente (tabela de preços/frete). São fonte por definição.
//
// Sem eles, o embasamento dependia da janela curta de histórico (1.200 tokens):
// numa conversa longa, a mensagem em que a PRÓPRIA IA deu o preço sai da janela,
// e ela passa a se ABSTER de um valor que já tinha dado certo. Medido em
// simulação contra conversa real: o lead pede de novo o preço da Prime 7 dois
// turnos depois de recebê-lo e ouve "prefiro confirmar com um vendedor".
//
// A conferência é por IGUALDADE EXATA, não por substring. `sources` é comparado
// com `includes` sobre todos os dígitos concatenados — jogar a tabela inteira lá
// dentro afrouxaria o teste para todo mundo. Aqui o preço ou é um valor oficial,
// ou não é.
export function extrairPrecosOficiais(regras: unknown): Set<string> {
  const out = new Set<string>();
  const anda = (v: unknown, profundidade = 0): void => {
    if (profundidade > 6 || v == null) return;
    if (Array.isArray(v)) { for (const x of v) anda(x, profundidade + 1); return; }
    if (typeof v !== "object") return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "number" && /amount|price|preco|preço|montagem|spiral|elevator|stairPerFlight/i.test(k)) {
        if (val > 0) out.add(onlyDigits(String(val)));
      } else anda(val, profundidade + 1);
    }
  };
  anda(regras);
  return out;
}

// `sources` deve concatenar tudo que é fonte legítima: resultados de ferramentas,
// conhecimento (RAG) e o texto da conversa (para não marcar eco do próprio lead).
// `precosOficiais` entra como lista fechada — ver acima.
export function checkGrounding(reply: string, sources: string, precosOficiais?: Set<string>, medidasOficiais?: Set<string>): GroundingResult {
  const srcDigits = onlyDigits(sources);
  const srcNorm = sources.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const priceViolations: string[] = [];
  for (const m of reply.match(PRICE_RE) ?? []) {
    const d = onlyDigits(m);
    if (d.length < 2) continue; // "R$" solto, ignora
    if (srcDigits.includes(d)) continue;
    // Valor da tabela oficial — igualdade exata, com e sem os centavos ("1247"
    // e "124700" são o mesmo R$ 1.247,00).
    if (precosOficiais?.has(d) || precosOficiais?.has(d.replace(/00$/, ""))) continue;
    priceViolations.push(m.trim());
  }

  const deadlineWarnings: string[] = [];
  const dl = reply.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const m of dl.matchAll(DEADLINE_RE)) {
    const num = m[1];
    // fonte precisa citar o mesmo número perto de uma unidade de tempo
    if (!new RegExp(`${num}\\s?(dia|semana|mes|hora)`).test(srcNorm)) {
      deadlineWarnings.push(m[0]);
    }
  }

  // Medida na resposta que não aparece em NENHUMA fonte nem na tabela oficial.
  // Por ora é AVISO — igual ao prazo — para medir a taxa de alarme falso antes
  // de deixar abster. Uma abstenção indevida cala o atendimento, e isso já se
  // mostrou pior que o problema que vinha resolver.
  const medidaWarnings: string[] = [];
  {
    const naFonte = medidasEmCm(sources);
    const oficiais = medidasOficiais ?? new Set<string>();
    for (const cm of medidasEmCm(reply)) {
      if (!naFonte.has(cm) && !oficiais.has(cm)) medidaWarnings.push(`${cm}cm`);
    }
  }

  return { grounded: priceViolations.length === 0, priceViolations, deadlineWarnings, medidaWarnings };
}

// ── Medida ATRIBUÍDA ao produto ──────────────────────────────────────────────
// Avisar sobre qualquer medida sem fonte é ruído: medido em 538 respostas
// reais, as 5 que apareceram eram TODAS legítimas — o pé-direito que o cliente
// informou ("com 3 metros de altura, a Prime 9 encaixa"), a altura da cobertura
// dele, ou conta de blocos ("7 blocos, que são 1,4 metros"). Barrar essas
// calaria atendimento bom e não pegaria erro nenhum.
//
// O que PRECISA de fonte é a medida dita como característica DO PRODUTO:
// "a Prime 9 TEM 84 cm DE LARGURA" — apareceu no replay do Henrique, e o
// cadastro diz 74. A diferença é a atribuição: verbo de posse + dimensão.
//
// Também pega a adoção do número do CLIENTE: se ele disser "é 74" e a IA
// repetir como característica do produto sem estar no acervo, cai aqui igual.

const ATRIBUICAO_RE =
  /\b(tem|têm|mede|medem|possui|possuem|é\s+de|sao\s+de|são\s+de)\b[^.!?\n]{0,40}?(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|mm|m)\b[^.!?\n]{0,12}?\bde\s+(largura|profundidade|altura|comprimento)/gi;

/** Medidas que a resposta apresenta como característica do produto. */
export function medidasAtribuidas(reply: string): { valor: string; cm: number }[] {
  const out: { valor: string; cm: number }[] = [];
  for (const m of reply.matchAll(ATRIBUICAO_RE)) {
    const n = parseFloat(m[2].replace(",", "."));
    if (!isFinite(n) || n <= 0) continue;
    const u = (m[3] ?? "").toLowerCase();
    const cm = u === "mm" ? n / 10 : u === "cm" ? n : n * 100;
    out.push({ valor: `${m[2]}${u}`, cm: Math.round(cm * 10) / 10 });
  }
  return out;
}

/**
 * As que NÃO existem no acervo — invenção, não eco do cliente.
 *
 * LIMITE CONHECIDO: confere se o NÚMERO existe no acervo, não se ele é o certo
 * PARA AQUELE produto. "Prime 9 tem 84 cm" passa, porque 84 é medida legítima
 * de outra peça. Pegar isso exige amarrar produto→dimensão, que é outro
 * tamanho de trabalho. Medido: pega 3 de 3 erros reais do histórico.
 */
export function medidasInventadas(reply: string, oficiais: Set<string> | Set<number>): string[] {
  const nums = [...oficiais].map(Number).filter((n) => isFinite(n));
  const perto = (c: number) => nums.some((o) => Math.abs(o - c) < 0.6);
  return medidasAtribuidas(reply).filter((x) => !perto(x.cm)).map((x) => x.valor);
}
