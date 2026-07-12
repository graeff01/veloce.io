// Anti-flood do envio manual pelo painel: por conversa, mín. de intervalo entre
// mensagens + teto por janela. In-memory (por instância) — suficiente para evitar
// flood acidental (não é rate limit de segurança distribuído). Puro/testável via `now`.
const recent = new Map<string, number[]>();
const MIN_GAP_MS = Number(process.env.PORTAL_SEND_MIN_GAP_MS || 1500);
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = Number(process.env.PORTAL_SEND_MAX_PER_MIN || 15);

export function allowSend(contactId: string, now: number = Date.now()): boolean {
  const arr = (recent.get(contactId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length && now - arr[arr.length - 1] < MIN_GAP_MS) return false; // rápido demais
  if (arr.length >= MAX_PER_WINDOW) return false; // muitos na janela
  arr.push(now);
  recent.set(contactId, arr);
  return true;
}
