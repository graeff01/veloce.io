import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo de áudio obrigatório" }, { status: 400 });

  // When "raw" is set, the client is sending one of several downsampled chunks.
  // We only transcribe and return the text — saving + AI analysis happen once
  // the client has stitched every chunk together.
  const rawMode = formData.get("raw") != null;

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY não configurada" }, { status: 500 });

  // Send to Groq Whisper
  const groqForm = new FormData();
  groqForm.append("file", file);
  groqForm.append("model", "whisper-large-v3");
  groqForm.append("language", "pt");
  groqForm.append("response_format", "verbose_json");

  const whisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: groqForm,
  });

  if (!whisperRes.ok) {
    const err = await whisperRes.text();
    return NextResponse.json({ error: "Erro na transcrição", detail: err }, { status: 502 });
  }

  const whisperData = await whisperRes.json() as { text: string; duration?: number };
  const transcript = whisperData.text;
  const duration = whisperData.duration ? Math.round(whisperData.duration) : undefined;

  if (rawMode) {
    return NextResponse.json({ text: transcript, duration: duration ?? 0 });
  }

  // Generate structured analysis via Groq chat
  let summary = "";
  let decisions: string[] = [];
  let nextSteps: string[] = [];

  try {
    const chatRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
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
    { "task": "tarefa específica", "responsible": "nome ou cargo se mencionado", "deadline": "prazo se mencionado ou null" }
  ],
  "keyHighlights": ["ponto importante 1", "ponto importante 2"]
}
Regras: máximo 5 topics, 5 decisions, 5 nextSteps, 5 actionItems, 4 keyHighlights. Seja objetivo e extraia apenas o que foi realmente dito.`,
          },
          {
            role: "user",
            content: `Transcrição da reunião:\n\n${transcript}`,
          },
        ],
      }),
    });

    if (chatRes.ok) {
      const chatData = await chatRes.json() as { choices: Array<{ message: { content: string } }> };
      const raw = chatData.choices[0]?.message?.content ?? "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          decisions?: string[];
          nextSteps?: string[];
          topics?: Array<{ title: string; content: string }>;
          actionItems?: Array<{ task: string; responsible: string | null; deadline: string | null }>;
          keyHighlights?: string[];
        };
        summary = parsed.summary ?? "";
        decisions = parsed.decisions ?? [];
        nextSteps = parsed.nextSteps ?? [];
        // Store extra structured data in summary field as JSON prefix for UI
        const extra = {
          topics: parsed.topics ?? [],
          actionItems: parsed.actionItems ?? [],
          keyHighlights: parsed.keyHighlights ?? [],
        };
        // Prepend structured metadata as a JSON block separated by a sentinel
        summary = `__STRUCTURED__${JSON.stringify(extra)}__END__${summary}`;
      }
    }
  } catch {
    // summary generation is best-effort — transcript is still saved
  }

  const meeting = await prisma.meeting.update({
    where: { id },
    data: {
      transcript,
      summary,
      decisions,
      nextSteps,
      ...(duration !== undefined && { duration }),
    },
  });

  return NextResponse.json(meeting);
}
