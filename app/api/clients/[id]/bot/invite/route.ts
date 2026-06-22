import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-helpers";
import { makeInviteToken } from "@/lib/notifications/client-bot";

export const runtime = "nodejs";

// POST — gera um link de convite (t.me/<bot>?start=token). Quem entra só recebe
// os alertas (não tem acesso ao painel nem como alterar o bot).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await requireAuth("clients:update");
  if (error) return error;

  const link = await makeInviteToken(id);
  if (!link) return NextResponse.json({ error: "Conecte o bot do cliente antes de convidar." }, { status: 400 });
  return NextResponse.json({ link });
}
