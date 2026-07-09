// ── Online eval (F3) ─────────────────────────────────────────────────────────
// Avalia a QUALIDADE de respostas reais de produção com um juiz LLM (amostragem),
// gravando uma nota 0..1 em AiInteraction.qualityScore. Diferente do golden (offline,
// comportamento esperado), aqui medimos a qualidade contínua no mundo real → tendência
// no painel. Roda em lote, fora do atendimento (não afeta latência do lead).

import { openaiChat } from "@/lib/openai";

const SYSTEM = `Você avalia a qualidade da resposta de um atendente virtual (IA) no WhatsApp.
Dê uma nota de 0 a 10 considerando: foi útil e clara? soou natural (não robótica)? conduziu bem?
NÃO inventou preço/prazo sem base? adequada ao que o lead pediu?
Responda ESTRITAMENTE em JSON: {"score": number, "motivo": "curto"}.`;

export async function scoreReply(model: string, inbound: string, outbound: string): Promise<{ score: number; motivo: string } | null> {
  try {
    const { message } = await openaiChat({
      model, temperature: 0, maxTokens: 120,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `MENSAGEM DO LEAD:\n${inbound}\n\nRESPOSTA DA IA:\n${outbound}` },
      ],
    });
    const raw = message.content ?? "";
    const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { score?: unknown; motivo?: unknown };
    const s = Number(parsed.score);
    if (Number.isNaN(s)) return null;
    return { score: Math.min(Math.max(s / 10, 0), 1), motivo: typeof parsed.motivo === "string" ? parsed.motivo : "" };
  } catch {
    return null;
  }
}
