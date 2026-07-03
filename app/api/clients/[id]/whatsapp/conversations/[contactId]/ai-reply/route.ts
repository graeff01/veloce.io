import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { manualAiReply } from "@/lib/ai-agent/respond";

// Acionamento manual da IA numa conversa (botão "IA responder" no painel): a IA responde
// o que o lead perguntou, mesmo em horário comercial. Ignora gatekeeper; respeita opt-out.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const { id, contactId } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;
  const r = await manualAiReply(id, contactId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ reply: r.reply });
}
