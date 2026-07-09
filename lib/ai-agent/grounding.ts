// ── Grounding: a IA nunca inventa preço/prazo (F1) ───────────────────────────
// Verificação determinística de embasamento (chain-of-verification "leve"): toda
// AFIRMAÇÃO de risco na resposta — valor em reais, prazo em dias/semanas — precisa
// aparecer em alguma FONTE (resultado de ferramenta, conhecimento/RAG ou o próprio
// histórico da conversa). Se um preço surgir do nada, é alucinação → o orquestrador
// abstém (troca pela mensagem de fallback e encaminha ao vendedor).
//
// Barato (sem chamada de modelo) e de alta precisão para o maior risco reputacional:
// cravar um número que a empresa nunca cotou. Prazos entram como AVISO (auditoria),
// não forçam abstenção, para não bloquear conversas legítimas por engano.

const onlyDigits = (s: string) => s.replace(/\D/g, "");

// Tokens numéricos "de dinheiro" na resposta: R$ 12.500, R$ 1.299,90, etc.
const PRICE_RE = /r\$\s?\d[\d.\s]*(?:,\d{2})?/gi;
// Prazos com número + unidade de tempo.
const DEADLINE_RE = /\b(\d{1,3})\s?(dias?\s?(?:[úu]teis)?|semanas?|meses|m[êe]s|horas?)\b/gi;

export interface GroundingResult {
  grounded: boolean; // false só quando há preço sem fonte (gatilho de abstenção)
  priceViolations: string[]; // preços na resposta ausentes das fontes
  deadlineWarnings: string[]; // prazos sem fonte (apenas aviso, não abstém)
}

// `sources` deve concatenar tudo que é fonte legítima: resultados de ferramentas,
// conhecimento (RAG) e o texto da conversa (para não marcar eco do próprio lead).
export function checkGrounding(reply: string, sources: string): GroundingResult {
  const srcDigits = onlyDigits(sources);
  const srcNorm = sources.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  const priceViolations: string[] = [];
  for (const m of reply.match(PRICE_RE) ?? []) {
    const d = onlyDigits(m);
    if (d.length < 2) continue; // "R$" solto, ignora
    if (!srcDigits.includes(d)) priceViolations.push(m.trim());
  }

  const deadlineWarnings: string[] = [];
  const dl = reply.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  for (const m of dl.matchAll(DEADLINE_RE)) {
    const num = m[1];
    // fonte precisa citar o mesmo número perto de uma unidade de tempo
    if (!new RegExp(`${num}\\s?(dia|semana|mes|hora)`).test(srcNorm)) {
      deadlineWarnings.push(m[0]);
    }
  }

  return { grounded: priceViolations.length === 0, priceViolations, deadlineWarnings };
}
