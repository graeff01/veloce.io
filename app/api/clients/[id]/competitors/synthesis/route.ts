import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { groqChat, extractJson } from "@/lib/groq";

// GET /api/clients/[id]/competitors/synthesis
// A IA lê os concorrentes salvos (classificação + anotações) e sintetiza o PADRÃO
// que os players SÉRIOS convergem — o que modelar (roubo honesto) e o que evitar
// (não copiar amador). Baseado nas observações do gestor, sem inventar dado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const client = await prisma.client.findUnique({ where: { id }, select: { niche: true } });
  const competitors = await prisma.competitor.findMany({ where: { clientId: id }, select: { name: true, tier: true, notes: true } });
  const comObs = competitors.filter((c) => (c.notes ?? "").trim().length > 2 || c.tier);
  if (comObs.length < 2) {
    return NextResponse.json({ error: "Classifique os concorrentes (Sério/Médio/Amador) e anote o que viu em pelo menos 2 — aí a IA sintetiza o padrão do nicho." });
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "IA não configurada (GROQ_API_KEY)." });
  }

  const TIER = { serio: "SÉRIO", medio: "médio", amador: "AMADOR" } as Record<string, string>;
  const system =
    "Você é estrategista de mídia paga. Recebe concorrentes de um nicho, cada um classificado por qualidade (SÉRIO/médio/AMADOR) e com anotações do que anuncia (formato, gancho, oferta). Tarefa: achar o PADRÃO que os players SÉRIOS têm em COMUM (consenso = aposta segura para modelar honestamente), IGNORANDO os amadores. Devolva SOMENTE um JSON: { \"padrao\": string (o que os sérios convergem), \"modelar\": [2 a 4 ações concretas que o cliente deve modelar], \"evitar\": string (o erro comum / o que NÃO copiar — ex.: criativo de amador), \"brecha\": string (oportunidade que ninguém do nicho explora) }. Português do Brasil, direto, baseado SÓ nas observações dadas, sem inventar.";
  const user = [
    `Nicho: ${client?.niche ?? "não informado"}.`,
    "Concorrentes observados:",
    ...comObs.map((c) => `- ${c.name} [${TIER[c.tier ?? ""] ?? "sem classificação"}]: ${(c.notes ?? "").trim() || "sem anotação"}`),
  ].join("\n");

  try {
    const raw = await groqChat(system, user, 460);
    const p = extractJson<{ padrao?: string; modelar?: string[]; evitar?: string; brecha?: string }>(raw);
    if (!p || !p.padrao) return NextResponse.json({ error: "A IA não conseguiu sintetizar. Tente anotar mais detalhes (formato, gancho)." });
    return NextResponse.json({
      synthesis: {
        padrao: p.padrao.trim(),
        modelar: Array.isArray(p.modelar) ? p.modelar.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [],
        evitar: p.evitar?.trim() || "",
        brecha: p.brecha?.trim() || "",
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao sintetizar com a IA." });
  }
}
