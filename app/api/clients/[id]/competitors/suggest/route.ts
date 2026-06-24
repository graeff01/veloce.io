import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { groqChat, extractJson } from "@/lib/groq";

// GET /api/clients/[id]/competitors/suggest
// IA sugere os principais players do nicho do cliente + termos de busca para a
// Ad Library. Não tem métrica (a Meta não expõe) — a "leitura de vencedor" é por
// tempo no ar. players são SUGESTÕES para investigar; termos são confiáveis.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true, niche: true, city: true, brand: true } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (!client.niche?.trim()) {
    return NextResponse.json({ error: "Cadastre o nicho do cliente (aba Perfil) para a IA sugerir concorrentes.", players: [], termos: [] });
  }

  const niche = client.niche.trim();
  const city = client.city?.trim() || "";

  // Fallback determinístico (sem IA): termos básicos do nicho + cidade.
  const fallbackTermos = [niche, city ? `${niche} ${city}` : "", `${niche} promoção`].filter(Boolean);
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ players: [], termos: fallbackTermos, niche, city, source: "fallback" });
  }

  const system =
    "Você ajuda uma agência a pesquisar concorrentes na Biblioteca de Anúncios da Meta. Dado o NICHO, a CIDADE e a marca do negócio, devolva SOMENTE um JSON: { \"players\": [nomes de empresas/concorrentes que provavelmente anunciam nesse nicho e região — sugestões plausíveis para investigar], \"termos\": [palavras-chave que esses anúncios costumam usar, para buscar na biblioteca] }. Até 8 de cada. Se não souber nomes específicos da região, deixe players vazio e capriche nos termos. Português do Brasil, sem inventar dados como se fossem certeza.";
  const user = `Negócio: ${client.name}${client.brand ? ` (${client.brand})` : ""}.\nNicho: ${niche}.\nCidade/região: ${city || "não informada"}.`;

  try {
    const raw = await groqChat(system, user, 360);
    const p = extractJson<{ players?: string[]; termos?: string[] }>(raw);
    const players = Array.isArray(p?.players) ? p!.players.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : [];
    const termos = Array.isArray(p?.termos) ? p!.termos.map((x) => String(x).trim()).filter(Boolean).slice(0, 8) : fallbackTermos;
    return NextResponse.json({ players, termos: termos.length ? termos : fallbackTermos, niche, city, source: "ai" });
  } catch {
    return NextResponse.json({ players: [], termos: fallbackTermos, niche, city, source: "fallback" });
  }
}
