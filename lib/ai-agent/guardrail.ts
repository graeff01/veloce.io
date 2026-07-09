// Guardrail de saída — segunda linha de defesa (a 1ª é o system prompt).
// Regras desacopladas por VERTICAL: o conjunto padrão é escolhido pelo segmento do
// tenant; um cliente pode sobrescrever via config (blockedTopics). O motor é único.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface BlockRule { re: RegExp; reason: string }
export interface GuardrailResult { allowed: boolean; reason?: string }

// BASE universal — vale para TODO vertical (nenhum atendente pode negociar/prometer
// fechamento em nome da empresa). Sempre aplicada, inclusive junto de regras custom.
const BASE: BlockRule[] = [
  { re: /(garanto que|prometo que|pode fechar comigo|fechamos por|pode confiar que)/, reason: "fez promessa/negociação" },
  { re: /(dou .*desconto|fa[cz]o por r\$|deixo .*por r\$|abaixo de r\$|ultimo pre[cz]o)/, reason: "tentou oferecer desconto" },
  { re: /(\d+\s*x de r\$|\d+\s*parcelas de|entrada de r\$|parcela.*r\$\s*\d)/, reason: "tentou simular parcelamento" },
];

// Padrão do vertical AUTOMOTIVO (comportamento histórico — sobre a BASE).
const AUTOMOTIVO: BlockRule[] = [
  { re: /(desconto de|consigo .*(por|a) r\$)/, reason: "tentou oferecer desconto" },
  { re: /(financiamento aprovado|credito aprovado|aprovo (seu|o financiamento)|consigo aprovar)/, reason: "tentou aprovar financiamento" },
  { re: /(avalio sua troca em|sua troca vale|dou r\$.*pela.*troca|aceito sua troca por)/, reason: "tentou avaliar troca" },
];

// Padrão de produto/serviço configurável (móveis, esquadrias, instalação...):
// não comprometer prazo, medida ou viabilidade de instalação sem vendedor.
const CONFIGURAVEL: BlockRule[] = [
  { re: /(garanto (a )?entrega|prazo garantido|entrego em \d+|fica pronto em \d+)/, reason: "prometeu prazo de entrega" },
  { re: /(cabe (certinho|perfeitamente)|com certeza instala|instala[cç][aã]o garantida|serve no seu)/, reason: "garantiu medida/viabilidade de instalação" },
];

// Conjuntos padrão por vertical. Novos segmentos entram aqui (sem mexer no motor).
const DEFAULT_BY_VERTICAL: Record<string, BlockRule[]> = {
  automotivo: AUTOMOTIVO,
  configuravel: CONFIGURAVEL,
  geral: [],
};

// Resolve as regras efetivas: BASE (sempre) + (override do tenant OU padrão do vertical).
export function resolveBlockRules(vertical: string, custom?: { pattern: string; reason: string }[] | null): BlockRule[] {
  const extra = custom && custom.length
    ? custom.map((c) => ({ re: new RegExp(norm(c.pattern)), reason: c.reason }))
    : (DEFAULT_BY_VERTICAL[vertical] ?? AUTOMOTIVO);
  return [...BASE, ...extra];
}

export function checkReply(text: string, rules: BlockRule[]): GuardrailResult {
  const t = norm(text);
  for (const f of rules) {
    if (f.re.test(t)) return { allowed: false, reason: f.reason };
  }
  return { allowed: true };
}
