// ── Juiz LLM (LLM-as-judge) ──────────────────────────────────────────────────
// Avaliação qualitativa: um segundo modelo (idealmente mais forte que o de
// produção) julga se a resposta cumpre a rubrica do caso. É OFFLINE — roda só na
// bateria de avaliação, nunca no atendimento real. Barato e determinístico o
// bastante (temperatura 0) para servir de teste de regressão de qualidade.

import { openaiChat } from "@/lib/openai";

export interface JudgeVerdict {
  passou: boolean;
  motivo: string;
}

const JUDGE_SYSTEM = `Você é um avaliador rigoroso de respostas de um atendente virtual (IA) que fala com leads no WhatsApp.
Receberá: a última mensagem do lead, a resposta da IA e um CRITÉRIO.
Julgue SOMENTE se a resposta cumpre o critério. Seja exigente: na dúvida, reprove.
Responda ESTRITAMENTE em JSON: {"passou": boolean, "motivo": "curto e objetivo"}.`;

export async function judgeReply(opts: {
  model: string;
  mensagem: string;
  reply: string;
  rubrica: string;
}): Promise<JudgeVerdict> {
  const { message } = await openaiChat({
    model: opts.model,
    temperature: 0,
    maxTokens: 200,
    messages: [
      { role: "system", content: JUDGE_SYSTEM },
      {
        role: "user",
        content: [
          `MENSAGEM DO LEAD:\n${opts.mensagem}`,
          `RESPOSTA DA IA:\n${opts.reply}`,
          `CRITÉRIO:\n${opts.rubrica}`,
        ].join("\n\n"),
      },
    ],
  });

  const raw = message.content ?? "";
  try {
    // Tolera cercas de código / texto ao redor do JSON.
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { passou?: unknown; motivo?: unknown };
    return {
      passou: parsed.passou === true,
      motivo: typeof parsed.motivo === "string" ? parsed.motivo : "sem motivo",
    };
  } catch {
    return { passou: false, motivo: `juiz retornou resposta não-JSON: ${raw.slice(0, 120)}` };
  }
}
