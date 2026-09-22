// ── Naturalidade da resposta ───────────────────────────────────────────────────
// Três tiques que fazem a IA soar como robô — e que o prompt manda evitar em
// caixa alta, sem sucesso.
//
// O PLACAR QUE MOTIVOU (JR, 19 conversas reais, 7–21/09/2026, 273 respostas):
//
//   pedido de permissão pra ENVIAR o que ela mesma envia    17
//   clichê de disponibilidade ("qualquer dúvida, estou aí")  14
//   duas ou mais perguntas no mesmo turno                    14
//   frase idêntica repetida na mesma conversa                 9
//
// As quatro já são PROIBIDAS no prompt, com maiúscula e "é PROIBIDO". O prompt
// tem 188 ordens imperativas competindo entre si; gritar mais alto não muda o
// placar. É o mesmo raciocínio de roteador.ts — o que é calculável sai do
// prompt e vira código.
//
// POR QUE ISTO CUSTA VENDA, e não é só estética:
// o pedido de permissão não é apenas feio — ele PARA o atendimento. Caso real
// (Cristofer, 05/09): "Posso te enviar o PDF com todos os detalhes?" → o lead
// responde "Sim" → ela manda uma FOTO e pergunta de novo → "Sim" → manda a
// mesma foto. Três pedidos de licença, nenhum PDF. Na base inteira: 12 chamadas
// de gerar_orcamento e 4 de enviar_orcamento.
//
// LIMITE DELIBERADO — o que este módulo NÃO faz:
// não reescreve frase, não muda tom e não corta pergunta que é DECISÃO do
// cliente ("quer incluir os 5 blocos?" custa R$ 175 e é dele). Remove frase
// inteira, como security/autoridade.ts, e só quando o padrão é fechado.
//
// Módulo PURO — testável em tests/naturalidade.test.ts.

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Quebra em frases preservando pontuação e quebras de linha. As respostas da JR
// vêm em blocos curtos (uma ideia por linha, cada linha vira uma mensagem no
// WhatsApp) — recolar tudo num parágrafo mudaria o formato que o lead recebe.
// Mesma função de security/autoridade.ts, mantida separada de propósito: são
// invariantes diferentes e não devem se acoplar por um utilitário comum.
// NÃO quebra dentro de parênteses. A pergunta de acesso que o próprio motor
// exige — "é térreo, tem escada (quantos lances? é tradicional ou caracol) ou é
// por elevador?" — tem "?" no meio do parêntese; um split ingênuo a partia em
// duas, e a regra de "uma pergunta por turno" entregava metade dela ao lead.
function emFrases(texto: string): string[] {
  const partes: string[] = [];
  for (const linha of texto.split(/(\n+)/)) {
    if (/^\n+$/.test(linha)) { partes.push(linha); continue; }
    let atual = "";
    let profundidade = 0;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      atual += c;
      if (c === "(") profundidade++;
      else if (c === ")") profundidade = Math.max(0, profundidade - 1);
      else if (profundidade === 0 && /[.!?…]/.test(c)) {
        // Fecha a frase no fim da pontuação (que pode ser "?!" ou "...").
        while (i + 1 < linha.length && /[.!?…]/.test(linha[i + 1])) { atual += linha[++i]; }
        // Só fecha se vier ESPAÇO ou FIM. Sem esta guarda, o ponto do separador
        // de milhar partia a frase e o recolar inseria um espaço no meio do
        // valor: "R$ 4.872,00" virava "R$ 4. 872,00". Pegado pelo teste do
        // orçamento do Cristofer — corromper dinheiro é pior que o tique.
        const resto = linha.slice(i + 1);
        if (resto && !/^\s/.test(resto)) continue;
        const espacos = /^\s+/.exec(resto);
        if (espacos) i += espacos[0].length; // consome o espaço separador
        partes.push(atual);
        atual = "";
      }
    }
    if (atual.trim()) partes.push(atual);
  }
  return partes;
}

