import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolvePortal } from "@/lib/notifications/client-portal";

export const runtime = "nodejs";

const STAGES = ["recebido", "respondido", "qualificado", "negociacao", "convertido", "perdido"];

// POST — cliente marca/move a etapa de um lead (ex.: "vendido"). Trava manual
// (funnelManual) pra o classificador automático não desfazer. Só toca o NOSSO funil
// (não envia nada no WhatsApp). Escopo por token.
export async function POST(req: Request, { params }: { params: Promise<{ token: string; contactId: string }> }) {
  const { token, contactId } = await params;
  const portal = await resolvePortal(token);
  if (!portal) return NextResponse.json({ error: "Link inválido" }, { status: 404 });

  const conn = await prisma.waConnection.findUnique({ where: { clientId: portal.clientId }, select: { id: true } });
  if (!conn) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const stage = body?.stage;
  if (!STAGES.includes(stage)) return NextResponse.json({ error: "Etapa inválida" }, { status: 400 });

  // Segurança: o contato precisa ser desta conexão (escopo por token).
  const contact = await prisma.waContact.findFirst({ where: { id: contactId, connectionId: conn.id }, select: { id: true } });
  if (!contact) return NextResponse.json({ error: "Lead não encontrado" }, { status: 404 });

  await prisma.waConversation.upsert({
    where: { contactId },
    create: { connectionId: conn.id, contactId, funnelStage: stage, funnelManual: true },
    update: { funnelStage: stage, funnelManual: true },
  });
  return NextResponse.json({ ok: true, stage });
}
