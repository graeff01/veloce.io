import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { groqChat, extractJson, GroqError } from "@/lib/groq";

export const maxDuration = 60;

const STAGES = ["recebido", "respondido", "qualificado", "negociacao", "perdido", "convertido"] as const;

// POST — gera um resumo da conversa + sugere a etapa de funil (IA). Não altera
// nada no WhatsApp; apenas analisa o histórico já armazenado.
export async function POST(_: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const conn = await prisma.waConnection.findUnique({ where: { clientId: id } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const contact = await prisma.waContact.findFirst({ where: { id: contactId, connectionId: conn.id } });
  if (!contact) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

  const messages = await prisma.waMessage.findMany({
    where: { contactId: contact.id },
    orderBy: { timestamp: "asc" },
    take: 200,
    select: { direction: true, text: true, type: true },
  });
  if (messages.length === 0) return NextResponse.json({ error: "Sem mensagens para analisar" }, { status: 400 });

  // Monta o transcrito (Cliente = recebida, Loja = enviada)
  const transcript = messages
    .map((m) => `${m.direction === "out" ? "Loja" : "Cliente"}: ${m.text ?? `[${m.type}]`}`)
    .join("\n")
    .slice(0, 12000);

  try {
    const raw = await groqChat(
      `Você analisa conversas de WhatsApp entre uma concessionária de veículos e leads vindos de anúncios. Responda APENAS com JSON válido:
{
  "summary": "resumo objetivo da conversa em 2-3 frases (o que o lead quer, o que rolou)",
  "stage": "uma de: recebido | respondido | qualificado | negociacao | perdido | convertido",
  "reason": "1 frase curta justificando a etapa"
}
Critério da etapa: recebido (só chegou, sem resposta), respondido (loja respondeu mas sem avanço), qualificado (lead demonstrou interesse real/perfil), negociacao (discutindo preço/condições/visita), perdido (desistiu/sumiu/negou), convertido (fechou/comprou/agendou test drive firme). Não invente dados.`,
      `Conversa:\n\n${transcript}`,
      500,
    );

    const parsed = extractJson<{ summary?: string; stage?: string; reason?: string }>(raw);
    if (!parsed?.summary) return NextResponse.json({ error: "Resposta inválida da IA" }, { status: 502 });

    const stage = parsed.stage && (STAGES as readonly string[]).includes(parsed.stage) ? parsed.stage : null;
    const summary = parsed.reason ? `${parsed.summary}\n\n→ ${parsed.reason}` : parsed.summary;

    await prisma.waConversation.upsert({
      where: { contactId: contact.id },
      create: { connectionId: conn.id, contactId: contact.id, aiSummary: summary, aiSuggestedStage: stage, aiUpdatedAt: new Date() },
      update: { aiSummary: summary, aiSuggestedStage: stage, aiUpdatedAt: new Date() },
    });

    return NextResponse.json({ summary, suggestedStage: stage });
  } catch (e) {
    if (e instanceof GroqError) return NextResponse.json({ error: "IA indisponível no momento. Tente novamente." }, { status: 502 });
    return NextResponse.json({ error: "Erro ao gerar resumo" }, { status: 500 });
  }
}
