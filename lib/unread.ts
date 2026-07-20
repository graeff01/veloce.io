// Não-lidas do portal (notificações in-tab, sobre o polling). Puro/testável.
// "Não lida" = última mensagem é do LEAD (inbound) e mais nova que a última vez vista.
export interface UnreadRow { contactId: string; lastDirection: string | null; lastMessageAt: string | null }
const inboundTime = (c: UnreadRow): number | null => {
  if (!c.lastMessageAt) return null;
  if (c.lastDirection === "out" || c.lastDirection == null) return null;
  const t = Date.parse(c.lastMessageAt);
  return Number.isNaN(t) ? null : t;
};
export function isUnread(c: UnreadRow, seenAt: Record<string, number>): boolean {
  const t = inboundTime(c);
  return t != null && t > (seenAt[c.contactId] ?? 0);
}
export function unreadCount(list: UnreadRow[], seenAt: Record<string, number>): number {
  return list.reduce((n, c) => n + (isUnread(c, seenAt) ? 1 : 0), 0);
}
// INBOUND novo entre polls (para som/notificação). prev = lastMessageAt por contato.
export function newInbound<T extends UnreadRow>(prev: Record<string, number>, list: T[]): T[] {
  const out: T[] = [];
  for (const c of list) { const t = inboundTime(c); if (t != null && t > (prev[c.contactId] ?? 0)) out.push(c); }
  return out;
}
