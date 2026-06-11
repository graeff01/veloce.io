"use client";

import { useEffect, useState } from "react";
import type { ClientSummary } from "@/lib/client-portal";

export function useClientSummary(year: number, month: number) {
  const [data, setData] = useState<ClientSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/client/summary?year=${year}&month=${month}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (active) { setData(d); setLoading(false); } })
      .catch(() => { if (active) { setData(null); setLoading(false); } });
    return () => { active = false; };
  }, [year, month]);

  return { data, loading };
}
