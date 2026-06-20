// Detecção determinística de opt-out (LGPD). É uma trava de segurança — NÃO depende
// do LLM decidir. Conservadora de propósito: só dispara em frases inequívocas de
// "pare de me mandar mensagem", evitando falsos positivos (parcelamento, comparar...).

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Cada regra exige uma intenção CLARA de não receber mais mensagens.
const OPT_OUT_PATTERNS: RegExp[] = [
  /\bpar[ae]\s+(de\s+)?(me\s+)?(mandar|enviar|encher|perturbar)/, // "para de me mandar", "pare de enviar"
  /\bn[ãa]o\s+(quero|desejo)\s+(mais\s+)?(receber|mensage|ser\s+incomodad)/,
  /\bn[ãa]o\s+me\s+(mande|envie|perturbe|incomode|encha)/,
  /\bme\s+(tira|remove|retira|exclui)\s+(da\s+)?(lista|grupo|cadastro)/,
  /\b(sair|me\s+tirar)\s+da\s+lista/,
  /\bdescadastr/,
  /\bcancelar?\s+(a\s+)?(inscri[cç][ãa]o|cadastro|recebimento)/,
  /\bn[ãa]o\s+perturbe?\b/,
  /\bpare\s+de\s+me/,
  /\bme\s+esque[cç]/,                                      // "me esquece", "me esqueça", "me esquecer"
  /\bme\s+(deixa|deixe)\s+(em\s+paz|quieto|sossegad)/,     // "me deixa em paz"
  /\bn[ãa]o\s+(me\s+)?(manda|mande|envia|envie|chama|chame)\s+mais/, // "não me manda mais"
  /\bperdi\s+o\s+interesse|\bdesisti\b|\bn[ãa]o\s+tenho\s+(mais\s+)?interesse/,
  /\bme\s+(bloqueia|exclui|apaga)\b/,
  /\bpara\s+com\s+isso\b/,
  /^\s*(stop|sair|cancelar|parar|chega|para)\s*[!.]*\s*$/,  // mensagem isolada com a palavra-chave
];

export function isOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = norm(text);
  if (t.length > 200) return false; // textos longos raramente são opt-out puro
  return OPT_OUT_PATTERNS.some((re) => re.test(t));
}

export const OPT_OUT_REPLY =
  "Entendido — não vou mais te enviar mensagens automáticas. 🙏 Se mudar de ideia, é só chamar; e no horário comercial um vendedor pode te atender normalmente.";
