"use client";

import { useEffect, useRef, useState } from "react";

// ── Cache de dados leve (estilo SWR, sem dependência) ────────────────────────
// - Mostra o cache na hora ao navegar (navegação instantânea) e revalida em
//   background ("stale-while-revalidate").
// - Dedupe de requisições concorrentes para a mesma chave.
// - Polling opcional que PAUSA quando a aba está oculta (corta carga inútil).

const cache = new Map<string, unknown>();
const inflight = new Map<string, Promise<unknown>>();

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
  const [data, setData] = useState<T | null>(() => (key ? ((cache.get(key) as T) ?? null) : null));
  const [loading, setLoading] = useState<boolean>(() => !(key && cache.has(key)));
  const keyRef = useRef(key);
  keyRef.current = key;

  async function load(k: string) {
    const d = await fetchKey<T>(k);
    if (keyRef.current !== k) return; // chave mudou no meio — descarta
    if (d != null) { cache.set(k, d); setData(d); }
    setLoading(false);
  }

  const refreshMs = opts?.refreshMs;
  useEffect(() => {
    if (!key) return;
    if (cache.has(key)) { setData(cache.get(key) as T); setLoading(false); }
    else setLoading(true);
    void load(key); // revalida sempre ao montar/trocar de chave

    if (!refreshMs) return;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return; // aba oculta → não consome
      void load(key);
    }, refreshMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refreshMs]);

  return { data, loading, refresh: () => { if (key) void load(key); } };
}
