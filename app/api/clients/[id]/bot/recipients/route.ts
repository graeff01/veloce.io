import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-helpers";
import { onlyDigits, sameBrazilNumber } from "@/lib/phone-br";

export const runtime = "nodejs";

// POST — cadastra o número do DONO (WhatsApp) que recebe alertas e usa os comandos.
// O bot fala pela LINHA DA LOJA; por isso o número do dono precisa ser DIFERENTE dela
// (não dá pra mandar mensagem pra própria linha que está enviando).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const waId = onlyDigits(String(body.waId ?? ""));
  if (waId.length < 12 || waId.length > 13) {
    return NextResponse.json({ error: "Número inválido. Use DDI+DDD+número, ex: 5551999998888." }, { status: 400 });
  }

  // Não pode ser a própria linha da loja (auto-mensagem — a Meta rejeita).
  const conn = await prisma.waConnection.findUnique({ where: { clientId: id }, select: { displayPhone: true } });
  if (conn?.displayPhone && sameBrazilNumber(conn.displayPhone, waId)) {
    return NextResponse.json({ error: "Esse é o número da própria loja. Use o WhatsApp PESSOAL do dono (diferente da linha que atende cliente)." }, { status: 400 });
  }

  const rec = await prisma.clientBotRecipient.upsert({
    where: { clientId_waId: { clientId: id, waId } },
    create: { clientId: id, channel: "whatsapp", waId, role: "dono", active: true },
    update: { active: true, channel: "whatsapp", role: "dono", mutedUntil: null },
  });
  return NextResponse.json({ ok: true, id: rec.id, waId });
}
