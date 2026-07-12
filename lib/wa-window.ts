// Janela de atendimento do WhatsApp: só dá pra enviar MENSAGEM LIVRE dentro de 24h
// desde a ÚLTIMA mensagem do LEAD (inbound). Fora disso, a Cloud API exige template
// aprovado (fora do escopo do envio manual). Puro/testável.
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWithin24h(lastInboundAt: Date | string | null | undefined, now: number = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const t = typeof lastInboundAt === "string" ? Date.parse(lastInboundAt) : lastInboundAt.getTime();
  if (Number.isNaN(t)) return false;
  return now - t < WA_WINDOW_MS;
}
