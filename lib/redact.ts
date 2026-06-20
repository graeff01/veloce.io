// Mascara PII sensível (LGPD) antes de PERSISTIR em logs da IA. Não altera a conversa
// real nem o que o vendedor vê — só reduz o dado sensível guardado no histórico do agente.
// Conservador: foca em CPF, e-mail e sequências longas de cartão (não mexe em telefone,
// que o vendedor precisa, nem em valores/preços).
export function redactPII(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")                 // CPF (com ou sem máscara)
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]") // e-mail
    .replace(/\b(?:\d[ .-]?){13,16}\b/g, "[número]");                     // cartão/sequência longa
}
