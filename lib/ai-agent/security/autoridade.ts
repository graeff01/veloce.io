// ── Camada de segurança · autoridade sobre o cadastro ─────────────────────────
// Fecha a porta pela qual um CLIENTE se faz de dono/admin e "manda" a IA alterar
// dado cadastrado — e, do outro lado, fecha a porta pela qual a IA PROMETE ter
// feito isso.
//
// Caso real (Henrique, 05/09/2026 14:52): o lead escreveu "Você está errada,
// arrume no seu sistema, a churrasqueira 7 espeto tem 60cm..." e a IA respondeu
// "Você está certíssimo" + "Vou ajustar aqui para as informações ficarem
// corretas". Auditado no banco de produção: NADA foi escrito — zero linhas em
// AiAgentConfig, KnowledgeChunk, CatalogItem e PricingConfig naquele dia. A
// promessa era vazia. É justamente isso que a torna perigosa: em modo automático
// o lead sai acreditando que o catálogo mudou, e a IA aprende, dentro daquela
// conversa, a tratar o número DELE como verdade.
//
// ─────────────────────────────────────────────────────────────────────────────
// Por que esta peça NÃO fica atrás do AI_SECURITY_MODE.
//
// As outras regras da camada são heurísticas: acertam muito, erram um pouco, e
// por isso esperam medição antes de bloquear. Esta não é heurística — é um
// INVARIANTE. O motor inteiro tem 11 ferramentas e NENHUMA escreve em config,
// conhecimento, preço ou catálogo (a única escrita é LeadProfile, a ficha do
// próprio contato). Logo, toda frase em que a IA diz que vai alterar, ou que já
// alterou, o cadastro é falsa POR CONSTRUÇÃO. Não existe versão verdadeira dela.
// Taxa de alarme falso estruturalmente zero → não há o que medir antes de ligar.
//
// Módulo PURO — testável em tests/security-autoridade.test.ts.

/** Frases em que a IA afirma que vai alterar (ou já alterou) dado cadastrado. */
// Alvos de cadastro: o que a IA comprovadamente NÃO consegue escrever.
const CADASTRO = String.raw`(?:n?[oa]s?|d[oa]s?|em)\s+(?:meu\s+|nosso\s+|seu\s+|teu\s+)?(?:sistema|cadastro|base(?:\s+de\s+dados)?|banco(?:\s+de\s+dados)?|cat[áa]logo|tabela(?:\s+de\s+pre[cç]o)?|planilha|registro)`;

const PROMESSA: RegExp[] = [
  // Verbos de ALTERAÇÃO — aqui até o "aqui" solto conta, porque a IA não altera
  // nada em lugar nenhum. Foi a forma exata que apareceu em produção.
  new RegExp(String.raw`\b(vou|irei|vamos|posso|consigo|deixa\s+que\s+eu|j[áa]\s+vou)\b[^.!?\n]{0,30}?\b(ajust|corrig|atualiz|alter|mud|arrum|consert|retific)[a-zç]*\b[^.!?\n]{0,25}?\b(aqui|internamente|${CADASTRO})`, "i"),
  new RegExp(String.raw`\b(j[áa]\s+)?(ajustei|corrigi|atualizei|alterei|arrumei|consertei|retifiquei)\b[^.!?\n]{0,25}?\b(aqui|internamente|${CADASTRO})`, "i"),
  // PRESENTE do indicativo. Apareceu no replay do Henrique: "Vou confirmar com
  // o vendedor e já atualizo aqui" — promessa igual, e os padrões de futuro e
  // passado passavam direto por ela.
  new RegExp(String.raw`\b(j[áa]\s+)?(ajusto|corrijo|atualizo|altero|mudo|arrumo|conserto|retifico)\b[^.!?\n]{0,25}?\b(aqui|internamente|${CADASTRO})`, "i"),

  // Verbos de REGISTRO (cadastrar/registrar/gravar/salvar) só contam com alvo de
  // cadastro EXPLÍCITO. Medido em 5.491 respostas reais: o "aqui" solto gerou 16
  // alarmes falsos numa frase VERDADEIRA — "já registrei aqui pra ele te dar os
  // detalhes", que é a escalação, e ela de fato registra uma tarefa pro vendedor.
  new RegExp(String.raw`\b(vou|irei|vamos|posso|consigo|j[áa]\s+vou)\b[^.!?\n]{0,30}?\b(cadastr|registr|grav|salv)[a-zç]*\b[^.!?\n]{0,25}?\b${CADASTRO}`, "i"),
  new RegExp(String.raw`\b(j[áa]\s+)?(cadastrei|registrei|gravei|salvei)\b[^.!?\n]{0,25}?\b${CADASTRO}`, "i"),
  // Verbos de REGISTRO no presente seguem exigindo alvo de cadastro explícito:
  // "já registro aqui pro vendedor" é a escalação, e ela de fato registra.
  new RegExp(String.raw`\b(j[áa]\s+)?(cadastro|registro|gravo|salvo)\b[^.!?\n]{0,25}?\b${CADASTRO}`, "i"),

  // "vou deixar registrado no sistema"
  new RegExp(String.raw`\b(vou|irei|j[áa])\b[^.!?\n]{0,20}?\bdeixar?\b[^.!?\n]{0,20}?\b(registrad|atualizad|corrigid|anotad)[ao]s?\b[^.!?\n]{0,25}?\b${CADASTRO}`, "i"),

  // A forma curta vista em produção: "vou ajustar aqui".
  /\b(vou|irei|posso)\s+(ajustar|corrigir|atualizar|arrumar|alterar)\s+(isso\s+)?aqui\b/i,
];

