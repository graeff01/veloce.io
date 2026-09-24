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
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F900}-\u{1F9FF}]/u;

function emFrases(texto: string): string[] {
  const partes: string[] = [];
  for (const linha of texto.split(/(\n+)/)) {
    if (/^\n+$/.test(linha)) { partes.push(linha); continue; }
    // Itera por CODE POINTS. Emoji é surrogate pair em UTF-16, e indexar a
    // string devolvia metade do par — o teste de emoji nunca casava.
    const chars = Array.from(linha);
    let atual = "";
    let profundidade = 0;
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      atual += c;
      if (c === "(") { profundidade++; continue; }
      if (c === ")") { profundidade = Math.max(0, profundidade - 1); continue; }
      if (profundidade > 0) continue;

      const fechaPontuacao = /[.!?…]/.test(c);
      // EMOJI fecha frase quando o que vem depois abre com MAIÚSCULA. No
      // WhatsApp o emoji fecha bloco, e sem isto o clichê ficava colado em texto
      // legítimo: "Que bom te ver por aqui 😊 Como posso te ajudar hoje?" era UMA
      // frase, e o padrão ancorado em "^como" não casava (visto na regressão,
      // conversa do Juliano).
      // ...e só quando já há conteúdo antes dele: um emoji de ABERTURA ("👍 Se
      // precisar de algo mais...") não pode virar frase sozinho, senão sobra um
      // fragmento solto no lugar do texto cortado.
      const temConteudo = /\p{L}|\p{N}/u.test(atual.slice(0, -c.length));
      const fechaEmoji = !fechaPontuacao && temConteudo && EMOJI_RE.test(c);
      if (!fechaPontuacao && !fechaEmoji) continue;

      if (fechaPontuacao) {
        while (i + 1 < chars.length && /[.!?…]/.test(chars[i + 1])) { atual += chars[++i]; }
      }
      // Só fecha se vier ESPAÇO ou FIM. Sem esta guarda, o ponto do separador de
      // milhar partia a frase e o recolar inseria um espaço no meio do valor:
      // "R$ 4.872,00" virava "R$ 4. 872,00".
      const resto = chars.slice(i + 1);
      const posEspacos = resto.findIndex((x) => !/\s/.test(x));
      const brancos = posEspacos === -1 ? resto.length : posEspacos;
      if (resto.length && brancos === 0) continue;                 // não há espaço → não fecha
      if (fechaEmoji) {
        const proximo = posEspacos === -1 ? "" : resto[posEspacos];
        if (!proximo || !/\p{Lu}/u.test(proximo)) continue;        // emoji só fecha antes de maiúscula
      }
      i += brancos;
      partes.push(atual);
      atual = "";
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
// Prefixo de cortesia antes do clichê. Aceita até duas orações curtas: além do
// vocativo ("Então, Rose,"), cobre "Quando quiser," e "Se precisar disso,",
// que escaparam na validação por replay.
const PREF = String.raw`(?:(?:ent[ãa]o|bom|ok|perfeito|certo|beleza|tudo\s+bem)[,!]?\s*)?(?:[a-zà-ú]{2,20}[,!]\s*)?(?:(?:se|quando|caso)\s+[a-zà-ú]{2,20}(?:\s+[a-zà-ú]{2,12}){0,2},\s*)?(?:se\s+quiser,?\s*)?`;

// Normaliza a frase só para CASAR o clichê — a saída nunca usa este texto.
//
// Três coisas quebravam a âncora `^` e deixavam o clichê passar, todas vistas na
// validação por replay:
//   · emoji de abertura: "👍 Se precisar de algo mais, estou por aqui"
//   · vocativo no MEIO: "estou por aqui, Rose!" / "mais alguma coisa, Cristofer,"
//   · cauda depois do clichê: "é só chamar que eu te ajudo com o que precisar"
// Os dois primeiros saem aqui; a cauda é tratada nos próprios padrões.
function paraCasar(frase: string, nome?: string | null): string {
  let t = frase
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, " ")
    // \W NÃO é unicode-aware: comia o "É" de "É só chamar" e o padrão deixava de
    // casar. Remove só o que não é letra nem número.
    .replace(/^[^\p{L}\p{N}]+/u, "");
  if (nome && nome.trim().length >= 2) {
    const esc = nome.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s*,\\s*${esc}\\b`, "gi"), "")
         .replace(new RegExp(`\\b${esc}\\s*,\\s*`, "gi"), "");
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

const CLICHE: RegExp[] = [
  // "Qualquer dúvida, estou aqui para ajudar!" / "...é só chamar"
  // "Qualquer dúvida/coisa/problema" + disponibilidade. Era só "dúvida", e
  // "Qualquer coisa, estou por aqui!" escapou na rodada dos leads de anúncio —
  // é a mesma família, não um caso novo.
  new RegExp(`^${PREF}(?:e\\s+)?qualquer\\s+(d[uú]vida|coisa|problema|dificuldade)[,.!\\s]*(estou|fico|to|t[oô]|[eé]\\s+s[oó]|pode|me\\s+(cham|fal|avis)[ae]|cham[ae]|fal[ae]|pergunt[ae]|avis[ae])`, "i"),
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
  // A cauda é opcional e cobre as três formas vistas em replay: "...para
  // ajudar", "...caso precise de qualquer coisa", "...se precisar". A
  // conjugação varia (precisar/precise/precisa), então o radical basta.
  new RegExp(`^${PREF}(?:se\\s+(?:precisar|precise|quiser|tiver)[^,.!?\\n]{0,30},?\\s*)?(estou|fico|t[oô])\\s+(aqui|por\\s+aqui|[àa]\\s+disposi[cç][ãa]o)(?:\\s+(?:se|caso|pra|para|p/|no\\s+que|quando|at[eé])\\s+[^.!?\\n]{0,30})?\\s*[.!?…]*$`, "i"),
  // "Se precisar de qualquer coisa, é só chamar, tá?"
  new RegExp(`^${PREF}se\\s+(precis[ae]r?|mudar|quiser|tiver)\\s+(de\\s+)?(qualquer\\s+coisa|algo|alguma\\s+coisa|mais\\s+alguma\\s+coisa|de\\s+ideia|ideia)?[^.!?\\n]{0,70},?\\s*([eé]\\s+s[oó]\\s+(me\\s+|nos\\s+)?(chamar|cham[ae]|fal[ae]r?|avis[ae]r?|perguntar|pedir)|pode\\s+(me\\s+)?(chamar|cham[ae])|me\\s+(cham|fal|avis)[ae]|estou\\s+(aqui|por\\s+aqui|[àa]\\s+disposi)|fico\\s+(aqui|por\\s+aqui|[àa]\\s+disposi))`, "i"),
  // "É só chamar, tá?" / "É só me chamar!" — sobra sozinha quando a frase
  // anterior do fecho já saiu. Vista no replay da Rosi.
  new RegExp(`^${PREF}[eé]\\s+s[oó]\\s+(me\\s+|nos\\s+)?(chamar|cham[ae]|fal[ae]r?|avis[ae]r?|perguntar|mandar\\s+mensagem)(?:\\s+(?:que|e)\\s+[^.!?\\n]{0,45})?[^.!?\\n]{0,15}[.!?…]*$`, "i"),
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

// ── Vocativo que não é nome ───────────────────────────────────────────────────
// O intake já recusa "Dia" como nome (ver intake.ts) e avisa a IA. Só que o
// aviso é uma INSTRUÇÃO, e instrução fura: medido em replay com a conversa real
// do Willian (21/09), a IA recebeu o aviso e mesmo assim escreveu "Dia, temos
// três modelos..." e "Dia! Vi que você é de Carambeí". O valor está no
// transcript, e ela o usa de lá.
//
// Remove só em POSIÇÃO DE VOCATIVO (com pontuação adjacente). É o que permite
// tirar "Dia," sem tocar em "bom dia" no meio da frase — e é justamente por a
// palavra recusada ser comum que a remoção cega seria perigosa.
export function removerVocativo(texto: string, nome: string): string {
  const n = nome.trim();
  if (!n || !texto) return texto;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let t = texto;
  // "Prazer, Dia!" / "Prazer Dia!" → "Prazer!"
  t = t.replace(new RegExp(`\\b(prazer|ol[áa]|oi)\\s*,?\\s+${esc}\\b`, "gi"), "$1");
  // "Dia, temos três modelos" (início de frase/linha) → "Temos três modelos"
  t = t.replace(new RegExp(`(^|\\n|(?<=[.!?…]\\s))${esc}\\s*[,!]\\s*`, "gi"), "$1");
  // "..., Dia?" / "..., Dia!" no fim da oração → tira só o vocativo
  t = t.replace(new RegExp(`\\s*,\\s*${esc}\\s*(?=[.!?…]|$)`, "gi"), "");
  // Sobrou uma linha começando em minúscula por causa do corte: recapitaliza.
  t = t.replace(/(^|\n)\s*([a-zà-ú])/g, (_m, p, c) => `${p}${c.toUpperCase()}`);
  return t.replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?])/g, "$1").trim();
}

// ── Repetição da resposta INTEIRA ─────────────────────────────────────────────
// O polidor corta a frase repetida, mas quando a resposta TODA é repetição não
// há o que cortar: a guarda de resto devolve o original, e o lead recebe a mesma
// mensagem duas vezes. Visto no replay da Rochelly — "você procura algum modelo
// específico ou prefere o catálogo completo?" saiu igual em dois turnos
// seguidos, e a conversa travou ali.
//
// Cortar não conserta isso: a causa é a IA não ter sabido avançar. O tratamento
// é dar a ela outra chance de dizer algo NOVO, e é o que o orquestrador faz com
// este sinal (mesmo caminho do tool-call vazado no texto).
//
// Compara por igualdade normalizada e por sobreposição alta de palavras (0.9):
// idêntico pega o caso real, e a sobreposição pega a variação cosmética
// ("Olá! Qual seu nome?" / "Olá! Qual seu nome, por favor?").
const chaveRepeticao = (s: string) =>
  semAcento(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export function ehRepeticaoDe(texto: string | null | undefined, anteriores: string[]): boolean {
  const alvo = chaveRepeticao(texto ?? "");
  if (!alvo || alvo.split(" ").length < 5) return false; // curto demais para julgar
  const pal = new Set(alvo.split(" "));
  for (const a of anteriores) {
    const outra = chaveRepeticao(a);
    if (!outra) continue;
    if (outra === alvo) return true;
    const pb = new Set(outra.split(" "));
    if (Math.abs(pal.size - pb.size) > 3) continue;
    let comuns = 0;
    for (const w of pal) if (pb.has(w)) comuns++;
    const jaccard = comuns / (pal.size + pb.size - comuns);
    if (jaccard >= 0.85) return true;
  }
  return false;
}

// Confirmação CURTA do que já foi enviado.
//
// Única parte do módulo que escreve texto em vez de só remover frase, e a
// exceção é deliberada: quando a oferta obsoleta É a mensagem inteira, devolver
// o original significa perguntar "prefere que eu envie o catálogo?" DEPOIS de
// tê-lo enviado — pior que o tique que estamos tirando. A frase é factual (a
// ferramenta confirmou o envio) e é a mesma que o tool result já manda dizer.
const CONFIRMA_ENVIO: Record<string, string> = {
  catalogo: "Te mandei nosso catálogo 😊",
  orcamento: "Te mandei o orçamento em PDF 😊",
  foto: "Te mandei a foto 😊",
  opcionais: "Te mandei a imagem dos acessórios 😊",
};

export interface PolimentoResult {
  /** Texto polido. Nunca vazio: se tudo casaria, devolve o original. */
  texto: string;
  /** Frases removidas, para telemetria/evidência. */
  removidas: string[];
  /** Rótulos do que foi corrigido (entram em `guardrails`). */
  marcas: string[];
  /** Ferramenta que o pedido de permissão pedia — quem chama executa. */
  acao: string | null;
  /**
   * A resposta era SÓ cortesia: não havia nada a entregar depois do corte.
   *
   * Quem chama decide o que fazer. O certo é não enviar nada — é o que o próprio
   * prompt do cliente pede ("se não houver pergunta nova, encerre de leve ou
   * FIQUE QUIETA") — mas silenciar é ação forte, então a decisão fica com o
   * orquestrador, que sabe se o lead perguntou algo.
   */
  soCortesia: boolean;
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
  vocativosProibidos: string[] = [],
  nomeDoLead?: string | null,
  enviadoNoTurno: string[] = [],
): PolimentoResult {
  const original = reply ?? "";
  if (!original.trim()) return { texto: original, removidas: [], marcas: [], acao: null, soCortesia: false };

  const removidas: string[] = [];
  const marcas: string[] = [];
  let acao: string | null = null;

  const guardaRemovida = (frase: string) => removidas.push(frase.trim().slice(0, 140));

  // Passo 1 — clichê de disponibilidade.
  let partes = emFrases(original).filter((p) => {
    if (/^\n+$/.test(p)) return true;
    const limpa = p.trim();
    if (CLICHE.some((re) => re.test(paraCasar(limpa, nomeDoLead)))) {
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
      // O objeto pode estar na frase ANTERIOR: "posso te enviar a foto dessa
      // churrasqueira. Quer que eu envie?" — vista no replay da Rosi, onde a
      // pergunta sozinha ("Quer que eu envie?") não dizia o quê e escapava.
      let alvo = ENVIO.find((e) => e.re.test(limpa));
      if (!alvo) {
        for (let k = i - 1; k >= 0; k--) {
          if (/^\n+$/.test(partes[k])) continue;
          const ant = partes[k].trim();
          // Só vale se a frase anterior também é oferta de envio, senão
          // qualquer menção a "foto" duas frases antes viraria gatilho.
          if (PEDE_ENVIO_RE.test(ant)) alvo = ENVIO.find((e) => e.re.test(ant));
          break;
        }
      }
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

  // Passo 2.5 — OFERTA OBSOLETA: já enviou, mas o texto ainda oferece.
  //
  // O roteador garante a ferramenta DEPOIS do turno, então o modelo escreveu o
  // texto sem saber que o envio ia acontecer. Resultado visto no replay da
  // Rochelly: o catálogo FOI enviado e a mensagem perguntava "prefere que eu
  // envie o catálogo completo?" — a segunda vez seguida, e a conversa travou.
  //
  // Isto pega o que o passo 2 deixa passar de propósito: a pergunta de ESCOLHA
  // ("modelo específico OU catálogo?") é legítima enquanto o lead não escolheu.
  // Depois do envio ela não é mais — virou pergunta sobre algo que já chegou.
  let confirmacao: string | null = null;
  if (enviadoNoTurno.length) {
    const jaFoi = [
      { ferramenta: "enviar_catalogo", re: /cat[aá]logo/i, rotulo: "catalogo" },
      { ferramenta: "enviar_orcamento", re: /\b(pdf|or[cç]amento)\b/i, rotulo: "orcamento" },
      { ferramenta: "enviar_foto", re: /\b(fotos?|imagens?)\b/i, rotulo: "foto" },
      { ferramenta: "enviar_opcionais", re: /\b(opcionais|acess[oó]rios)\b/i, rotulo: "opcionais" },
    ].filter((x) => enviadoNoTurno.includes(x.ferramenta));

    if (jaFoi.length) {
      const mantidas: string[] = [];
      for (const p of partes) {
        const limpa = p.trim();
        const alvo = /^\n+$/.test(p) || !ehPergunta(limpa) || !PEDE_ENVIO_RE.test(limpa)
          ? undefined
          : jaFoi.find((x) => x.re.test(limpa));
        if (!alvo) { mantidas.push(p); continue; }
        guardaRemovida(limpa);
        const marca = `oferta_obsoleta:${alvo.rotulo}`;
        if (!marcas.includes(marca)) marcas.push(marca);
        if (confirmacao === null) confirmacao = CONFIRMA_ENVIO[alvo.rotulo] ?? null;
      }
      partes = mantidas;
    }
  }

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

  let texto = recolar(partes);

  // Vocativo recusado pelo intake ("Prazer, Dia!"): sai por último, sobre o
  // texto já polido.
  for (const v of vocativosProibidos) {
    const antes = texto;
    texto = removerVocativo(texto, v);
    if (texto !== antes && !marcas.includes("vocativo_invalido")) marcas.push("vocativo_invalido");
  }

  // Sobrou nada — ou sobrou só interjeição. Devolve o original: estilo não
  // justifica calar a resposta (ver cabeçalho). Medido contra tráfego real, o
  // caso que exigiu a segunda metade da guarda foi o Wilson (08/09): as duas
  // frases de conteúdo eram repetição, e o corte deixava "🔥 Que massa!" — uma
  // mensagem que não diz nada é pior que uma que se repete.
  const insignificante = removidas.length > 0
    && texto.replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean).length < 3;
  if (!texto || insignificante) {
    // Exceção: a oferta obsoleta não pode voltar — o envio JÁ aconteceu.
    if (confirmacao) {
      const comNome = nomeDoLead && nomeDoLead.trim().length >= 2
        ? confirmacao.replace(/^Te mandei/, `${nomeDoLead.trim()}, te mandei`)
        : confirmacao;
      return { texto: comNome, removidas, marcas: [...marcas, "confirmou_envio"], acao, soCortesia: false };
    }
    // Tudo que saiu era cortesia/clichê? Então não havia conteúdo nenhum na
    // mensagem — sinaliza para quem chama poder ficar quieto.
    const tudoCortesia = marcas.some((m) => m === "cliche" || m.startsWith("permissao:"))
      && !marcas.some((m) => m === "repetida" || m.startsWith("oferta_obsoleta"));
    return { texto: original, removidas, marcas: [...marcas, "resto_insuficiente"], acao, soCortesia: tudoCortesia };
  }
  return { texto, removidas, marcas, acao, soCortesia: false };
}
