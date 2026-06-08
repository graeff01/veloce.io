import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";
import { z } from "zod";

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(4000),
  })).min(1).max(40),
});

// Console dry-run: MESMO motor (runAgent), em mode="test". Não envia WhatsApp,
// não grava visita/perfil, não loga métricas. Memória apenas no transcript enviado.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const transcript = parsed.data.messages as ChatMessage[];
  const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return NextResponse.json({ error: "Sem mensagem do usuário" }, { status: 400 });

  try {
    const out = await runAgent(
      {
        clientId: id, connectionId: "console",
        contact: { id: "console-test", name: "Teste", waId: "console" },
        inboundText: lastUser.content,
      },
      { mode: "test", transcript },
    );
    return NextResponse.json({ reply: out.reply, decision: out.decision, status: out.status, toolCalls: out.toolCalls ?? [] });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
