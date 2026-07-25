// ── Camada de Inteligência · Fase 4: clustering do "aberto" ────────────────────
// Enriquece a recomendação "conhecimento_ausente": em vez de só CONTAR as perguntas
// sem resposta, AGRUPA-as por similaridade semântica (embedding) → cada grupo grande
// vira uma recomendação com o TÓPICO real (ex.: "leads perguntam sobre garantia").
// Reaproveita o embedding do RAG. Clustering PURO/testável; o runner faz o I/O.

import { cosine } from "@/lib/openai";

export interface ClusterItem { id: string; text: string; emb: number[]; contactId?: string | null; waMessageId?: string | null }
export interface Cluster { repText: string; members: ClusterItem[]; size: number }

// Clustering guloso por similaridade de cosseno com o REPRESENTANTE de cada grupo.
// threshold alto = grupos mais coesos. Determinístico dada a ordem de entrada.
export function clusterBySimilarity(items: ClusterItem[], threshold = 0.82): Cluster[] {
  const clusters: { rep: ClusterItem; members: ClusterItem[] }[] = [];
  for (const it of items) {
    if (!it.emb?.length) continue;
    let best = -1, bestSim = threshold;
    for (let i = 0; i < clusters.length; i++) {
      const sim = cosine(it.emb, clusters[i].rep.emb);
      if (sim >= bestSim) { bestSim = sim; best = i; }
    }
    if (best >= 0) clusters[best].members.push(it);
    else clusters.push({ rep: it, members: [it] });
  }
  return clusters
    .map((c) => ({ repText: c.rep.text, members: c.members, size: c.members.length }))
    .sort((a, b) => b.size - a.size);
}

// slug estável p/ assinatura de dedupe (mesmo tópico → mesma recomendação entre runs).
export function topicSlug(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3).slice(0, 4).join("-") || "geral";
}
