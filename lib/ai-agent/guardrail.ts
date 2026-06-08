// Guardrail de saída — segunda linha de defesa (a 1ª é o system prompt).
// Bloqueia compromissos comerciais que a IA NUNCA pode fazer.

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Padrões proibidos: oferecer desconto, simular parcela, aprovar financiamento,
// avaliar troca, cravar condição. Mencionar que "existe financiamento" é ok —
// o que bloqueamos é COMPROMISSO/SIMULAÇÃO com número.
const FORBIDDEN: { re: RegExp; reason: string }[] = [
  { re: /(desconto de|dou .*desconto|consigo .*(por|a) r\$|deixo .*por r\$|fa[cz]o por r\$|abaixo de r\$|ultimo pre[cz]o)/, reason: "tentou oferecer desconto" },
  { re: /(\d+\s*x de r\$|\d+\s*parcelas de|entrada de r\$|parcela.*r\$\s*\d)/, reason: "tentou simular parcelamento" },
  { re: /(financiamento aprovado|credito aprovado|aprovo (seu|o financiamento)|consigo aprovar)/, reason: "tentou aprovar financiamento" },
  { re: /(avalio sua troca em|sua troca vale|dou r\$.*pela.*troca|aceito sua troca por)/, reason: "tentou avaliar troca" },
  { re: /(garanto que|prometo que|pode fechar comigo|fechamos por)/, reason: "fez promessa/negociação" },
];

export interface GuardrailResult { allowed: boolean; reason?: string }

export function checkReply(text: string): GuardrailResult {
  const t = norm(text);
  for (const f of FORBIDDEN) {
    if (f.re.test(t)) return { allowed: false, reason: f.reason };
  }
  return { allowed: true };
}
