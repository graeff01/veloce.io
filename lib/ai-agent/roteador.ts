// ── Roteador determinístico ───────────────────────────────────────────────────
// Quando o estado da conversa admite UMA ação certa, ela não se pede ao modelo:
// ela se impõe.
//
// POR QUE ISTO EXISTE. Medido na JR em 19/09: o prompt tem 188 ordens
// imperativas em 56 mil caracteres, e 77% delas são MECÂNICAS — condição
// calculável, não redação. Cada erro virava uma regra nova, que competia com as
// outras 187 e derrubava a aderência de todas. O placar contra produção:
//
//   trava de CÓDIGO  (vídeo 1x/contato)        0 violações em 13 envios
//   trava de CÓDIGO  (catálogo 1x/categoria)   0 violações em 5 envios
//   regra de PROMPT  ("é PROIBIDO pedir permissão")   6 furos em 538 respostas
//   regra de PROMPT  ("NUNCA re-anuncie o vídeo")     8 furos com 13 vídeos (~60%)
//
// A última está em caixa alta, com NUNCA. Não adianta gritar mais alto.
//
// LIMITE DELIBERADO: isto NÃO decide conversa. Só atua quando existe uma única
// ação certa e ela é calculável. Tom, redação e pergunta nova continuam do
// modelo — é o que ele faz bem. Regra que precise de julgamento não entra aqui.
//
// As regras são DADO (PricingConfig.rules.roteador), não código: nenhum nome de
// produto de cliente entra no motor, e mudar uma regra não pede deploy.
//
// Módulo PURO — testável em tests/roteador.test.ts.

export interface RegraRoteador {
  /** identificador curto, aparece na telemetria */
  id: string;
  /** dispara quando a mensagem do lead casa isto */
  quando: string;
  /** ...e NÃO casa isto (a exceção que evita perguntar o que ele já respondeu) */
  excetoSe?: string;
  /** ...e este texto ainda não apareceu em nenhuma resposta anterior da conversa */
  sóSeInédito?: string;
  /** resposta imposta. {nome} vira o nome do lead, se houver */
  responder: string;
  /**
   * Como reconhecer essa mesma pergunta NAS PALAVRAS DO MODELO.
   *
   * Existe porque impor não basta. Medido em 19/09: com "gourmet com fogão 4
   * bocas" a regra corretamente NÃO disparou (ele já especificou) — e o modelo
   * perguntou do mesmo jeito, por conta própria. Impor cobre "tem que dizer X";
   * isto cobre "não pode dizer X", que é metade dos erros.
   *
   * Quando a condição da regra NÃO vale e a assinatura aparece na resposta, a
   * frase sai. É o mesmo formato do invariante da promessa de alterar cadastro.
   */
  assinatura?: string;
  /**
   * Garante que uma FERRAMENTA aconteceu neste turno.
   *
   * Impor texto e suprimir texto cobrem o que a IA DIZ. Isto cobre o que ela
   * FAZ — e é o que mais custa venda: medido em 19/09, o cliente nomeia o
   * modelo ("quero a gourmet com fogão 4 bocas"), o prompt usa LITERALMENTE
   * esse exemplo na regra que manda enviar a foto, e a foto não sai.
   *
   * Não força ANTES (o que atropelaria o julgamento do modelo sobre a hora
   * certa): confere DEPOIS se a ferramenta foi chamada e, se não foi, chama.
   * O argumento sai do grupo de captura 1 de `quando`.
   */
  garantirFerramenta?: string;
  /**
   * Argumentos fixos da ferramenta garantida. Sem isto o argumento só podia vir
   * do grupo de captura — serve para enviar_foto (o termo está na mensagem),
   * não para enviar_catalogo (a categoria vem da REGRA, não do texto do lead).
   */
  garantirArgs?: Record<string, string>;
  /**
   * O QUARTO sentido: ACRESCENTA um aviso obrigatório quando a própria resposta
   * fala do produto que o exige.
   *
   * Impor, suprimir e garantir cobrem "tem que dizer", "não pode dizer" e "tem
   * que fazer". Falta "não pode dizer SEM dizer também" — o aviso que o acervo
   * marca como obrigatório e que se perde porque o conhecimento chega em 3 dos
   * 29 blocos por resposta.
   *
   * Caso real (JR, 08/09/2026): o acervo diz "AVISE SEMPRE que o cliente
   * escolher ou considerar a Linha Popular: ela NÃO é 100% refratária, por isso
   * NÃO permite uso de lenha e NÃO pode ficar exposta ao tempo". Dois leads
   * escolheram a Popular e nenhum foi avisado — e um deles (Bill Barbosa,
   * 08/09 08:32) escreveu em seguida "Quero poder colocar lenha". Ia comprar o
   * produto errado, e lenha em peça não refratária é risco físico, não só
   * insatisfação.
   *
   * `avisoSe` casa a RESPOSTA da IA (não a mensagem do lead): o gatilho é ela
   * ter mencionado o produto, por qualquer caminho — tool de catálogo,
   * conhecimento ou texto livre. É o único ponto que pega os três.
   *
   * Use com `sóSeInédito` para o aviso sair UMA vez por conversa.
   */
  avisoSe?: string;
  /** Texto do aviso, anexado como bloco próprio no fim da resposta. */
  avisoTexto?: string;
  /**
   * Só vale se a IA JÁ tiver dito isto antes na conversa. É o espelho de
   * `sóSeInédito`: aquele impede repetir, este exige o contexto.
   *
   * Nasceu de um caso real: ela oferece "modelo específico ou catálogo
   * completo?", o cliente responde "pode mandar" — e ela REPETE a pergunta.
   * "pode mandar" só significa "mande o catálogo" se o catálogo tiver sido
   * oferecido; solto, não quer dizer nada.
   */
  sóSeJáDito?: string;
}

