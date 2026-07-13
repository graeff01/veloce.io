import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { isProtected, getPortalSessionEmail } from "@/lib/portal-auth";
import { runAgent } from "@/lib/ai-agent/orchestrator";
import type { ChatMessage } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TURNS = 30; // limita o tamanho da conversa de teste (custo de tokens)

// Flag "teste" ligada nas seções do portal? (token separado, ignorado por parseSections).
function aiTestOn(sections: string | null | undefined): boolean {
  return (sections ?? "").split(",").map((s) => s.trim()).includes("teste");
}

// POST { message, transcript } — SIMULA o atendimento da IA (mesmo pipeline da produção,
// modo "test": memória efêmera via transcript, ferramentas sem efeito colateral, e NÃO
// envia WhatsApp nem grava nada). Stateless: o cliente mantém o transcript e reenvia.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  // Login obrigatório (se o portal exige) + flag de teste habilitada.
  if ((await isProtected(portal.clientId)) && !(await getPortalSessionEmail(portal.clientId))) {
    return NextResponse.json({ error: "Faça login para testar a IA." }, { status: 401 });
  }
  const cp = await prisma.clientPortal.findUnique({ where: { clientId: portal.clientId }, select: { sections: true } });
  if (!aiTestOn(cp?.sections)) return NextResponse.json({ error: "Teste da IA não está habilitado." }, { status: 403 });

  const cfg = await prisma.aiAgentConfig.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
  if (!cfg) return NextResponse.json({ error: "A IA ainda não foi configurada para este cliente." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const message = String(body?.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Mensagem vazia." }, { status: 400 });
  if (message.length > 2000) return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400 });

  // Transcript vindo do cliente (histórico anterior) — saneado para ChatMessage[].
  const incoming = Array.isArray(body?.transcript) ? body.transcript : [];
  const transcript: ChatMessage[] = incoming
    .filter((m: unknown): m is { role: string; content: string } => !!m && typeof (m as { content?: unknown }).content === "string" && ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant"))
    .slice(-MAX_TURNS * 2)
    .map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content }));
  transcript.push({ role: "user", content: message });

  try {
    const out = await runAgent(
      { clientId: portal.clientId, connectionId: "portal-test", contact: { id: "portal-test", name: "Teste", waId: "portal-test" }, inboundText: message },
      { mode: "test", transcript },
    );
    return NextResponse.json({
      reply: out.reply,
      decision: out.decision,
      status: out.status,
      tools: (out.toolCalls ?? []).map((t) => t.name),
    });
  } catch {
    return NextResponse.json({ error: "Não consegui gerar a resposta agora. Tente de novo." }, { status: 500 });
  }
}
