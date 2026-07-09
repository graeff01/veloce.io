// ── Eval de retrieval (F3+) ──────────────────────────────────────────────────
// Trata o RAG como componente com métrica própria (best practice: "afinar retrieval
// melhora acurácia >50%"). Roda queries golden contra a base real do cliente e mede
// se os trechos certos foram recuperados. Métricas: hit@k e MRR (posição do 1º acerto).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { retrieveKnowledge } from "@/lib/ai-agent/retrieval";

export interface RetrievalCase {
  id: string;
  query: string;
  esperaTermos?: string[]; // termos que DEVEM aparecer em algum trecho recuperado
  esperaIds?: string[];    // ids de chunk esperados (se conhecidos)
}
export interface RetrievalCaseResult {
  id: string; query: string; hit: boolean; rank: number | null;
  encontrou: string[]; faltou: string[];
}
export interface RetrievalReport {
  total: number; hits: number; hitRate: number; mrr: number; k: number;
  casos: RetrievalCaseResult[];
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function loadRetrievalCases(dir: string): RetrievalCase[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out: RetrievalCase[] = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(dir, f), "utf8"));
    for (const c of Array.isArray(parsed) ? parsed : [parsed]) out.push(c as RetrievalCase);
  }
  return out;
}

export async function runRetrievalEval(clientId: string, dir: string, k = 3): Promise<RetrievalReport> {
  const cases = loadRetrievalCases(dir);
  const casos: RetrievalCaseResult[] = [];

  for (const c of cases) {
    const { chunks } = await retrieveKnowledge(clientId, c.query, { final: k });
    const termos = (c.esperaTermos ?? []).map(norm);
    const ids = c.esperaIds ?? [];

    let rank: number | null = null;
    const encontrou: string[] = [];
    chunks.forEach((ch, i) => {
      const hay = norm(`${ch.title ?? ""} ${ch.content}`);
      const termHit = termos.filter((t) => hay.includes(t));
      const idHit = ids.includes(ch.id);
      if (termHit.length || idHit) {
        if (rank === null) rank = i + 1;
        for (const t of termHit) if (!encontrou.includes(t)) encontrou.push(t);
        if (idHit) encontrou.push(`id:${ch.id}`);
      }
    });

    const faltou = termos.filter((t) => !encontrou.includes(t));
    casos.push({ id: c.id, query: c.query, hit: rank !== null, rank, encontrou, faltou });
  }

  const hits = casos.filter((c) => c.hit).length;
  const mrr = casos.length ? casos.reduce((s, c) => s + (c.rank ? 1 / c.rank : 0), 0) / casos.length : 0;
  return { total: casos.length, hits, hitRate: casos.length ? hits / casos.length : 0, mrr: Number(mrr.toFixed(3)), k, casos };
}
