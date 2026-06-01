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

  // Generate summary via Groq chat
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
        model: "llama3-8b-8192",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente especialista em reuniões de agência de marketing. Analise a transcrição e responda APENAS com JSON válido no formato: {\"summary\": \"resumo em 2-3 frases\", \"decisions\": [\"decisão 1\", ...], \"nextSteps\": [\"próximo passo 1\", ...]}. Máximo 5 decisões e 5 próximos passos. Seja objetivo e direto.",
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
        const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; decisions?: string[]; nextSteps?: string[] };
        summary = parsed.summary ?? "";
        decisions = parsed.decisions ?? [];
        nextSteps = parsed.nextSteps ?? [];
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
