import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { groqChat, extractJson } from "@/lib/groq";

export const runtime = "nodejs";

const FORMAT_LABEL: Record<string, string> = { imagem: "Imagem", carrossel: "Carrossel", video: "Vídeo", reels: "Reels" };
const ANGLE_LABEL: Record<string, string> = {
  preco: "Preço/Oferta", entrada: "Entrada facilitada", urgencia: "Urgência/Escassez", prova_social: "Prova social",
  autoridade: "Autoridade/Bastidor", novidade: "Novidade", comparacao: "Comparação", garantia: "Garantia",
};
const TIER_LABEL: Record<string, string> = { serio: "SÉRIO", medio: "médio", amador: "AMADOR" };

// GET /api/clients/[id]/competitors/synthesis
// Sintetiza o PADRÃO dos vencedores a partir das TAGS estruturadas (formato/ângulo/
// oferta/longevidade) + o tier do player. Dado estruturado → síntese confiável.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const [client, winners] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { niche: true } }),
    prisma.winningCreative.findMany({ where: { clientId: id }, include: { competitor: { select: { name: true, tier: true } } }, orderBy: { createdAt: "asc" } }),
  ]);

  if (winners.length < 3) {
    return NextResponse.json({ error: "Salve pelo menos 3 criativos vencedores (com formato e ângulo) para a IA sintetizar o padrão do nicho." });
  }
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "IA não configurada (GROQ_API_KEY)." });
  }

  const now = Date.now();
  const days = (d: Date | null) => (d ? Math.max(0, Math.round((now - new Date(d).getTime()) / 86_400_000)) : null);

  const lines = winners.map((w) => {
    const dur = days(w.liveSince);
    return `- ${FORMAT_LABEL[w.format] ?? w.format} · ${ANGLE_LABEL[w.angle] ?? w.angle}` +
      (w.offer ? ` · oferta: ${w.offer}` : "") +
      (dur != null ? ` · no ar há ${dur} dias` : "") +
      (w.competitor ? ` · player: ${w.competitor.name}${w.competitor.tier ? ` [${TIER_LABEL[w.competitor.tier] ?? w.competitor.tier}]` : ""}` : "");
  });

  const system =
    "Você é estrategista de mídia paga. Recebe uma lista de criativos VENCEDORES observados num nicho, cada um com formato, ângulo, oferta, há quantos dias está no ar (longevidade = sinal de que funciona) e o player (alguns marcados SÉRIO/AMADOR). Tarefa: achar o PADRÃO que os vencedores convergem — priorizando os que estão MAIS tempo no ar e os players SÉRIOS, ignorando amadores. Devolva SOMENTE um JSON: { \"padrao\": string (o que os vencedores têm em comum), \"modelar\": [2 a 4 ações concretas de criativo que o cliente deve modelar honestamente], \"evitar\": string (o erro comum / o que NÃO copiar), \"brecha\": string (ângulo/formato que ninguém do nicho explora — oportunidade) }. Português do Brasil, direto, baseado SÓ nos dados dados, sem inventar.";
  const user = [`Nicho: ${client?.niche ?? "não informado"}.`, "Criativos vencedores observados:", ...lines].join("\n");

  try {
    const raw = await groqChat(system, user, 480);
    const p = extractJson<{ padrao?: string; modelar?: string[]; evitar?: string; brecha?: string }>(raw);
    if (!p || !p.padrao) return NextResponse.json({ error: "A IA não conseguiu sintetizar. Salve mais vencedores ou complete as tags." });
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
