"use client";

import { useEffect, useRef, useState } from "react";

// ── Cache de dados leve (estilo SWR, sem dependência) ────────────────────────
// - Mostra o cache na hora ao navegar (instantâneo) e revalida em background.
// - Dedupe de requisições concorrentes para a mesma chave.
// - TTL + teto LRU (memória limitada em sessões longas).
// - Polling opcional que PAUSA quando a aba está oculta.
// - mutateCache(key) para invalidar/atualizar após uma escrita.

const MAX_ENTRIES = 50;
const DEFAULT_TTL_MS = 5 * 60 * 1000; // entradas mais velhas que isso são descartadas

type Entry = { data: unknown; at: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

function cacheGet(key: string): Entry | undefined {
  const e = cache.get(key);
  if (!e) return undefined;
  if (Date.now() - e.at > DEFAULT_TTL_MS) { cache.delete(key); return undefined; }
  // LRU: re-insere para marcar como recente.
  cache.delete(key); cache.set(key, e);
  return e;
}

function cacheSet(key: string, data: unknown) {
  cache.set(key, { data, at: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

// Invalida (ou atualiza) uma chave após uma escrita. Sem args → limpa tudo.
export function mutateCache(key?: string, data?: unknown) {
  if (!key) { cache.clear(); return; }
  if (data !== undefined) cacheSet(key, data);
  else cache.delete(key);
  notify(key);
}

function fetchKey<T>(key: string): Promise<T | null> {
  let p = inflight.get(key) as Promise<T | null> | undefined;
  if (!p) {
    p = fetch(key)
      .then((r) => (r.ok ? (r.json() as Promise<T>) : null))
      .catch(() => null);
    inflight.set(key, p as Promise<unknown>);
    void p.finally(() => inflight.delete(key));
  }
  return p;
}

export function useCachedFetch<T>(
  key: string | null,
  opts?: { refreshMs?: number },
): { data: T | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(() => (key ? ((cacheGet(key)?.data as T) ?? null) : null));
  const [loading, setLoading] = useState<boolean>(() => !(key && cacheGet(key)));
  const loadRef = useRef<() => void>(() => {});

  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    const hit = cacheGet(key);
    if (hit) { setData(hit.data as T); setLoading(false); }
    else setLoading(true);

    const load = async () => {
      const d = await fetchKey<T>(key);
      if (cancelled) return;
      if (d != null) { cacheSet(key, d); setData(d); }
      setLoading(false);
    };
    loadRef.current = () => { void load(); };
    void load();

    // Re-renderiza se outra parte invalidar/atualizar esta chave.
    const onChange = () => { const e = cacheGet(key); if (!cancelled) setData((e?.data as T) ?? null); };
    let set = listeners.get(key);
    if (!set) { set = new Set(); listeners.set(key, set); }
    set.add(onChange);

    let id: ReturnType<typeof setInterval> | undefined;
    if (refreshMs) {
      id = setInterval(() => {
        if (typeof document !== "undefined" && document.hidden) return;
        void load();
      }, refreshMs);
    }
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
      set?.delete(onChange);
    };
  }, [key, refreshMs]);

  return { data, loading, refresh: () => loadRef.current() };
}