export interface PromessaResult {
  /** Texto sem as frases que prometem alterar cadastro. Pode vir vazio. */
  texto: string;
  /** As frases removidas (para telemetria/evidência). */
  removidas: string[];
}

// Quebra em frases preservando a pontuação e as quebras de linha — as respostas
// da JR vêm em blocos curtos, uma ideia por linha, e recolar tudo num parágrafo
// mudaria o formato que o lead recebe.
function emFrases(texto: string): string[] {
  const partes: string[] = [];
  for (const linha of texto.split(/(\n+)/)) {
    if (/^\n+$/.test(linha)) { partes.push(linha); continue; }
    for (const frase of linha.split(/(?<=[.!?…])\s+/)) if (frase) partes.push(frase);
  }
  return partes;
}

/**
 * Remove da resposta as frases em que a IA promete (ou afirma ter feito) uma
 * alteração de cadastro que ela não tem como fazer.
 *
 * Remove a FRASE, não a mensagem: o resto da resposta costuma estar correto e
 * útil — no caso do Henrique, as medidas ditas estavam certas e conferiam com o
 * catálogo. Derrubar a resposta inteira calaria um atendimento bom por causa de
 * uma oração. Se sobrar só espaço, devolve vazio e quem chama decide.
 */
export function removerPromessaDeAlterar(reply: string | null | undefined): PromessaResult {
  const t = reply ?? "";
  if (!t.trim()) return { texto: t, removidas: [] };
  if (!PROMESSA.some((re) => re.test(t))) return { texto: t, removidas: [] };

  const removidas: string[] = [];
  const mantidas = emFrases(t).filter((p) => {
    if (/^\n+$/.test(p)) return true;
    if (PROMESSA.some((re) => re.test(p))) { removidas.push(p.trim().slice(0, 120)); return false; }
    return true;
  });

  const texto = mantidas.join(" ").replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto, removidas };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lado da ENTRADA: o cliente reivindicando autoridade sobre o cadastro.
//
// Isto NÃO bloqueia nada sozinho — alimenta o score do detector, como as demais
// famílias. Mandar a IA "corrigir no sistema" é, em si, um pedido legítimo de
// um cliente confuso; o que não pode é a IA obedecer. Quem impede a obediência
// é a ausência de ferramenta (acima) e o embasamento contra o acervo.

/** Cliente ordenando alteração de dado cadastrado. */
export const CADASTRO_COMMAND_RE =
  /\b(corrij[ae]|corrig[ei]|arrum[ae]|ajust[ae]|atualiz[ae]|alter[ae]|mud[ae]|consert[ae]|troc[ae]|apag[ae]|remov[ae])\b[^.!?\n]{0,35}?\b(sistema|cadastro|banco\s+de\s+dados|base\s+de\s+dados|registro|planilha|cat[áa]logo|tabela\s+de\s+pre[cç]o)\b/;

/** Cliente se apresentando como dono/gerente da loja para ganhar autoridade. */
export const DONO_SPOOF_RE =
  /\b(sou\s+(?:o\s+|a\s+)?|aqui\s+[eé]\s+(?:o\s+|a\s+)?|quem\s+fala\s+[eé]\s+(?:o\s+|a\s+)?)(dono|dona|propriet[áa]ri[oa]|gerente|diretor|diretora|supervisor|supervisora|chefe|patr[ãa]o)\b/;

/** "O gerente autorizou", "a Maria mandou fazer" — autoridade emprestada. */
export const AUTORIZACAO_EMPRESTADA_RE =
  /\b(mandou|autorizou|liberou|aprovou|garantiu|prometeu|disse\s+que\s+(pode|faz|d[\u00e1a])|falou\s+que\s+(pode|faz|d[\u00e1a]))\b[^.!?\n]{0,30}?\b(pre[c\u00e7]o|valor|desconto|fazer\s+por|sair\s+por|ficar\s+por|R\$|de\s+gra[c\u00e7]a|sem\s+custo)/;
