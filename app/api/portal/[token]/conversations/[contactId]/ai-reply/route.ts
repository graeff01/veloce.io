import { NextResponse } from "next/server";
import { resolvePortal } from "@/lib/notifications/client-portal";
import { manualAiReply } from "@/lib/ai-agent/respond";

export const runtime = "nodejs";

// POST — o cliente aciona a IA pra responder o lead a partir do portal (botão "IA responder").
// Token-scoped: manualAiReply confere que o contato é do próprio cliente. Respeita opt-out;
// se a IA não souber responder (é do vendedor), não envia nada e devolve erro amigável.
export async function POST(_req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });
  const r = await manualAiReply(portal.clientId, contactId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ reply: r.reply });
}
