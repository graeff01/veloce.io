// Guardrail de saída — segunda linha de defesa (a 1ª é o system prompt).
// Regras desacopladas por VERTICAL: o conjunto padrão é escolhido pelo segmento do
// tenant; um cliente pode sobrescrever via config (blockedTopics). O motor é único.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface BlockRule { re: RegExp; reason: string }
export interface GuardrailResult { allowed: boolean; reason?: string }

// Padrão do vertical AUTOMOTIVO (comportamento histórico — inalterado).
const AUTOMOTIVO: BlockRule[] = [
  { re: /(desconto de|dou .*desconto|consigo .*(por|a) r\$|deixo .*por r\$|fa[cz]o por r\$|abaixo de r\$|ultimo pre[cz]o)/, reason: "tentou oferecer desconto" },
  { re: /(deixo|fa[cz]o|consigo|sai|fica|por)\s.{0,12}\d+\s*mil\b/, reason: "tentou negociar valor (X mil)" },
  { re: /\b\d+\s*mil\s*(a vista|no pix|fechado|pra voce|pra ti)/, reason: "tentou negociar valor à vista" },
  { re: /(\d+\s*x de r\$|\d+\s*parcelas de|entrada de r\$|parcela.*r\$\s*\d)/, reason: "tentou simular parcelamento" },
  { re: /(financiament\w*.{0,14}aprovad|credito.{0,14}aprovad|aprovo (seu |o )?financiament|consigo aprovar)/, reason: "tentou aprovar financiamento" },
  { re: /(avalio sua troca em|sua troca vale|dou r\$.*pela.*troca|aceito sua troca por)/, reason: "tentou avaliar troca" },
  { re: /(garanto que|prometo que|pode fechar comigo|fechamos por)/, reason: "fez promessa/negociação" },
];

// Vertical IMOBILIÁRIO: não negociar valor/condição, não reservar/prometer unidade.
const IMOBILIARIO: BlockRule[] = [
  { re: /(desconto de|dou .*desconto|consigo .*(por|a) r\$|deixo .*por r\$|abaixo de r\$|baixo .*o valor|negocio o valor)/, reason: "tentou negociar valor do imóvel" },
  { re: /\b\d+\s*mil\s*(a vista|no pix|fechado|pra voce|pra ti)/, reason: "tentou negociar valor à vista" },
  { re: /(consigo|deixo|fa[cz]o|sai|fica)\s.{0,12}\d+\s*mil\b/, reason: "tentou negociar valor (X mil)" },
  { re: /(\d+\s*x de r\$|entrada de r\$|parcela.*r\$\s*\d|financiament\w*.{0,14}aprovad|aprovo (seu |o )?financiament)/, reason: "tentou simular/aprovar financiamento" },
  { re: /(reservo (a|o|sua) unidade|garanto (a|o|sua) unidade|seguro (o|a) im[oó]vel|prometo (a|o) im[oó]vel|fecho com voc[eê])/, reason: "tentou reservar/prometer unidade" },
  { re: /(garanto que|prometo que|pode fechar comigo|fechamos por)/, reason: "fez promessa/negociação" },
];

// Vertical genérico de SERVIÇOS: não fechar preço/contrato nem prometer prazo/resultado.
const SERVICOS: BlockRule[] = [
  { re: /(desconto de|dou .*desconto|consigo .*(por|a) r\$|deixo .*por r\$|abaixo de r\$|fa[cz]o por r\$)/, reason: "tentou dar desconto" },
  { re: /(\d+\s*x de r\$|parcela.*r\$\s*\d|fecho o contrato|assino (o|seu) contrato|valor final e r\$)/, reason: "tentou fechar preço/contrato" },
  { re: /(garanto (o |o seu )?resultado|prometo (o |o seu )?resultado|garanto (o |que vai)|prazo garantido)/, reason: "prometeu prazo/resultado" },
  { re: /(garanto que|prometo que|pode fechar comigo|fechamos por)/, reason: "fez promessa/negociação" },
];

// Conjuntos padrão por vertical. Novos segmentos entram aqui (sem mexer no motor).
const DEFAULT_BY_VERTICAL: Record<string, BlockRule[]> = {
  automotivo: AUTOMOTIVO,
  imobiliario: IMOBILIARIO,
  servicos: SERVICOS,
  generico: SERVICOS,
};

// Regras UNIVERSAIS (segurança) — anti-vazamento de prompt/instruções. Aplicadas SEMPRE,
// inclusive sobre override do tenant. 2ª linha de defesa contra prompt injection.
const UNIVERSAL: BlockRule[] = [
  { re: /(regras absolutas|prompt do sistema|system prompt|minhas instru[cç][oõ]es (s[aã]o|internas|completas)|repetir (as )?instru[cç][oõ]es|fui instru[ií]d[oa] a|conforme (as )?instru[cç][oõ]es acima)/, reason: "tentou vazar instruções/prompt do sistema" },
  // Handoff: a IA NÃO chama ninguém na hora — quem é acionado é o vendedor, que ENTRA EM CONTATO.
  // "vou chamar um vendedor" é promessa falsa de disponibilidade imediata (e some sem a tool escalar_humano).
  { re: /\bchamar\s+(um |o |a |uma |)?(vendedor|atendente|consultor|colega|especialista|algu[eé]m|equipe)/, reason: "prometeu chamar vendedor na hora (deve acionar handoff: vendedor entra em contato)" },
  // Gíria/informalidade proibida (risada "kkk").
  { re: /\bk{3,}\b/, reason: "usou gíria kkk" },
];

// Resolve as regras efetivas: UNIVERSAL + (override do tenant > padrão do vertical > genérico).
// Vertical desconhecido cai em SERVIÇOS (genérico), não em regras automotivas.
export function resolveBlockRules(vertical: string, custom?: { pattern: string; reason: string }[] | null): BlockRule[] {
  const base = (custom && custom.length)
    ? custom.map((c) => ({ re: new RegExp(norm(c.pattern)), reason: c.reason }))
    : (DEFAULT_BY_VERTICAL[vertical] ?? SERVICOS);
  return [...UNIVERSAL, ...base];
}

export function checkReply(text: string, rules: BlockRule[]): GuardrailResult {
  const t = norm(text);
  for (const f of rules) {
    if (f.re.test(t)) return { allowed: false, reason: f.reason };
  }
  return { allowed: true };
}
