import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

// Allow this route to run long enough for the paced map-reduce below.
export const maxDuration = 300;

const MODEL = "llama-3.3-70b-versatile";
// Free Groq tier caps llama-3.3-70b at 12k tokens/min. Keep each chunk well
// under that (≈3.5k tokens in) and pace the calls so the rolling minute stays
// under the limit. ~4 chars ≈ 1 token.
const CHUNK_CHARS = 14000;
const SINGLE_PASS_LIMIT = 30000; // transcripts under this go straight to analysis
const MAX_CHUNKS = 10;           // hard cap to bound runtime; extra is trimmed
const PACE_MS = 22000;           // delay between chunk summaries (rolling-minute safety)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function groqChat(
  groqKey: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  // Retry once on rate limit, waiting out the minute window.
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices[0]?.message?.content ?? "";
    }
    const errText = await res.text();
    if (res.status === 429 && attempt === 0) {
      await sleep(62000); // wait out the per-minute window, then retry
      continue;
    }
    throw new Error(errText);
  }
  return "";
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return NextResponse.json({ error: "Reunião não encontrada" }, { status: 404 });
  if (!meeting.transcript) return NextResponse.json({ error: "Sem transcrição para analisar" }, { status: 400 });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  const transcript = meeting.transcript;

  try {
    // For long transcripts, condense in paced chunks first so we never send a
    // single request larger than the per-minute token limit allows.
    let basis = transcript;
    if (transcript.length > SINGLE_PASS_LIMIT) {
      const chunks: string[] = [];
      for (let i = 0; i < transcript.length && chunks.length < MAX_CHUNKS; i += CHUNK_CHARS) {
        chunks.push(transcript.slice(i, i + CHUNK_CHARS));
      }
      const partials: string[] = [];
      for (let i = 0; i < chunks.length; i++) {
        if (i > 0) await sleep(PACE_MS);
        const partial = await groqChat(
          groqKey,
          "Você resume trechos de reuniões de agência de marketing. Liste de forma concisa, em português, os pontos discutidos, decisões, tarefas/ações (com responsável e prazo se houver) e dados relevantes deste trecho. Não invente nada.",
          `Trecho ${i + 1}/${chunks.length} da reunião:\n\n${chunks[i]}`,
          500,
        );
        partials.push(partial);
      }
      basis = partials.join("\n\n");
      await sleep(PACE_MS); // pace before the final synthesis call
    }

    const raw = await groqChat(
      groqKey,
      `Você é um assistente especialista em reuniões de agência de marketing digital. Analise o conteúdo e responda APENAS com JSON válido neste formato:
{
  "summary": "resumo executivo em 2-3 frases do que foi a reunião",
  "topics": [
    { "title": "Assunto discutido", "content": "o que foi dito e discutido sobre este tópico" }
  ],
  "decisions": ["decisão tomada 1", "decisão tomada 2"],
  "nextSteps": ["próximo passo 1", "próximo passo 2"],
  "actionItems": [
    { "task": "tarefa específica", "responsible": "nome ou cargo se mencionado ou null", "deadline": "prazo se mencionado ou null" }
  ],
  "keyHighlights": ["ponto importante 1", "ponto importante 2"]
}
Regras: máximo 5 topics, 5 decisions, 5 nextSteps, 5 actionItems, 4 keyHighlights. Seja objetivo e extraia apenas o que foi realmente dito.`,
      transcript.length > SINGLE_PASS_LIMIT
        ? `Resumos das partes da reunião:\n\n${basis}`
        : `Transcrição da reunião:\n\n${basis}`,
      1500,
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: "Resposta inválida da IA" }, { status: 502 });

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string;
      decisions?: string[];
      nextSteps?: string[];
      topics?: Array<{ title: string; content: string }>;
      actionItems?: Array<{ task: string; responsible: string | null; deadline: string | null }>;
      keyHighlights?: string[];
    };

    const extra = {
      topics: parsed.topics ?? [],
      actionItems: parsed.actionItems ?? [],
      keyHighlights: parsed.keyHighlights ?? [],
    };
    const summaryWithStructure = `__STRUCTURED__${JSON.stringify(extra)}__END__${parsed.summary ?? ""}`;

    const updated = await prisma.meeting.update({
      where: { id },
      data: {
        summary: summaryWithStructure,
        decisions: parsed.decisions ?? [],
        nextSteps: parsed.nextSteps ?? [],
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Erro desconhecido";
    let friendly = "Erro na análise.";
    if (detail.includes("rate_limit") || detail.includes("tokens per minute") || detail.includes("Request too large")) {
      friendly = "A reunião é muito longa para o plano gratuito do Groq, mesmo dividida. Tente um trecho menor ou faça upgrade do Groq (Dev Tier).";
    }
    return NextResponse.json({ error: friendly, detail }, { status: 502 });
  }
}
