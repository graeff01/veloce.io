import { spendToday } from "./usage";

// Disjuntores de gasto diário. Fonte ÚNICA de custo = AiUsage (todos os pipelines:
// chat/memory/intelligence/judge/embedding), não só o chat. Cache curto p/ não martelar.

let globalCache: { at: number; usd: number } | null = null;
const clientCache = new Map<string, { at: number; usd: number }>();

export async function globalSpendExceeded(): Promise<boolean> {
  const cap = Number(process.env.AI_AGENT_DAILY_USD_CAP || 0);
  if (!cap) return false;
  const now = Date.now();
  if (!globalCache || now - globalCache.at > 60_000) {
    globalCache = { at: now, usd: await spendToday({}) };
  }
  return globalCache.usd >= cap;
}

// Teto de gasto diário POR cliente — protege o orçamento global de um tenant abusivo.
export async function clientSpendExceeded(clientId: string, cap: number): Promise<boolean> {
  if (!cap || cap <= 0) return false;
  const now = Date.now();
  const hit = clientCache.get(clientId);
  let usd: number;
  if (hit && now - hit.at < 60_000) {
    usd = hit.usd;
  } else {
    usd = await spendToday({ clientId });
    clientCache.set(clientId, { at: now, usd });
  }
  return usd >= cap;
}