const recolar = (partes: string[]) =>
  partes.join(" ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

// ── 1. Clichê de disponibilidade ──────────────────────────────────────────────
// Só casa a frase que é INTEIRAMENTE oferta genérica de ajuda. O prompt já pede
// "deixe as ofertas genéricas de ajuda de fora"; aqui elas saem de fato.
//
// Testado contra as 273 respostas: estes sete padrões pegam as 14 ocorrências e
// nenhuma frase com conteúdo. O que ficou FORA de propósito:
//   · "Fique à vontade para tirar todas as suas dúvidas com ele" — no handoff
//     tem função: diz ao lead que o vendedor responde o resto.
//   · "Estou aqui para ajudar você com tudo sobre churrasqueiras, fogões..." —
//     apresenta o escopo, não é fecho vazio.
// Prefixo de cortesia que o modelo põe antes do clichê: "Então, Rose, se
// precisar...". Sem tolerar isso, metade das ocorrências reais escapava.
const PREF = String.raw`(?:(?:ent[ãa]o|bom|ok|perfeito|certo|beleza)[,!]?\s*)?(?:[a-zà-ú]{2,20}[,!]\s*)?(?:se\s+quiser,?\s*)?`;

const CLICHE: RegExp[] = [
  // "Qualquer dúvida, estou aqui para ajudar!" / "...é só chamar"
  new RegExp(`^${PREF}(?:e\\s+)?qualquer\\s+d[uú]vida[,.!\\s]*(estou|fico|to|t[oô]|[eé]\\s+s[oó]|pode|me\\s+chama|chama|fale|pergunte)`, "i"),
  // "Posso ajudar com mais alguma coisa?" / "Se quiser, posso ajudar em mais alguma coisa, Rose?"
  new RegExp(`^${PREF}(posso|quer\\s+que\\s+eu)\\s+(te\\s+|lhe\\s+)?ajud[ae]r?\\s+(com|em)\\s+(mais\\s+)?(alguma|algo)`, "i"),
  // "Como posso te ajudar hoje?" — além de clichê, é o RESET de contexto:
  // caso real (Rosi, 08/09) no meio de uma coleta de CPF/CEP já em andamento.
  /^como\s+(eu\s+)?posso\s+(te\s+|lhe\s+|o\s+|a\s+)?ajudar/i,
  // "Se precisar de algo mais, estou por aqui!" / "Estou por aqui se precisar"
  //
  // O "estou aqui" só é clichê quando NÃO leva complemento de conteúdo. Sem esta
  // âncora o padrão comia "Estou aqui para ajudar você com tudo sobre
  // churrasqueiras, fogões campeiros e lareiras", que apresenta o ESCOPO do
  // atendimento e é informação legítima (Rosi, 08/09 09:27).
  new RegExp(`^${PREF}(?:se\\s+(?:precisar|quiser|tiver)[^,.!?\\n]{0,30},?\\s*)?(estou|fico|t[oô])\\s+(aqui|por\\s+aqui|[àa]\\s+disposi[cç][ãa]o)(?:\\s+(?:se|caso|pra|para)\\s+(?:precisar|quiser|qualquer)[^.!?\\n]{0,25})?\\s*[.!?…]*$`, "i"),
  // "Se precisar de qualquer coisa, é só chamar, tá?"
  new RegExp(`^${PREF}se\\s+precisar\\s+de\\s+(qualquer\\s+coisa|algo|alguma\\s+coisa)[^.!?\\n]{0,20},?\\s*([eé]\\s+s[oó]|pode|me\\s+cham|cham)`, "i"),
];

// ── 2. Pedido de permissão pra fazer o que ela já pode fazer ───────────────────
// O corte é por AÇÃO, não por formato: a frase só sai quando pede licença pra
// um ENVIO que a própria IA executa. Pergunta que é decisão do cliente fica.
//
// Mapeamento objeto → ferramenta. `null` = corta a frase mas NÃO dispara nada:
//   · foto/imagem: enviar_foto exige o TERMO do modelo, e a frase de oferta nem
//     sempre o diz ("quer que eu te envie as fotos de algum desses modelos?").
//     Sem termo não se chuta qual foto. Quando o lead NOMEIA o modelo, quem
//     manda a foto é a regra modelo_nomeado_sem_foto do roteador — que tem
//     `excetoSe` de preço/medida, ou seja, NÃO cobre todos os casos. Aqui a
//     oferta sai de qualquer jeito: oferecer foto em vez de mandar é o tique
//     que o prompt proíbe, e uma oferta a menos é melhor que uma foto errada.
const ENVIO: { re: RegExp; ferramenta: string | null; rotulo: string }[] = [
  // PDF / orçamento → enviar_orcamento. É o caso com mais dinheiro em jogo.
  { re: /\b(pdf|or[cç]amento\s+(completo|em\s+pdf|detalhado)?|or[cç]amento)\b/i, ferramenta: "enviar_orcamento", rotulo: "orcamento" },
  { re: /\bcat[aá]logo\b/i, ferramenta: "enviar_catalogo", rotulo: "catalogo" },
  { re: /\b(fotos?|imagens?)\b/i, ferramenta: null, rotulo: "foto" },
];

// "Posso te enviar...", "Quer que eu mande...", "Posso já te passar..."
const PEDE_ENVIO_RE =
  /\b(posso|podemos|quer\s+que\s+eu|gostaria\s+que\s+eu|deseja\s+que\s+eu|prefere\s+que\s+eu)\b[^.!?\n]{0,25}\b(envi[ae]r?|mand[ae]r?|mostr[ae]r?|pass[ae]r?|compartilh[ae]r?)\b/i;

// Licença vazia: não pede pra enviar nada, só pede autorização pra continuar.
// "Posso seguir?" (Rochelly, 08/09 — logo depois de já ter o preço em mãos).
const LICENCA_VAZIA: RegExp[] = [
  /^(ent[ãa]o\s+)?posso\s+(seguir|continuar|prosseguir|avan[cç]ar|ir\s+em\s+frente)\b/i,
  /^(voc[eê]\s+)?(prefere|gostaria)\s+que\s+eu\s+fa[cç]a\s+isso\b/i,
  /^posso\s+fazer\s+isso\b/i,
  /^(tudo\s+bem|pode\s+ser|combinado)\?$/i,
];

// ── 3. Uma pergunta por turno ─────────────────────────────────────────────────
// Conta FRASES interrogativas, não "?". Sem isso, a pergunta de acesso do
// próprio motor — "é térreo, tem escada (quantos lances? é tradicional ou
// caracol) ou é por elevador?" — pareceria três perguntas e seria mutilada.
const semParenteses = (s: string) => s.replace(/\([^)]*\)/g, " ");
const ehPergunta = (frase: string) => /\?\s*$/.test(semParenteses(frase).trim());

