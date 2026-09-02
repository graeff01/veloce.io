import { NextResponse } from "next/server";
import { manualAiReply, setAssignment } from "@/lib/ai-agent/respond";
import { guardPortal } from "@/lib/portal-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// POST — o cliente aciona a IA pra responder o lead a partir do portal (botão "IA responder").
// Token-scoped: manualAiReply confere que o contato é do próprio cliente. Respeita opt-out;
// se a IA não souber responder (é do vendedor), não envia nada e devolve erro amigável.
// AÇÃO COM EFEITO EXTERNO (gera com o modelo e ENVIA no WhatsApp do lead): exige sessão
// e tem cota de LLM. Antes bastava o link para disparar mensagens reais em nome da loja.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const { error, portal } = await guardPortal(req, token, { section: "conversas", cost: "llm" });
  if (error) return error;

  // DONO DA CONVERSA (fase 1): quem clica "IA Atender" vira a RESPONSÁVEL por este lead —
  // MAS só se a conversa ainda não tem dona. NÃO rouba de outra dona: a reatribuição/liberação
  // é só da própria dona ou do admin (endpoint /assign). Best-effort — não bloqueia a resposta.
  const email = portal.email;
  if (email) {
    const conv = await prisma.waConversation.findFirst({ where: { contactId }, select: { assignedEmail: true } });
    if (conv && !conv.assignedEmail) await setAssignment(portal.clientId, contactId, email).catch(() => {});
  }

  const r = await manualAiReply(portal.clientId, contactId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ reply: r.reply });
}
