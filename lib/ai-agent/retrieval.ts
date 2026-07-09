// ── RAG afinado: recuperação em dois estágios (F3+) ──────────────────────────
// Antes: cosseno puro → top-3. Agora: (1) cosseno recupera um pool maior; (2)
// rerank por mistura semântica + lexical; (3) MMR seleciona os melhores COM
// diversidade (evita 3 trechos quase iguais). Determinístico e sem chamada extra
// de modelo — só reordena o que o embedding já trouxe. Isolado para poder ser
// avaliado (eval de retrieval) sem passar pelo agente inteiro.

import { prisma } from "@/lib/prisma";
import { embed, cosine } from "@/lib/openai";

export interface RetrievedChunk { id: string; title: string | null; content: string; score: number }

const POOL = 8;      // candidatos do 1º estágio (cosseno)
const FINAL = 3;     // trechos finais entregues ao prompt
const MIN_COS = 0.15; // piso de similaridade para entrar no pool
const LAMBDA = 0.7;  // MMR: peso relevância × diversidade

const STOP = new Set("de da do das dos e a o as os um uma para por com que se na no nas nos em ao aos qual quais como".split(" "));

function terms(s: string): Set<string> {
  return new Set(
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );
}

// Sobreposição lexical (Jaccard) entre a pergunta e o trecho — pega o que o
// embedding às vezes perde (termos exatos, códigos, nomes de modelo).
function lexicalOverlap(q: Set<string>, text: string): number {
  const t = terms(text);
  if (!q.size || !t.size) return 0;
  let inter = 0;
  for (const w of q) if (t.has(w)) inter++;
  return inter / q.size;
}

interface Cand { id: string; title: string | null; content: string; emb: number[]; cos: number; rel: number }

export async function retrieveKnowledge(
  clientId: string,
  query: string,
  opts?: { pool?: number; final?: number },
): Promise<{ chunks: RetrievedChunk[]; used: { id: string; title: string | null; score: number }[] }> {
  const poolSize = opts?.pool ?? POOL;
  const finalN = opts?.final ?? FINAL;

  const rows = await prisma.knowledgeChunk.findMany({ where: { clientId }, take: 300 });
  if (!rows.length) return { chunks: [], used: [] };

  const [q] = await embed([query]);
  const qTerms = terms(query);

  // Estágio 1: cosseno → pool.
  const pool: Cand[] = rows
    .map((c) => ({ id: c.id, title: c.title, content: c.content, emb: c.embedding, cos: cosine(q, c.embedding) }))
    .filter((c) => c.cos > MIN_COS)
    .sort((a, b) => b.cos - a.cos)
    .slice(0, poolSize)
    .map((c) => ({ ...c, rel: 0 }));
  if (!pool.length) return { chunks: [], used: [] };

  // Estágio 2: relevância combinada (semântica + lexical).
  for (const c of pool) c.rel = 0.75 * c.cos + 0.25 * lexicalOverlap(qTerms, `${c.title ?? ""} ${c.content}`);

  // Estágio 3: MMR — maximiza relevância penalizando redundância com os já escolhidos.
  const selected: Cand[] = [];
  const remaining = [...pool].sort((a, b) => b.rel - a.rel);
  while (selected.length < finalN && remaining.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const maxSim = selected.length ? Math.max(...selected.map((s) => cosine(c.emb, s.emb))) : 0;
      const mmr = LAMBDA * c.rel - (1 - LAMBDA) * maxSim;
      if (mmr > bestScore) { bestScore = mmr; bestIdx = i; }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }

  const chunks: RetrievedChunk[] = selected.map((c) => ({ id: c.id, title: c.title, content: c.content, score: Number(c.rel.toFixed(3)) }));
  return { chunks, used: chunks.map((c) => ({ id: c.id, title: c.title, score: c.score })) };
}
