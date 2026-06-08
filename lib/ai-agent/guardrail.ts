// Guardrail de saída — segunda linha de defesa (a 1ª é o system prompt).
// Regras desacopladas por VERTICAL: o conjunto padrão é escolhido pelo segmento do
// tenant; um cliente pode sobrescrever via config (blockedTopics). O motor é único.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface BlockRule { re: RegExp; reason: string }
export interface GuardrailResult { allowed: boolean; reason?: string }

// Padrão do vertical AUTOMOTIVO (comportamento histórico — inalterado).
const AUTOMOTIVO: BlockRule[] = [
  { re: /(desconto de|dou .*desconto|consigo .*(por|a) r\$|deixo .*por r\$|fa[cz]o por r\$|abaixo de r\$|ultimo pre[cz]o)/, reason: "tentou oferecer desconto" },
  { re: /(\d+\s*x de r\$|\d+\s*parcelas de|entrada de r\$|parcela.*r\$\s*\d)/, reason: "tentou simular parcelamento" },
  { re: /(financiamento aprovado|credito aprovado|aprovo (seu|o financiamento)|consigo aprovar)/, reason: "tentou aprovar financiamento" },
  { re: /(avalio sua troca em|sua troca vale|dou r\$.*pela.*troca|aceito sua troca por)/, reason: "tentou avaliar troca" },
  { re: /(garanto que|prometo que|pode fechar comigo|fechamos por)/, reason: "fez promessa/negociação" },
];

// Conjuntos padrão por vertical. Novos segmentos entram aqui (sem mexer no motor).
const DEFAULT_BY_VERTICAL: Record<string, BlockRule[]> = {
  automotivo: AUTOMOTIVO,
};

// Resolve as regras efetivas: override do tenant (se houver) > padrão do vertical > automotivo.
export function resolveBlockRules(vertical: string, custom?: { pattern: string; reason: string }[] | null): BlockRule[] {
  if (custom && custom.length) {
    return custom.map((c) => ({ re: new RegExp(norm(c.pattern)), reason: c.reason }));
  }
  return DEFAULT_BY_VERTICAL[vertical] ?? AUTOMOTIVO;
}

export function checkReply(text: string, rules: BlockRule[]): GuardrailResult {
  const t = norm(text);
  for (const f of rules) {
    if (f.re.test(t)) return { allowed: false, reason: f.reason };
  }
  return { allowed: true };
}
