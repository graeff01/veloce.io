// Não-lidas do portal (notificações v1, sobre o polling existente). Puro/testável.
// "Não lida" = a ÚLTIMA mensagem da conversa é do LEAD (inbound) e é mais nova do
// que a última vez que o usuário abriu aquela conversa (seenAt).
export interface UnreadRow { contactId: string; lastDirection: string | null; lastMessageAt: string | null }

const inboundTime = (c: UnreadRow): number | null => {
  if (!c.lastMessageAt) return null;
  if (c.lastDirection === "out" || c.lastDirection == null) return null; // última é nossa → não conta
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

// INBOUND novo entre dois polls (para som/notificação). prev = lastMessageAt por
// contato no poll anterior. Ignora outbound e conversas sem mudança de timestamp.
export function newInbound<T extends UnreadRow>(prev: Record<string, number>, list: T[]): T[] {
  const out: T[] = [];
  for (const c of list) {
    const t = inboundTime(c);
    if (t == null) continue;
    if (t > (prev[c.contactId] ?? 0)) out.push(c);
  }
  return out;
}

// Snapshot lastMessageAt por contato (baseline do próximo poll).
export function snapshot(list: UnreadRow[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const c of list) { if (c.lastMessageAt) { const t = Date.parse(c.lastMessageAt); if (!Number.isNaN(t)) m[c.contactId] = t; } }
  return m;
}
