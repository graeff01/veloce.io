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

  // Ancora a sugestão no que o cliente REALMENTE anuncia (nomes de campanhas) —
  // deixa players/termos colados no negócio de verdade, não no genérico do nicho.
  const meta = await prisma.metaConnection.findUnique({ where: { clientId: id }, select: { id: true } });
  const camps = meta
    ? await prisma.metaCampaign.findMany({ where: { connectionId: meta.id }, select: { name: true }, take: 40 })
    : [];
  const oferta = [...new Set(camps.map((c) => c.name.replace(/^C\d+[-_ ]?/i, "").replace(/[-_]/g, " ").trim()).filter((s) => s.length > 1))].slice(0, 12);

  // Fallback determinístico (sem IA): termos básicos do nicho + cidade.
  const fallbackTermos = [niche, city ? `${niche} ${city}` : "", `${niche} promoção`].filter(Boolean);
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ players: [], termos: fallbackTermos, niche, city, source: "fallback" });
  }

  const system =
    "Você ajuda uma agência a pesquisar concorrentes na Biblioteca de Anúncios da Meta. Dado o NICHO, a CIDADE, a marca e o QUE O NEGÓCIO ANUNCIA, devolva SOMENTE um JSON: { \"players\": [nomes de empresas/concorrentes que provavelmente anunciam nesse nicho e região — sugestões plausíveis para investigar], \"termos\": [palavras-chave reais que esses anúncios usam, para buscar na biblioteca] }. Até 8 de cada. Baseie os termos no que o negócio realmente anuncia. Se não souber nomes específicos da região, deixe players vazio e capriche nos termos. Português do Brasil, sem inventar dado como se fosse certeza.";
  const user = [
    `Negócio: ${client.name}${client.brand ? ` (${client.brand})` : ""}.`,
    `Nicho: ${niche}.`,
    `Cidade/região: ${city || "não informada"}.`,
    oferta.length ? `O negócio anuncia (campanhas reais): ${oferta.join(", ")}.` : "",
  ].filter(Boolean).join("\n");

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