export interface Decisao {
  id: string;
  texto: string;
}

export interface Supressao {
  id: string;
  texto: string;
  removidas: string[];
}

const semAcento = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function compila(p: string): RegExp | null {
  try { return new RegExp(p, "i"); } catch { return null; }
}

/** Lê e valida as regras. Regra malformada é descartada, não derruba o turno. */
export function lerRegras(rules: unknown): RegraRoteador[] {
  const bruto = (rules as { roteador?: unknown } | null)?.roteador;
  if (!Array.isArray(bruto)) return [];
  const out: RegraRoteador[] = [];
  const vistos = new Set<string>();
  for (const item of bruto) {
    const r = item as Partial<RegraRoteador> | null;
    const id = String(r?.id ?? "").trim();
    const quando = String(r?.quando ?? "").trim();
    const responder = String(r?.responder ?? "").trim();
    // `responder` é opcional quando a regra só garante ferramenta ou só suprime:
    // exigir texto nessas descartaria a regra em silêncio, que foi como a
    // supressão ficou morta na primeira versão.
    const soAcao = !!r?.garantirFerramenta || !!r?.assinatura || (!!r?.avisoSe && !!r?.avisoTexto);
    if (!id || !quando || (!responder && !soAcao) || vistos.has(id)) continue;
    if (!compila(quando)) continue;
    if (r?.excetoSe && !compila(String(r.excetoSe))) continue;
    if (r?.assinatura && !compila(String(r.assinatura))) continue;
    if (r?.avisoSe && !compila(String(r.avisoSe))) continue;
    vistos.add(id);
    out.push({
      id, quando, responder,
      excetoSe: r?.excetoSe ? String(r.excetoSe) : undefined,
      sóSeInédito: r?.sóSeInédito ? String(r.sóSeInédito) : undefined,
      sóSeJáDito: r?.sóSeJáDito ? String(r.sóSeJáDito) : undefined,
      assinatura: r?.assinatura ? String(r.assinatura) : undefined,
      avisoSe: r?.avisoSe ? String(r.avisoSe) : undefined,
      avisoTexto: r?.avisoTexto ? String(r.avisoTexto) : undefined,
      garantirFerramenta: r?.garantirFerramenta ? String(r.garantirFerramenta) : undefined,
      garantirArgs: r?.garantirArgs && typeof r.garantirArgs === "object" ? { ...r.garantirArgs } : undefined,
    });
  }
  return out;
}

/**
 * Decide se este turno tem uma resposta obrigatória.
 *
 * `anteriores` são as respostas JÁ enviadas na conversa — é o que impede a
 * mesma pergunta de sair duas vezes, que seria trocar um erro por outro.
 */
export function decidir(
  regras: RegraRoteador[],
  inbound: string | null | undefined,
  anteriores: string[],
  nome?: string | null,
): Decisao | null {
  const t = semAcento(inbound ?? "");
  if (!t.trim()) return null;
  const jaDito = anteriores.map(semAcento);

  for (const r of regras) {
    if (!r.responder) continue; // regra só de ação, não impõe texto
    const re = compila(r.quando);
    if (!re || !re.test(t)) continue;
    if (r.excetoSe) { const ex = compila(r.excetoSe); if (ex && ex.test(t)) continue; }
    if (r.sóSeInédito) {
      const marca = semAcento(r.sóSeInédito);
      if (jaDito.some((a) => a.includes(marca))) continue;
    }
    // Sem nome ainda, tira o vocativo em vez de escrever "undefined,".
    const texto = nome
      ? r.responder.replace(/\{nome\}/g, nome)
      : r.responder.replace(/\{nome\},?\s*/g, "").replace(/^([a-zà-ú])/, (c) => c.toUpperCase());
    return { id: r.id, texto };
  }
  return null;
}

/** A condição da regra vale para esta mensagem? (mesma lógica usada por decidir) */
function condicaoVale(r: RegraRoteador, t: string): boolean {
  const re = compila(r.quando);
  if (!re || !re.test(t)) return false;
  if (r.excetoSe) { const ex = compila(r.excetoSe); if (ex && ex.test(t)) return false; }
  return true;
}

