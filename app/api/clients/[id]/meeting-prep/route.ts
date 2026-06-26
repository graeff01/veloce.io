import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { getClientDashboard } from "@/lib/notifications/client-report";
import { groqChat, extractJson } from "@/lib/groq";

export const runtime = "nodejs";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// GET /api/clients/[id]/meeting-prep
// Prep de reunião por IA: pega os números reais do mês (mesmo motor do painel) e a
// IA escreve o roteiro da reunião — narrativa + o que dizer + o gargalo enquadrado.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:read");
  if (error) return error;

  const client = await prisma.client.findUnique({ where: { id }, select: { name: true } });
  if (!client) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  if (!process.env.GROQ_API_KEY) return NextResponse.json({ error: "IA não configurada (GROQ_API_KEY)." });

  const d = await getClientDashboard(id, "month");
  const a = d.atendimento;

  const linhas = [
    `Cliente: ${client.name}. Período: ${d.periodLabel}.`,
    `Atendimento (WhatsApp): ${a.leads} conversas${a.deltaPct != null ? ` (${a.deltaPct >= 0 ? "+" : ""}${a.deltaPct}% vs. mês anterior)` : ""}; ${a.taxaResposta}% respondidos; tempo médio de 1ª resposta ${a.tempoMedioMin != null ? `${a.tempoMedioMin} min` : "n/d"}; ${a.conversoes} conversões sinalizadas no chat.`,
    `Saúde do atendimento: ${d.health.score}/100 (${d.health.label}).`,
    `Aguardando atendimento agora: ${d.termometro.hot} quentes, ${d.termometro.warm} mornos, ${d.termometro.cold} frios.`,
    d.midia ? `Anúncios: investido ${brl(d.midia.spend)}; ${d.midia.leads} leads de anúncio; custo por lead ${d.midia.cpl != null ? brl(d.midia.cpl) : "n/d"}.` : "Sem mídia (Meta) conectada.",
    d.bestCampaign ? `Melhor campanha: "${d.bestCampaign.name}" com ${d.bestCampaign.leads} leads.` : "",
  ].filter(Boolean).join("\n");

  const system =
    "Você prepara o ROTEIRO de uma reunião mensal de uma agência de tráfego (Veloce) com o cliente dela. Recebe os números reais do mês. Escreva o roteiro que a agência usa pra CONDUZIR a reunião — direto, confiante, ancorado SÓ nos números dados, português do Brasil. " +
    "REGRA DE OURO: se o atendimento estiver lento (tempo de 1ª resposta alto, saúde baixa ou leads quentes esperando), enquadre com honestidade e TATO — a agência ENTREGOU os leads; o gargalo está na velocidade de atendimento do time do cliente. Sem acusar: mostre que destravar o atendimento é o que falta pra converter o que já está sendo gerado. " +
    "Devolva SOMENTE um JSON: { \"abertura\": string (2-3 frases contando a história do mês), \"resultados\": string[] (3-4 bullets do que foi entregue: investimento, leads, custo por lead, melhor campanha), \"atendimento\": string (1 parágrafo enquadrando o atendimento/gargalo com tato e dado), \"falar\": string[] (3-5 pontos-chave de como conduzir / o que dizer), \"proximos\": string[] (2-4 próximos passos concretos) }. Não invente número nenhum.";

  try {
    const raw = await groqChat(system, linhas, 800);
    const p = extractJson<{ abertura?: string; resultados?: string[]; atendimento?: string; falar?: string[]; proximos?: string[] }>(raw);
    if (!p?.abertura) return NextResponse.json({ error: "A IA não conseguiu gerar o roteiro. Tente de novo." });
    const arr = (x: unknown) => (Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean) : []);
    return NextResponse.json({
      period: d.periodLabel,
      prep: {
        abertura: p.abertura.trim(),
        resultados: arr(p.resultados),
        atendimento: (p.atendimento ?? "").trim(),
        falar: arr(p.falar),
        proximos: arr(p.proximos),
      },
    });
  } catch {
    return NextResponse.json({ error: "Falha ao gerar o roteiro com a IA." });
  }
}
