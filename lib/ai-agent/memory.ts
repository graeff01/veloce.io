// ── Memória de longo prazo do lead (F3) ──────────────────────────────────────
// Fatos duráveis que persistem ENTRE conversas — o que faz a IA "lembrar de quem já
// falou com ela". A IA grava via a ferramenta registrar_memoria; aqui fica o recall:
// traz as memórias mais relevantes para o turno atual (semântico quando há embedding,
// senão por importância/recência). Gated por AiAgentConfig.memoryEnabled.

import { prisma } from "@/lib/prisma";
import { embed, cosine } from "@/lib/openai";

export interface RecalledMemory { content: string; kind: string; importance: number }

export async function recallMemories(clientId: string, contactId: string, query: string, limit = 5): Promise<RecalledMemory[]> {
  const rows = await prisma.leadMemory.findMany({
    where: { clientId, contactId },
    orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  if (!rows.length) return [];

  const withEmb = rows.filter((r) => r.embedding && r.embedding.length);
  if (withEmb.length) {
    try {
      const [q] = await embed([query]);
      // Relevância = semântica + leve peso de importância (1..5 → 0..0.2).
      const ranked = rows
        .map((r) => ({ r, s: (r.embedding?.length ? cosine(q, r.embedding) : 0) + Math.min(r.importance, 5) * 0.04 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, limit);
      return ranked.map(({ r }) => ({ content: r.content, kind: r.kind, importance: r.importance }));
    } catch { /* cai no fallback abaixo */ }
  }
  // Fallback: já vêm ordenadas por importância/recência.
  return rows.slice(0, limit).map((r) => ({ content: r.content, kind: r.kind, importance: r.importance }));
}

export function formatMemories(mems: RecalledMemory[]): string {
  if (!mems.length) return "";
  return `MEMÓRIA DO LEAD (de conversas anteriores — use com naturalidade, não liste):\n${mems.map((m) => `- ${m.content}`).join("\n")}`;
}