// Partícula de confirmação no fim da frase ("..., ok?", "..., tá?", "..., né?").
// NÃO é a pergunta do turno: é entonação. Medido contra tráfego real, tratá-la
// como pergunta fazia a pergunta seguinte — a que realmente importa — ser
// cortada como excedente. Caso real (Cristofer, 05/09): "o máximo são 5 blocos
// (1 metro), ok?" consumia a vez, e "quer que eu inclua esses 5 blocos?" caía —
// justamente a decisão de R$ 175 que é do cliente.
const ehTagQuestion = (frase: string) =>
  /(?:^|[,;—–-]\s*)(ok|t[áa]|certo|combinado|beleza|blz|n[ée]|n[ãa]o\s+[ée]|pode\s+ser|tudo\s+bem)\s*\?\s*$/i.test(semParenteses(frase).trim());

// Frase que ABRE com "ou" é a segunda metade de uma alternativa partida em duas
// ("...um modelo específico? Ou prefere o catálogo completo?"), não uma pergunta
// nova. Cortá-la deixava a escolha manca.
const ehContinuacaoOu = (frase: string) => /^ou\b/i.test(frase.trim());

export interface PolimentoResult {
  /** Texto polido. Nunca vazio: se tudo casaria, devolve o original. */
  texto: string;
  /** Frases removidas, para telemetria/evidência. */
  removidas: string[];
  /** Rótulos do que foi corrigido (entram em `guardrails`). */
  marcas: string[];
  /** Ferramenta que o pedido de permissão pedia — quem chama executa. */
  acao: string | null;
}

/**
 * Tira da resposta os quatro tiques de robô.
 *
 * `anteriores` são as respostas JÁ enviadas nesta conversa — é o que permite
 * detectar a frase repetida. Ordem importa: clichê e permissão saem primeiro,
 * porque removê-los muda QUAL pergunta é a primeira.
 *
 * NUNCA devolve vazio. Diferente do guardrail e do invariante de autoridade,
 * aqui não há risco de dano: uma resposta com tique entregue é melhor que
 * silêncio, e cair no fallback por causa de estilo calaria atendimento bom.
 */
