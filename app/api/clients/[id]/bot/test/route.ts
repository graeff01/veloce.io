import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { sendClientAlert } from "@/lib/notifications/client-bot";

export const runtime = "nodejs";

// POST — envia uma mensagem de teste para os destinatários conectados do cliente.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const tg = "🧪 <b>Teste</b>\nSe você recebeu isto, o bot está conectado e os alertas vão chegar aqui. ✅";
  const sent = await sendClientAlert(id, "novoLead", tg, { urgent: true });
  return NextResponse.json({ sent });
}
