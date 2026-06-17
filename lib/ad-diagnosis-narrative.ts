import { groqChat } from "@/lib/groq";
import type { AdsDiagnosisResult } from "@/lib/ad-diagnosis";

// ── Narrativa do diagnóstico de anúncios ─────────────────────────────────────
// A IA (Groq) escreve 2-3 frases de leitura executiva A PARTIR dos vereditos já
// computados pelo motor determinístico — nunca inventa número nem conclusão. Se
// a IA falhar/sem chave, cai num fallback determinístico. A narrativa NUNCA é a
// fonte da verdade; é só a leitura em linguagem natural do que o motor decidiu.

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function fallback(d: AdsDiagnosisResult): string {
  if (!d.hasData) return "Sem anúncios com dados suficientes no período para um diagnóstico.";
  const parts: string[] = [];
  const crit = d.ads.filter((a) => a.severity === "critical");
  const win = d.ads.filter((a) => a.severity === "positive");
  if (win.length) parts.push(`Destaque: ${win[0].name} (${win[0].title.toLowerCase()}).`);
  if (crit.length) parts.push(`${crit.length} anúncio(s) pedindo ação imediata — comece por "${crit[0].name}": ${crit[0].title.toLowerCase()}.`);
  if (!parts.length) parts.push("Operação de mídia estável no período, sem pontos críticos.");
  if (d.baselineCpl != null) parts.push(`CPL de referência do cliente: ${brl(d.baselineCpl)}.`);
  return parts.join(" ");
}

export async function buildAdsNarrative(d: AdsDiagnosisResult): Promise<{ text: string; source: "ai" | "fallback" }> {
  if (!process.env.GROQ_API_KEY || !d.hasData) {
    return { text: fallback(d), source: "fallback" };
  }

  const system =
    "Você é um gestor de tráfego sênior. Escreva uma leitura executiva curta (2 a 3 frases, máx ~60 palavras) em português do Brasil, tom direto e profissional, para o dono do negócio. Baseie-se ESTRITAMENTE nos vereditos fornecidos — não invente métricas nem conclusões. Diga onde está o ganho, qual o problema mais urgente e o próximo passo. Sem emojis, sem listar dados crus.";

  const facts = [
    d.baselineCpl != null ? `CPL de referência: ${brl(d.baselineCpl)}.` : "Sem CPL de referência ainda.",
    `Anúncios diagnosticados: ${d.ads.length} (críticos ${d.counts.critical}, atenção ${d.counts.warning}, positivos ${d.counts.positive}).`,
    "Vereditos por anúncio (já decididos pelo motor):",
    ...d.ads.slice(0, 10).map((a) => `- [${a.severity}] ${a.name}: ${a.title}. Ação: ${a.action}`),
  ].join("\n");

  try {
    const text = (await groqChat(system, facts, 200)).trim();
    if (text.length < 12) return { text: fallback(d), source: "fallback" };
    return { text, source: "ai" };
  } catch {
    return { text: fallback(d), source: "fallback" };
  }
}
