import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { sendClientAlert, botMsg } from "@/lib/notifications/client-bot";

export const runtime = "nodejs";

// POST — envia um EXEMPLO REAL de alerta (formato novo) para os destinatários
// conectados, pra ver como fica no Telegram. Marca como teste no topo.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const tg = botMsg(
    "🧪 <i>exemplo</i>\n\n🚨 <b>Novo lead</b>",
    [
      "👤 João Silva · (51) 99999-9999",
      "📍 Campanha Meta — “Apês 2D Canoas”",
      "📋 Interesse: 2 dorm. · Orçamento: até R$ 450 mil",
      "💬 “Olá, tenho interesse em apê de 2 dormitórios.”",
    ],
    { label: "💬 Responder no WhatsApp →", url: "https://wa.me/5551999999999" },
  );
  const sent = await sendClientAlert(id, "novoLead", tg, { urgent: true });
  return NextResponse.json({ sent });
}
