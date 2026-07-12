// Takeover explícito: o atendente "assumiu" a conversa (botão do painel). Vale por
// uma janela (a mesma do takeover por mensagem, humanTakeoverMin). Puro/testável.
export function isTakenOver(humanTakeoverAt: Date | string | null | undefined, takeoverMin: number, now: number = Date.now()): boolean {
  if (!humanTakeoverAt || takeoverMin <= 0) return false;
  const t = typeof humanTakeoverAt === "string" ? Date.parse(humanTakeoverAt) : humanTakeoverAt.getTime();
  if (Number.isNaN(t)) return false;
  return now - t < takeoverMin * 60_000;
}
