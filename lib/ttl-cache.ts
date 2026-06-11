// Cache em memória com TTL curto. Reduz recomputo pesado quando vários acessos
// acontecem em sequência (ex.: portal aberto por várias pessoas do cliente).
// Por instância — suficiente para o alívio pretendido, sem infra extra.

interface Entry { exp: number; value: unknown }
const store = new Map<string, Entry>();

export function cacheGet<T>(key: string): T | null {
  const e = store.get(key);
  if (!e) return null;
  if (e.exp < Date.now()) { store.delete(key); return null; }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { exp: Date.now() + ttlMs, value });
  // Limpeza preguiçosa para não vazar memória ao longo do tempo
  if (store.size > 500) {
    const now = Date.now();
    for (const [k, v] of store) if (v.exp < now) store.delete(k);
  }
}
