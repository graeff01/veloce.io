import { groqChat } from "@/lib/groq";
import type { Insight } from "@/lib/insights-engine";
import type { ExecutiveReportData } from "@/lib/executive-report";

// ── Narrativa executiva ──────────────────────────────────────────────────────
// A IA (Groq, free tier) escreve 2-3 frases de leitura executiva a partir dos
// insights já computados. Se a IA falhar ou não houver chave, cai num fallback
// determinístico — a narrativa NUNCA depende da IA estar disponível.

function fallback(insights: Insight[], report: ExecutiveReportData): string {
  if (insights.length === 0) {
    return report.hasData
      ? "Operação estável no período, sem variações relevantes em relação ao mês anterior."
      : "Sem dados suficientes no período para uma leitura executiva.";
  }
  const top = insights.slice(0, 3).map((i) => i.title.toLowerCase());
  const crit = insights.filter((i) => i.severity === "critical" || i.severity === "warning");
  const pos = insights.filter((i) => i.severity === "positive");
  const parts: string[] = [];
  if (pos.length) parts.push(`Pontos positivos: ${pos.slice(0, 2).map((i) => i.title.toLowerCase()).join("; ")}.`);
  if (crit.length) parts.push(`Atenção: ${crit.slice(0, 2).map((i) => i.title.toLowerCase()).join("; ")}.`);
  if (parts.length === 0) parts.push(`Destaques: ${top.join("; ")}.`);
  return parts.join(" ");
}

export async function buildNarrative(insights: Insight[], report: ExecutiveReportData): Promise<{ text: string; source: "ai" | "fallback" }> {
  if (!process.env.GROQ_API_KEY || insights.length === 0) {
    return { text: fallback(insights, report), source: "fallback" };
  }

  const system =
    "Você é um analista sênior de tráfego e atendimento. Escreva uma leitura executiva curta (2 a 3 frases, máximo ~60 palavras) em português do Brasil, tom profissional e direto, voltada para um gestor/empresário. Sem jargão técnico de marketing, sem listar métricas cruas, sem emojis. Foque em: como a operação está, qual o principal ganho e qual o principal ponto de atenção/ação.";

  const facts = [
    `Cliente: ${report.clientName}. Período: ${report.periodLabel}.`,
    `Oportunidades: ${report.kpis.leads.value ?? "—"} (variação ${report.kpis.leads.growthPct ?? "s/ base"}%).`,
    `Taxa de atendimento: ${report.attendance.attendanceRatePct ?? "—"}%. Sem resposta: ${report.attendance.unanswered}.`,
    `Conversões: ${report.funnel.convertido}. Em negociação: ${report.funnel.negociacao}.`,
    "Sinais detectados:",
    ...insights.map((i) => `- [${i.severity}] ${i.title}: ${i.detail}`),
  ].join("\n");

  try {
    const text = (await groqChat(system, facts, 220)).trim();
    if (text.length < 12) return { text: fallback(insights, report), source: "fallback" };
    return { text, source: "ai" };
  } catch {
    return { text: fallback(insights, report), source: "fallback" };
  }
}
