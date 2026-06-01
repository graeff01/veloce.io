import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const meeting = await prisma.meeting.findUnique({ where: { id } });
  if (!meeting) return NextResponse.json({ error: "Reunião não encontrada" }, { status: 404 });
  if (!meeting.transcript) return NextResponse.json({ error: "Sem transcrição para analisar" }, { status: 400 });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama3-70b-8192",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `Você é um assistente especialista em reuniões de agência de marketing digital. Analise a transcrição e responda APENAS com JSON válido neste formato:
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
        },
        {
          role: "user",
          content: `Transcrição da reunião:\n\n${meeting.transcript}`,
        },
      ],
    }),
  });

  if (!chatRes.ok) {
    const err = await chatRes.text();
    return NextResponse.json({ error: "Erro na análise", detail: err }, { status: 502 });
  }

  const chatData = await chatRes.json() as { choices: Array<{ message: { content: string } }> };
  const raw = chatData.choices[0]?.message?.content ?? "";
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
}