export function polir(
  reply: string | null | undefined,
  anteriores: string[] = [],
): PolimentoResult {
  const original = reply ?? "";
  if (!original.trim()) return { texto: original, removidas: [], marcas: [], acao: null };

  const removidas: string[] = [];
  const marcas: string[] = [];
  let acao: string | null = null;

  const guardaRemovida = (frase: string) => removidas.push(frase.trim().slice(0, 140));

  // Passo 1 — clichê de disponibilidade.
  let partes = emFrases(original).filter((p) => {
    if (/^\n+$/.test(p)) return true;
    const limpa = p.trim();
    if (CLICHE.some((re) => re.test(limpa))) {
      guardaRemovida(limpa);
      if (!marcas.includes("cliche")) marcas.push("cliche");
      return false;
    }
    return true;
  });

  // Passo 2 — pedido de permissão. Registra a AÇÃO antes de cortar a frase:
  // é ela que faz o envio acontecer de fato em vez de só desaparecer.
  //
  // PERGUNTA DE ESCOLHA NÃO É PEDIDO DE LICENÇA. Medido contra as 123 respostas
  // reais: sem esta distinção, 6 cortes caíam em "você procura um modelo
  // específico OU prefere que eu envie o catálogo completo?" — que o prompt
  // EXIGE. Pior que perder a pergunta: o corte disparava enviar_catalogo, ou
  // seja, mandava o catálogo sem o lead ter escolhido. A alternativa aparece de
  // dois jeitos, na mesma frase ("A ou B?") ou partida em duas ("...específico?
  // Ou prefere...?"), então olha-se também a frase vizinha.
  const ehEscolha = (i: number, limpa: string): boolean => {
    if (/\bou\b/i.test(semParenteses(limpa))) return true;
    const vizinha = (j: number) => {
      for (let k = j; k >= 0 && k < partes.length; j < i ? k-- : k++) {
        if (/^\n+$/.test(partes[k])) continue;
        return partes[k].trim();
      }
      return "";
    };
    return /^ou\b/i.test(vizinha(i + 1)) || /^ou\b/i.test(vizinha(i - 1));
  };

  partes = partes.filter((p, i) => {
    if (/^\n+$/.test(p)) return true;
    const limpa = p.trim();
    if (!ehPergunta(limpa)) return true;
    if (ehEscolha(i, limpa)) return true;

    if (PEDE_ENVIO_RE.test(limpa)) {
      const alvo = ENVIO.find((e) => e.re.test(limpa));
      if (!alvo) return true; // pede pra enviar algo que não sabemos enviar → fica
      if (alvo.ferramenta && !acao) acao = alvo.ferramenta;
      guardaRemovida(limpa);
      const marca = `permissao:${alvo.rotulo}`;
      if (!marcas.includes(marca)) marcas.push(marca);
      return false;
    }
    if (LICENCA_VAZIA.some((re) => re.test(limpa))) {
      guardaRemovida(limpa);
      if (!marcas.includes("permissao:licenca")) marcas.push("permissao:licenca");
      return false;
    }
    return true;
  });

  // Passo 3 — frase idêntica já dita na conversa. Exige 6+ palavras: sem isso
  // cortaria vocativo legítimo ("Prazer, Rose!", "Ótima escolha!"), que repete
  // por natureza. Caso real (Wilson, 08/09): o mesmo par de frases saiu duas
  // vezes seguidas, palavra por palavra, incluindo o emoji.
  if (anteriores.length) {
    const ditas = new Set(anteriores.flatMap((a) => emFrases(a).map((f) => semAcento(f).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim())));
    partes = partes.filter((p) => {
      if (/^\n+$/.test(p)) return true;
      const chave = semAcento(p).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
      if (chave.split(" ").length < 6) return true;
      if (ditas.has(chave)) {
        guardaRemovida(p);
        if (!marcas.includes("repetida")) marcas.push("repetida");
        return false;
      }
      return true;
    });
  }

  // Passo 4 — uma pergunta por turno: mantém a PRIMEIRA e corta as excedentes.
  // A primeira é a que responde ao que o lead acabou de dizer; as seguintes são
  // o atropelo. Caso real (Valdinei, 21/09): confirma o modelo que ele JÁ havia
  // nomeado e, na mesma respirada, pede a cidade que ele JÁ havia dado.
  {
    let vista = false;
    partes = partes.filter((p) => {
      if (/^\n+$/.test(p)) return true;
      const limpa = p.trim();
      if (!ehPergunta(limpa)) return true;
      if (ehTagQuestion(limpa)) return true;   // entonação, não consome a vez
      if (ehContinuacaoOu(limpa)) return true; // segunda metade da alternativa
      if (!vista) { vista = true; return true; }
      guardaRemovida(p);
      if (!marcas.includes("duas_perguntas")) marcas.push("duas_perguntas");
      return false;
    });
  }

  const texto = recolar(partes);
  // Sobrou nada — ou sobrou só interjeição. Devolve o original: estilo não
  // justifica calar a resposta (ver cabeçalho). Medido contra tráfego real, o
  // caso que exigiu a segunda metade da guarda foi o Wilson (08/09): as duas
  // frases de conteúdo eram repetição, e o corte deixava "🔥 Que massa!" — uma
  // mensagem que não diz nada é pior que uma que se repete.
  const insignificante = removidas.length > 0
    && texto.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean).length < 4;
  if (!texto || insignificante) {
    return { texto: original, removidas, marcas: [...marcas, "resto_insuficiente"], acao };
  }
  return { texto, removidas, marcas, acao };
}