/**
 * O outro lado da mesma regra: se a condição NÃO vale, a pergunta dela não pode
 * sair — nem que o modelo resolva fazê-la sozinho.
 *
 * Remove a FRASE, não a resposta: o resto costuma estar certo, e derrubar tudo
 * calaria um atendimento bom por causa de uma oração.
 */
export function suprimir(
  regras: RegraRoteador[],
  inbound: string | null | undefined,
  reply: string | null | undefined,
): Supressao | null {
  const t = semAcento(inbound ?? "");
  const r0 = reply ?? "";
  if (!t.trim() || !r0.trim()) return null;

  for (const r of regras) {
    if (!r.assinatura) continue;
    // Só suprime quando a regra tinha motivo para NÃO disparar. Se a condição
    // vale, a pergunta é legítima (e provavelmente veio do próprio roteador).
    if (condicaoVale(r, t)) continue;
    // E só se o assunto da regra estiver em jogo — senão suprimiríamos frases
    // de conversas que nada têm a ver.
    const gatilho = compila(r.quando);
    if (!gatilho || !gatilho.test(t)) continue;

    const assin = compila(r.assinatura);
    if (!assin || !assin.test(semAcento(r0))) continue;

    const removidas: string[] = [];
    const partes: string[] = [];
    for (const linha of r0.split(/(\n+)/)) {
      if (/^\n+$/.test(linha)) { partes.push(linha); continue; }
      for (const frase of linha.split(/(?<=[.!?…])\s+/)) {
        if (!frase) continue;
        if (assin.test(semAcento(frase))) { removidas.push(frase.trim().slice(0, 140)); continue; }
        partes.push(frase);
      }
    }
    if (!removidas.length) continue;
    const texto = partes.join(" ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { id: r.id, texto, removidas };
  }
  return null;
}

/**
 * O turno exigia uma ferramenta que não foi chamada?
 *
 * Devolve o que precisa acontecer, para quem chama executar. Não executa aqui:
 * o módulo é puro de propósito — é o que o torna testável sem banco nem rede.
 */
export function garantir(
  regras: RegraRoteador[],
  inbound: string | null | undefined,
  chamadasDoTurno: string[],
  anteriores: string[] = [],
): { id: string; ferramenta: string; args: Record<string, string> } | null {
  const t = semAcento(inbound ?? "");
  if (!t.trim()) return null;
  const jaDito = anteriores.map(semAcento);
  for (const r of regras) {
    if (!r.garantirFerramenta) continue;
    if (chamadasDoTurno.includes(r.garantirFerramenta)) continue; // já aconteceu
    const re = compila(r.quando);
    if (!re) continue;
    const m = t.match(re);
    if (!m) continue;
    if (r.excetoSe) { const ex = compila(r.excetoSe); if (ex && ex.test(t)) continue; }
    if (r.sóSeJáDito) {
      const marca = semAcento(r.sóSeJáDito);
      if (!jaDito.some((a) => a.includes(marca))) continue; // falta o contexto
    }
    if (r.garantirArgs) return { id: r.id, ferramenta: r.garantirFerramenta, args: { ...r.garantirArgs } };
    // Sem argumento fixo, o termo vem da captura. Sem captura, não chuta.
    const termo = (m[1] ?? "").trim();
    if (!termo) continue;
    return { id: r.id, ferramenta: r.garantirFerramenta, args: { termo } };
  }
  return null;
}

export interface Acrescimo {
  id: string;
  texto: string;
  aviso: string;
}

/**
 * A resposta menciona um produto cujo aviso é obrigatório e não o traz?
 *
 * Devolve a resposta COM o aviso anexado como bloco próprio (no WhatsApp cada
 * bloco vira uma mensagem, então o aviso chega destacado em vez de diluído).
 *
 * Não reescreve nada do que a IA disse: só acrescenta. `sóSeInédito` evita que
 * o aviso vire ladainha em conversa longa.
 */
export function acrescentar(
  regras: RegraRoteador[],
  reply: string | null | undefined,
  anteriores: string[] = [],
): Acrescimo | null {
  const r0 = reply ?? "";
  if (!r0.trim()) return null;
  const alvo = semAcento(r0);
  const jaDito = anteriores.map(semAcento);

  for (const r of regras) {
    if (!r.avisoSe || !r.avisoTexto) continue;
    const re = compila(r.avisoSe);
    if (!re || !re.test(alvo)) continue;
    // Já está nesta própria resposta? Então o modelo avisou sozinho.
    const marcaAviso = semAcento(r.sóSeInédito ?? r.avisoTexto).slice(0, 60);
    if (marcaAviso && alvo.includes(marcaAviso)) continue;
    // Já saiu antes na conversa?
    if (r.sóSeInédito) {
      const marca = semAcento(r.sóSeInédito);
      if (jaDito.some((a) => a.includes(marca))) continue;
    }
    return { id: r.id, texto: `${r0.trim()}\n\n${r.avisoTexto.trim()}`, aviso: r.avisoTexto.trim() };
  }
  return null;
}
