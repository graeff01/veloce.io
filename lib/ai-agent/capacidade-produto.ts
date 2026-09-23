// ── Capacidade certa PARA AQUELE produto ─────────────────────────────────────
// Irmão de medidas-produto.ts, para o dado que aquele não cobre: CAPACIDADE
// (espetos, bocas, queimadores). Não é medida em cm, então passava por todos os
// guardas de grounding.
//
// CASO REAL (JR, replay da conversa da Rosi, 22/09/2026). A IA acertou primeiro:
//
//   IA   "a churrasqueira Popular comporta 4 espetos tradicionais"   ✅ (acervo: 4)
//   LEAD "Está bom com 7 espetos"
//   IA   "Te mandei uma foto da Popular com 7 espetos"               ❌
//
// Ela abandonou o dado certo para concordar com o número que o cliente inventou.
// É o mesmo padrão do Henrique ("você está certíssimo" + medida errada), e é
// pior que inventar do zero: o cliente sai com a impressão de ter CONFIRMADO a
// capacidade com a fábrica.
//
// POR QUE O GROUNDING NÃO PEGAVA. As fontes legítimas incluem o texto da
// conversa, de propósito — sem isso, todo eco do lead viraria alarme falso. Só
// que isso faz o número que o CLIENTE cravou virar fonte válida. Para
// característica DO PRODUTO a fonte não pode ser a conversa: tem de ser o
// acervo. É o que este módulo confere.
//
// Nada é cravado no motor: a tabela é lida do conhecimento do cliente.
//
// Módulo PURO — testável em tests/capacidade-produto.test.ts.

export interface CapacidadeProduto { produto: string; unidade: string; quantidade: number }

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Unidades de CONTAGEM que valem como capacidade. Fechada de propósito: "peças",
// "blocos" e "lances" são contagens de outra natureza (o cliente escolhe quantos)
// e não são característica fixa do produto.
const UNIDADE = String.raw`(espetos?|bocas?|queimadores?)`;

// Declaração explícita no acervo: "CAPACIDADE: 4 espetos" · "comporta 4 espetos".
const DECLARACAO_RE = new RegExp(
  String.raw`(?:capacidade\s*(?::|para|de)?\s*|comporta\s+|cabem?\s+|suporta\s+)(\d{1,2})\s*${UNIDADE}`,
  "gi",
);

// Nome que JÁ carrega a capacidade: "Prime 9 espetos", "Fogão Campeiro 4 bocas".
const NOME_TEM_NUMERO_RE = new RegExp(String.raw`\d{1,2}\s*${UNIDADE}\b`, "i");

/**
 * ESCOPO DELIBERADAMENTE ESTREITO — e a primeira versão, larga, foi medida e
 * REPROVADA: acusou 10 de 123 respostas reais, todas CORRETAS ("Prime 9
 * espetos", "Fogão Campeiro 4 bocas"), e não pegou nenhum dos erros de verdade.
 * Ligar aquilo em abstenção calaria 8% do atendimento bom.
 *
 * O defeito era tratar a LINHA como se tivesse uma capacidade só. A Linha Prime
 * tem 7, 9, 11, 16 e 32 espetos — o número vive no NOME de cada modelo, e
 * repetir o número do nome é sempre correto.
 *
 * Então só entra na tabela o produto que tem capacidade DECLARADA no acervo e
 * cujo nome NÃO carrega número — que é exatamente o caso do erro real: a Linha
 * Popular declara "CAPACIDADE: 4 espetos" e seus modelos se chamam "Popular
 * Lisa 55cm". Nada de número no nome, nenhuma pista para a IA, e foi ali que
 * ela adotou o 7 do cliente.
 *
 * O dono do bloco é o título (o trecho antes do primeiro travessão/dois-pontos),
 * porque é assim que o acervo é montado: `${title} — ${content}`.
 */
export function lerTabelaCapacidade(texto: string): CapacidadeProduto[] {
  const out: CapacidadeProduto[] = [];
  const visto = new Set<string>();

  for (const bloco of (texto ?? "").split(/\n\s*\n/)) {
    const primeiraLinha = bloco.trim().split(/\r?\n/)[0] ?? "";
    const dono = (primeiraLinha.split(/\s[—–:-]\s|[—–:]/)[0] ?? "").trim();
    if (dono.length < 3 || dono.length > 60) continue;
    // Nome com número de capacidade é auto-consistente: fora da tabela.
    if (NOME_TEM_NUMERO_RE.test(dono)) continue;

    for (const m of bloco.matchAll(DECLARACAO_RE)) {
      const quantidade = Number(m[1]);
      if (!isFinite(quantidade) || quantidade <= 0 || quantidade > 99) continue;
      const unidade = m[2].replace(/s$/i, "").toLowerCase();
      const chave = `${semAcento(dono)}|${unidade}`;
      if (visto.has(chave)) continue;
      visto.add(chave);
      out.push({ produto: dono, unidade, quantidade });
    }
  }
  return out;
}

/** Qual produto da tabela a frase menciona? O nome mais específico vence. */
export function produtoNaFrase(frase: string, tabela: CapacidadeProduto[]): CapacidadeProduto | null {
  const f = semAcento(frase);
  let achado: CapacidadeProduto | null = null;
  for (const c of tabela) {
    const chave = semAcento(c.produto).replace(/^(linha|churrasqueira|fogao|forno)\s+/, "").trim();
    if (!chave || chave.length < 3) continue;
    const re = new RegExp(`\\b${chave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`);
    if (re.test(f) && (!achado || chave.length > semAcento(achado.produto).length)) achado = c;
  }
  return achado;
}

const AFIRMA_RE = new RegExp(String.raw`(\d{1,2})\s*${UNIDADE}\b`, "gi");

/**
 * Capacidades que a resposta afirma para um produto da tabela e que NÃO batem.
 *
 * Frase a frase, e só quando a frase nomeia um produto da tabela. Se a frase
 * também nomeia um MODELO cujo nome carrega número ("Prime 9 espetos"), ela é
 * ignorada: ali o número tem fonte no próprio nome, e o risco de acusar
 * atendimento correto é maior que o de deixar passar.
 */
export function capacidadesErradas(reply: string, tabela: CapacidadeProduto[]): string[] {
  if (!tabela.length) return [];
  const erros: string[] = [];
  for (const frase of (reply ?? "").split(/(?<=[.!?;])\s+|\n+/)) {
    const prod = produtoNaFrase(frase, tabela);
    if (!prod) continue;
    // A frase cita um modelo que carrega o número no nome → o número é fundado.
    if (new RegExp(String.raw`(prime|campeir|fogao|fogão|forno|parrilla)\s*\d{1,2}\s*(espetos?|bocas?)`, "i").test(frase)) continue;
    if (new RegExp(String.raw`\d{1,2}\s*(espetos?|bocas?)\s+(da|do)\s`, "i").test(frase)) continue;
    for (const m of frase.matchAll(AFIRMA_RE)) {
      const n = Number(m[1]);
      const uni = m[2].replace(/s$/i, "").toLowerCase();
      if (uni !== prod.unidade) continue; // outra unidade → não opina
      if (n !== prod.quantidade) erros.push(`${prod.produto}: disse ${n} ${m[2]}, é ${prod.quantidade}`);
    }
  }
  return erros;
}
